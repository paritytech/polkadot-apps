import { Command } from "commander";
import { ss58Encode } from "@polkadot-apps/address";
import { getChainAPI } from "@polkadot-apps/chain-client";
import {
    createTerminalAdapter,
    renderQrCode,
    createSessionSigner,
    DEFAULT_METADATA_URL,
    DEFAULT_PEOPLE_ENDPOINTS,
} from "@polkadot-apps/terminal";
import type { PairingStatus, AttestationStatus } from "@polkadot-apps/terminal";
import { formatBalance } from "@polkadot-apps/utils";
import { ensureToolchain, commandExists, isGhAuthenticated } from "../project.js";
import { spinner, bold, dim, green, red, yellow } from "../ui.js";
import {
    fetchAccountStatus,
    needsFunding,
    fundFromAlice,
    mapAccount,
    grantBulletinAllowance,
    FUND_AMOUNT,
    BULLETIN_TRANSACTIONS,
    BULLETIN_BYTES,
} from "../utils/account-handler.js";

if (import.meta.vitest) {
    const { test, expect, describe } = import.meta.vitest;

    describe("commandExists", () => {
        test("returns true for common commands", () => {
            expect(commandExists("node")).toBe(true);
            expect(commandExists("git")).toBe(true);
        });
        test("returns false for nonexistent commands", () => {
            expect(commandExists("definitely-not-a-real-command-xyz")).toBe(false);
        });
    });

    describe("isGhAuthenticated", () => {
        test("returns a boolean", () => {
            expect(typeof isGhAuthenticated()).toBe("boolean");
        });
    });
}

// ---------------------------------------------------------------------------
// QR Login
// ---------------------------------------------------------------------------

/* @integration */
async function doQrLogin(): Promise<string | null> {
    const adapter = createTerminalAdapter({
        appId: "dot-cli",
        metadataUrl: DEFAULT_METADATA_URL,
        endpoints: DEFAULT_PEOPLE_ENDPOINTS,
    });

    // Check for existing session
    // Wait for sessions to load from disk — first emission is often empty
    const existingSessions = await new Promise<any[]>((resolve) => {
        let resolved = false;
        let unsub: (() => void) | null = null;
        unsub = adapter.sessions.sessions.subscribe((sessions) => {
            if (resolved) return;
            if (sessions.length > 0) {
                resolved = true;
                queueMicrotask(() => unsub?.());
                resolve(sessions);
            }
        });
        // If no sessions arrive within 3s, assume none exist
        setTimeout(() => {
            if (resolved) return;
            resolved = true;
            unsub?.();
            resolve([]);
        }, 3000);
    });

    if (existingSessions.length > 0) {
        const session = existingSessions[0];
        const pubkey = new Uint8Array(session.remoteAccount.accountId);
        const ss58 = ss58Encode(pubkey);
        console.log(`  ${green("✔")} Authenticated`);
        console.log(`    ${dim("Address:")} ${ss58}`);
        return ss58;
    }

    // No existing session — start QR pairing
    console.log();
    console.log(`  ${bold("Scan with the Polkadot mobile app to log in:")}`);
    console.log();

    let qrShown = false;
    const unsubPairing = adapter.sso.pairingStatus.subscribe((status: PairingStatus) => {
        if (status.step === "pairing" && !qrShown) {
            qrShown = true;
            renderQrCode(status.payload).then((qr) => {
                console.log(qr);
            });
        } else if (status.step === "finished") {
            console.log(`  ${green("✔")} Paired with Polkadot App`);
        } else if (status.step === "pairingError") {
            console.log(`  ${dim("Pairing error:")} ${status.message}`);
        }
    });

    const unsubAttestation = adapter.sso.attestationStatus.subscribe(
        (status: AttestationStatus) => {
            if (status.step === "attestation") {
                const s = spinner("Attestation", `Registering on-chain (${status.username})...`);
                // Store spinner ref for cleanup — attestation can take a while
                (adapter as any)._attestSpinner = s;
            } else if (status.step === "finished") {
                (adapter as any)._attestSpinner?.succeed("Attestation complete");
            } else if (status.step === "attestationError") {
                (adapter as any)._attestSpinner?.fail(`Attestation failed: ${status.message}`);
            }
        },
    );

    const result = await adapter.sso.authenticate();

    unsubPairing();
    unsubAttestation();

    let address: string | null = null;
    result.match(
        (session) => {
            if (session) {
                const pubkey = new Uint8Array(session.remoteAccount.accountId);
                address = ss58Encode(pubkey);
                console.log();
                console.log(`  ${green("✔")} ${bold("Logged in successfully!")}`);
            } else {
                console.log(`  ${dim("Login cancelled.")}`);
            }
        },
        (error) => {
            console.log(`  ${dim("Login failed:")} ${error.message}`);
        },
    );

    // Wait for session to persist to disk before destroying
    if (address) {
        await new Promise<void>((resolve) => {
            let resolved = false;
            let unsub: (() => void) | null = null;
            unsub = adapter.sessions.sessions.subscribe((sessions) => {
                if (sessions.length > 0 && !resolved) {
                    resolved = true;
                    // Defer unsubscribe — callback may fire synchronously before unsub is assigned
                    queueMicrotask(() => unsub?.());
                    resolve();
                }
            });
            if (resolved) return; // Already resolved synchronously
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    unsub?.();
                    resolve();
                }
            }, 3000);
        });
    }

    // Note: adapter.destroy() has a bug where it disconnects the WebSocket
    // before unsubscribing statement store listeners, causing async
    // DestroyedError noise. Skip it — process.exit in the caller cleans up.
    return address;
}

// ---------------------------------------------------------------------------
// Account Setup
// ---------------------------------------------------------------------------

/* @integration */
async function ensureAccountFunded(address: string): Promise<void> {
    const s = spinner("Account", "Fetching account status...");

    let client;
    try {
        client = await getChainAPI("paseo");
        const { balance, mapped, auth } = await fetchAccountStatus(client, address);

        s.succeed("Account status");

        // ── Display ──────────────────────────────────────────────────
        console.log(`  Address     ${bold(address)}`);
        console.log(
            `  Asset Hub   ${balance.free > 0n ? green(formatBalance(balance.free, { symbol: "PAS", maxDecimals: 4 })) : red("0 PAS")}`,
        );
        console.log(`  Mapped      ${mapped ? green("yes") : red("no")}`);
        if (auth.authorized) {
            const mb = (Number(auth.remainingBytes) / 1_000_000).toFixed(1);
            console.log(
                `  Bulletin    ${green(`${auth.remainingTransactions} txns`)}  ${green(`${mb} MB`)}`,
            );
        } else {
            console.log(`  Bulletin    ${dim("no allowance")}`);
        }

        // ── Fund if needed ───────────────────────────────────────────
        if (needsFunding(balance)) {
            console.log();
            const fundSpinner = spinner(
                "Fund",
                `Transferring ${formatBalance(FUND_AMOUNT, { symbol: "PAS" })} from Alice...`,
            );
            try {
                await fundFromAlice(client, address);
                fundSpinner.succeed(
                    `Funded ${formatBalance(FUND_AMOUNT, { symbol: "PAS" })}`,
                );
            } catch (err) {
                fundSpinner.fail("Failed to fund account");
                console.log(`    ${dim(String(err))}`);
                return;
            }
        }

        // ── Map if needed ────────────────────────────────────────────
        if (!mapped) {
            console.log();
            const mapSpinner = spinner("Map", "Mapping account for Revive pallet...");
            try {
                await mapAccount(client, address);
                mapSpinner.succeed("Account mapped");
            } catch (err) {
                mapSpinner.fail("Failed to map account");
                console.log(`    ${dim(String(err))}`);
            }
        }

        // ── Bulletin allowance if needed ─────────────────────────────
        if (!auth.authorized) {
            console.log();
            const blSpinner = spinner("Bulletin", "Granting bulletin allowance from Alice...");
            try {
                await grantBulletinAllowance(client, address);
                const mb = (Number(BULLETIN_BYTES) / 1_000_000).toFixed(0);
                blSpinner.succeed(`Authorized — ${BULLETIN_TRANSACTIONS} txns, ${mb} MB`);
            } catch (err) {
                blSpinner.fail("Failed to grant bulletin allowance");
                console.log(`    ${dim(String(err))}`);
            }
        }
    } catch (err) {
        s.fail("Failed to fetch account status");
        console.log(`    ${dim(String(err))}`);
    } finally {
        client?.destroy();
    }
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

/* @integration */
export const initCommand = new Command("init")
    .description("Set up your development environment and authenticate")
    .option("--skip-toolchain", "Skip Rust toolchain setup")
    .option("--skip-auth", "Skip authentication")
    .action(async (opts) => {
        console.log();
        console.log(`  ${bold("dot init")} — Setting up your development environment`);
        console.log();

        // ── Step 1: Toolchain ────────────────────────────────────────
        if (!opts.skipToolchain) {
            let activeSpinner: ReturnType<typeof spinner> | null = null;

            ensureToolchain({
                verbose: true,
                onStep: (name, status, msg) => {
                    if (status === "ok") {
                        activeSpinner?.succeed(msg ?? name);
                        activeSpinner = null;
                        if (!msg) console.log(`  ${green("✔")} ${name}`);
                    } else if (status === "installing") {
                        activeSpinner = spinner(name, msg ?? `Installing ${name}...`);
                    } else if (status === "failed") {
                        activeSpinner?.fail(msg ?? `Failed to install ${name}`);
                        activeSpinner = null;
                    }
                },
            });

            // GitHub CLI check (advisory, not auto-installed)
            if (!commandExists("gh")) {
                console.log(`  ${yellow("!")} GitHub CLI not found`);
                console.log(`    ${dim("Install: https://cli.github.com")}`);
            } else if (!isGhAuthenticated()) {
                console.log(`  ${yellow("!")} GitHub CLI not authenticated`);
                console.log(`    ${dim("Run: gh auth login")}`);
            } else {
                console.log(`  ${green("✔")} GitHub CLI`);
            }
        }

        // ── Step 2: QR Authentication ─────────────────────────────────
        let address: string | null = null;
        if (!opts.skipAuth) {
            address = await doQrLogin();
            if (!address) {
                process.exitCode = 1;
            }
        }

        // ── Step 3: Account Status ───────────────────────────────────
        // if (address) { TEMPORARILY DISABLE
        if (false) {
            console.log();
            await ensureAccountFunded(address);
        }

        console.log();
        console.log(`${green("✔")} ${bold("Setup complete")}`);
        console.log();
        process.exit(process.exitCode ?? 0);
    });
