/**
 * Terminal Login Example
 *
 * Demonstrates QR code login with the Polkadot mobile app
 * using the SSO handshake protocol.
 *
 * Usage:
 *   pnpm --filter terminal-login-example start [endpoint]
 *
 * Examples:
 *   pnpm --filter terminal-login-example start
 *   pnpm --filter terminal-login-example start wss://pop3-testnet.parity-lab.parity.io/people
 *   pnpm --filter terminal-login-example start wss://people-paseo.ibp.network
 */

// Enable verbose logging from @polkadot-apps packages
process.env.POLKADOT_APPS_LOG = "info";

// Polyfill WebSocket for Node.js (polkadot-api ws-provider/web expects globalThis.WebSocket)
// polkadot-api calls `new WebSocket(url, protocol)` — ws needs followRedirects
// in the 3rd arg, but polkadot-api doesn't pass it, so we intercept via Proxy.
import { WebSocket as _WS } from "ws";
const WebSocket = new Proxy(_WS, {
    construct(target, args) {
        const [url, protocols, opts] = args;
        return new target(url, protocols, { followRedirects: true, ...opts });
    },
});
Object.assign(globalThis, { WebSocket });

import {
    startQrLogin,
    resumeSession,
    clearSession,
    renderQrCode,
    type QrLoginResult,
} from "@polkadot-apps/terminal";

const DEFAULT_ENDPOINT = "wss://paseo-people-next-rpc.polkadot.io";
const DEFAULT_METADATA_URL =
    "https://gist.githubusercontent.com/ReinhardHatko/27415c91178d74196d7c1116d39056d5/raw/56e61d719251170828a80f12d34343a8617b9935/metadata.json";

function showAccount(result: QrLoginResult): void {
    console.log();
    console.log("===================================");
    console.log("  Logged in successfully!");
    console.log("===================================");
    console.log();
    console.log(`  Address:    ${result.address}`);
    console.log(`  Name:       ${result.name ?? "(unnamed)"}`);
    console.log(`  Public Key: 0x${Buffer.from(result.publicKey).toString("hex").slice(0, 16)}...`);
    console.log(`  Session:    ${result.sessionId.slice(0, 12)}...`);
    console.log();
}

async function main(): Promise<void> {
    const endpoint = process.argv[2] || DEFAULT_ENDPOINT;

    console.log();
    console.log("  Terminal Login Example");
    console.log("  ~~~~~~~~~~~~~~~~~~~~~");
    console.log();
    console.log(`  Endpoint: ${endpoint}`);
    console.log();

    // Check for existing session
    const existing = await resumeSession();
    if (existing) {
        console.log("  Found existing session.");
        showAccount(existing);

        console.log("  Press Ctrl+C to exit, or wait 3s to re-login...");
        await new Promise((r) => setTimeout(r, 3000));
        await clearSession();
        console.log("  Session cleared. Starting fresh login...");
        console.log();
    }

    // Start QR login
    console.log("  Scan the QR code below with the Polkadot mobile app.");
    console.log("  (timeout: 2 minutes)");
    console.log();

    const controller = await startQrLogin({
        metadataUrl: DEFAULT_METADATA_URL,
        endpoints: [endpoint],
        timeoutMs: 120_000,
    });

    // Render QR code
    const qr = await renderQrCode(controller.pairingUri);
    console.log(qr);
    console.log(`  Session: ${controller.sessionId.slice(0, 12)}...`);
    console.log();
    console.log("  Waiting for pairing response...");

    // Handle Ctrl+C
    process.on("SIGINT", () => {
        console.log("\n  Cancelled.");
        controller.destroy();
        process.exit(0);
    });

    try {
        const result = await controller.result;
        showAccount(result);
    } catch (err) {
        if (err instanceof Error) {
            console.error(`\n  Login failed: ${err.message}`);
        }
        controller.destroy();
        process.exit(1);
    }

    controller.destroy();
    process.exit(0);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
