/**
 * Quick test: can the login example actually connect and subscribe?
 */
process.env.POLKADOT_APPS_LOG = "debug";

import { WebSocket as _WS } from "ws";
const WebSocket = new Proxy(_WS, {
    construct(target, args) {
        const [url, protocols, opts] = args;
        return new target(url, protocols, { followRedirects: true, ...opts });
    },
});
Object.assign(globalThis, { WebSocket });

import { startQrLogin } from "@polkadot-apps/terminal";

console.log("Starting QR login (10s timeout)...\n");

try {
    const ctrl = await startQrLogin({ timeoutMs: 10_000 });
    console.log("\nPairing URI:", ctrl.pairingUri.slice(0, 60) + "...");
    console.log("Session ID:", ctrl.sessionId.slice(0, 16) + "...");
    console.log("\nWaiting 10s for statements...\n");

    ctrl.result.then(
        (r) => { console.log("SUCCESS:", r.address); ctrl.destroy(); process.exit(0); },
        (e) => { console.log("TIMEOUT/ERROR:", e.message); ctrl.destroy(); process.exit(0); },
    );
} catch (e) {
    console.error("Failed to start:", e instanceof Error ? e.message : e);
    process.exit(1);
}
