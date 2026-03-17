import { resetRegistry } from "./registry.js";
import { clearClientCache } from "./hmr.js";

/**
 * Reset all chain-client state. For use in tests only.
 * Destroys all active clients and restores the registry to well-known defaults.
 *
 * Usage:
 * ```ts
 * import { reset } from "@polkadot-apps/chain-client/testing";
 * beforeEach(() => reset());
 * ```
 */
export function reset(): void {
    clearClientCache();
    resetRegistry();
}
