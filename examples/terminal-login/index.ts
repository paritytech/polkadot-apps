/**
 * Terminal Login + Signing Example
 *
 * Demonstrates QR code login with the Polkadot mobile app followed by
 * interactive signing via the paired wallet, using the host-papp SDK.
 *
 * Usage:
 *   pnpm --filter terminal-login-example start
 */

import * as readline from "node:readline";
import {
    createTerminalAdapter,
    renderQrCode,
    waitForSessions,
    DEFAULT_METADATA_URL,
    type PappAdapter,
    type PairingStatus,
    type AttestationStatus,
} from "@polkadot-apps/terminal";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function prompt(question: string): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

function toHex(bytes: Uint8Array): string {
    return "0x" + Buffer.from(bytes).toString("hex");
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const endpoint = process.argv[2] || "wss://paseo-people-next-rpc.polkadot.io";

    console.log();
    console.log("  Terminal Login + Signing Example");
    console.log("  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
    console.log();
    console.log(`  Endpoint: ${endpoint}`);
    console.log();

    const adapter = createTerminalAdapter({
        appId: "terminal-login-example",
        metadataUrl: DEFAULT_METADATA_URL,
        endpoints: [endpoint],
    });

    // Wait for sessions to load from disk
    const existingSessions = await waitForSessions(adapter, 2000);

    if (existingSessions.length > 0) {
        const session = existingSessions[0];
        console.log("  Found existing session.");
        console.log(`  Address: ${toHex(session.remoteAccount.accountId)}`);
        console.log();
    }

    // Interactive loop
    let running = true;
    process.on("SIGINT", () => {
        running = false;
        console.log("\n  Bye!");
        process.exit(0);
    });

    while (running) {
        const sessions = adapter.sessions.sessions.read();
        const hasSession = sessions.length > 0;

        console.log();
        console.log("  ┌─────────────────────────────────┐");
        console.log("  │  What would you like to do?      │");
        console.log("  │                                   │");
        if (hasSession) {
            console.log("  │  1. Sign a raw message            │");
            console.log("  │  2. Re-login (new QR pairing)     │");
            console.log("  │  3. Disconnect & exit             │");
            console.log("  │  4. Exit                          │");
        } else {
            console.log("  │  1. Login (QR pairing)            │");
            console.log("  │  2. Exit                          │");
        }
        console.log("  └─────────────────────────────────┘");
        console.log();

        const choice = await prompt(hasSession ? "  Choice [1-4]: " : "  Choice [1-2]: ");

        try {
            if (hasSession) {
                const session = sessions[0];
                switch (choice) {
                    case "1":
                        await signRawMessage(session);
                        break;
                    case "2":
                        await adapter.sessions.disconnect(session);
                        await doLogin(adapter);
                        break;
                    case "3":
                        await adapter.sessions.disconnect(session);
                        process.exit(0);
                        break;
                    case "4":
                        process.exit(0);
                        break;
                    default:
                        console.log("  Invalid choice.");
                }
            } else {
                switch (choice) {
                    case "1":
                        await doLogin(adapter);
                        break;
                    case "2":
                        process.exit(0);
                        break;
                    default:
                        console.log("  Invalid choice.");
                }
            }
        } catch (err) {
            console.error(`  Error: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}

// ─── Login ───────────────────────────────────────────────────────────────────

async function doLogin(adapter: PappAdapter): Promise<void> {
    console.log("  Starting QR login + attestation...");
    console.log();

    let qrShown = false;
    const unsubPairing = adapter.sso.pairingStatus.subscribe((status: PairingStatus) => {
        if (status.step === "pairing" && !qrShown) {
            qrShown = true;
            renderQrCode(status.payload).then((qr) => {
                console.log(qr);
                console.log("  Scan with the Polkadot mobile app...");
                console.log();
            });
        } else if (status.step === "finished") {
            console.log("  Pairing successful!");
        } else if (status.step === "pairingError") {
            console.log(`  Pairing error: ${status.message}`);
        }
    });

    const unsubAttestation = adapter.sso.attestationStatus.subscribe((status: AttestationStatus) => {
        if (status.step === "attestation") {
            console.log(`  Attesting account (username: ${status.username})...`);
        } else if (status.step === "finished") {
            console.log("  Attestation complete!");
        } else if (status.step === "attestationError") {
            console.log(`  Attestation error: ${status.message}`);
        }
    });

    const result = await adapter.sso.authenticate();

    unsubPairing();
    unsubAttestation();

    result.match(
        (session) => {
            if (session) {
                console.log();
                console.log("  ===================================");
                console.log("  Logged in successfully!");
                console.log("  ===================================");
                console.log();
            } else {
                console.log("  Login cancelled.");
            }
        },
        (error) => {
            console.error(`  Login failed: ${error.message}`);
        },
    );
}

// ─── Signing ─────────────────────────────────────────────────────────────────

async function signRawMessage(session: any): Promise<void> {
    const message = await prompt("  Enter a message to sign (or press Enter for default): ");
    const text = message || "Hello from polkadot-apps terminal!";

    console.log();
    console.log(`  Signing: "${text}"`);
    console.log("  Approve on your phone...");

    const result = await session.signRaw({
        address: toHex(session.remoteAccount.accountId),
        data: { tag: "Bytes", value: new TextEncoder().encode(text) },
    });

    result.match(
        (data: any) => {
            console.log();
            console.log("  Signature received!");
            console.log(`  ${toHex(data.signature)}`);
            console.log();
        },
        (error: Error) => {
            console.error(`  Signing failed: ${error.message}`);
        },
    );
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
