/**
 * Test: what does polkadot-api's _request actually do with statement_subscribeStatement?
 * Log ALL WebSocket messages to see what's happening.
 */
import { WebSocket as _WS } from "ws";

const allMessages: string[] = [];

Object.defineProperty(globalThis, "WebSocket", {
    value: class WebSocket extends _WS {
        constructor(url: string | URL, protocols?: string | string[]) {
            super(url, protocols, { followRedirects: true } as any);
            const origSend = this.send.bind(this);
            this.send = (data: any, ...args: any[]) => {
                console.log("[WS SEND]", typeof data === "string" ? data.slice(0, 200) : "(binary)");
                return origSend(data, ...args);
            };
            this.on("message", (data: any) => {
                const msg = data.toString().slice(0, 200);
                allMessages.push(msg);
                console.log("[WS RECV]", msg);
            });
            this.on("open", () => console.log("[WS] open"));
            this.on("error", (e: Error) => console.log("[WS] error:", e.message));
            this.on("close", (code: number) => console.log("[WS] close:", code));
        }
    },
    writable: true,
    configurable: true,
});

import { startQrLogin } from "@polkadot-apps/terminal";

console.log("Starting (5s timeout)...\n");
const ctrl = await startQrLogin({ timeoutMs: 5_000 });
console.log("\nWaiting...\n");
ctrl.result.catch(() => {});
setTimeout(() => {
    console.log("\n--- Summary ---");
    console.log("Total WS messages:", allMessages.length);
    ctrl.destroy();
    process.exit(0);
}, 5_000);
