import { Command } from "commander";
import { ensureToolchain, commandExists, isGhAuthenticated } from "../project.js";
import { spinner, bold, dim, green, yellow } from "../ui.js";

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

const METADATA_URL =
    "https://gist.githubusercontent.com/ReinhardHatko/27415c91178d74196d7c1116d39056d5/raw/56e61d719251170828a80f12d34343a8617b9935/metadata.json";

/* @integration */
async function doQrLogin(): Promise<boolean> {
    const { createTerminalAdapter, renderQrCode } = await import("@polkadot-apps/terminal");
    type PairingStatus = import("@polkadot-apps/terminal").PairingStatus;
    type AttestationStatus = import("@polkadot-apps/terminal").AttestationStatus;

    const adapter = createTerminalAdapter({
        appId: "dot-cli",
        metadataUrl: METADATA_URL,
        endpoints: ["wss://paseo-people-next-rpc.polkadot.io"],
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
        const addr = "0x" + Buffer.from(session.remoteAccount.accountId).toString("hex");
        console.log(`  ${green("✔")} Authenticated`);
        console.log(`    ${dim("Address:")} ${addr}`);
        return true;
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
            console.log(`  ${green("✔")} Paired with mobile wallet`);
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

    let success = false;
    result.match(
        (session) => {
            if (session) {
                console.log();
                console.log(`  ${green("✔")} ${bold("Logged in successfully!")}`);
                success = true;
            } else {
                console.log(`  ${dim("Login cancelled.")}`);
            }
        },
        (error) => {
            console.log(`  ${dim("Login failed:")} ${error.message}`);
        },
    );

    // Wait for session to persist to disk before destroying
    if (success) {
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
    return success;
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
        if (!opts.skipAuth) {
            const authOk = await doQrLogin();
            if (!authOk) {
                process.exitCode = 1;
            }
        }

        console.log();
        console.log(`${green("✔")} ${bold("Setup complete")}`);
        console.log();
    });
