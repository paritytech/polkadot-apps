import { Command } from "commander";
import { execSync } from "node:child_process";
import { spinner, bold, dim, green, yellow } from "../ui.js";

// WebSocket polyfill for Node.js (required by host-papp SDK)
import { WebSocket as _WS } from "ws";
const WebSocket = new Proxy(_WS, {
    construct(target, args) {
        const [url, protocols, opts] = args;
        return new target(url, protocols, { followRedirects: true, ...opts });
    },
});
Object.assign(globalThis, { WebSocket });

function commandExists(cmd: string): boolean {
    try {
        execSync(`command -v ${cmd}`, { stdio: "pipe" });
        return true;
    } catch {
        return false;
    }
}

function isGhAuthenticated(): boolean {
    try {
        execSync("gh auth status", { stdio: "pipe" });
        return true;
    } catch {
        return false;
    }
}

function hasRustNightly(): boolean {
    try {
        const out = execSync("rustup toolchain list", { encoding: "utf-8", stdio: "pipe" });
        return out.includes("nightly");
    } catch {
        return false;
    }
}

function hasRustSrc(): boolean {
    try {
        const out = execSync("rustup component list --toolchain nightly", {
            encoding: "utf-8",
            stdio: "pipe",
        });
        return out.includes("rust-src (installed)");
    } catch {
        return false;
    }
}

function hasCdm(): boolean {
    return commandExists("cdm") && commandExists("cargo-pvm-contract");
}

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

    describe("hasRustNightly", () => {
        test("returns a boolean", () => {
            expect(typeof hasRustNightly()).toBe("boolean");
        });
    });

    describe("hasRustSrc", () => {
        test("returns a boolean", () => {
            expect(typeof hasRustSrc()).toBe("boolean");
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
        process.exit(0);
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

    // Session persisted, just exit. adapter.destroy() has a bug where it
    // disconnects the WebSocket before unsubscribing statement store listeners,
    // causing async DestroyedError noise. Skip it — process.exit cleans up.
    process.exit(success ? 0 : 1);
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

        // ── Step 1: Rust toolchain ────────────────────────────────────
        if (!opts.skipToolchain) {
            if (!commandExists("rustup")) {
                const s = spinner("Rust", "Installing rustup...");
                try {
                    execSync(
                        'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y',
                        { stdio: "pipe", shell: "/bin/bash" },
                    );
                    s.succeed("rustup installed");
                } catch {
                    s.fail("Failed to install rustup");
                    console.log(`    ${dim("Install manually: https://rustup.rs")}`);
                }
            } else {
                console.log(`  ${green("✔")} rustup`);
            }

            if (!hasRustNightly()) {
                const s = spinner("Rust", "Installing nightly toolchain...");
                try {
                    execSync("rustup toolchain install nightly", { stdio: "pipe" });
                    s.succeed("Rust nightly installed");
                } catch {
                    s.fail("Failed to install Rust nightly");
                }
            } else {
                console.log(`  ${green("✔")} Rust nightly`);
            }

            if (!hasRustSrc()) {
                const s = spinner("Rust", "Installing rust-src...");
                try {
                    execSync("rustup component add rust-src --toolchain nightly", {
                        stdio: "pipe",
                    });
                    s.succeed("rust-src installed");
                } catch {
                    s.fail("Failed to install rust-src");
                }
            } else {
                console.log(`  ${green("✔")} rust-src`);
            }

            if (!hasCdm()) {
                const s = spinner("CDM", "Installing cdm & cargo-pvm-contract...");
                try {
                    execSync(
                        'curl -fsSL https://raw.githubusercontent.com/paritytech/contract-dependency-manager/main/install.sh | bash',
                        { stdio: "pipe", shell: "/bin/bash" },
                    );
                    s.succeed("cdm & cargo-pvm-contract installed");
                } catch {
                    s.fail("Failed to install cdm");
                    console.log(`    ${dim("Install manually: curl -fsSL https://raw.githubusercontent.com/paritytech/contract-dependency-manager/main/install.sh | bash")}`);
                }
            } else {
                console.log(`  ${green("✔")} cdm & cargo-pvm-contract`);
            }

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
            await doQrLogin();
        }

        console.log();
        console.log(`${green("✔")} ${bold("Setup complete")}`);
        console.log();
    });
