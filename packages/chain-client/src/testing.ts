import { destroyAll } from "./clients.js";

/**
 * Reset all chain-client state. For use in tests only.
 * Destroys all active clients and clears caches.
 *
 * Usage:
 * ```ts
 * import { reset } from "@polkadot-apps/chain-client/testing";
 * beforeEach(() => reset());
 * ```
 */
export function reset(): void {
    destroyAll();
}
