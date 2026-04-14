// WebSocket polyfill for Node.js / Bun (required by host-papp SDK).
// Loaded once in index.ts before any command imports.
import { WebSocket as _WS } from "ws";

if (!globalThis.WebSocket) {
    const WebSocket = new Proxy(_WS, {
        construct(target, args) {
            const [url, protocols, opts] = args;
            return new target(url, protocols, { followRedirects: true, ...opts });
        },
    });
    Object.assign(globalThis, { WebSocket });
}
