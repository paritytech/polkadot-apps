/**
 * Shared chain network configuration — single source of truth for
 * chain-specific endpoints used by multiple packages.
 */

/** Bulletin chain RPC endpoints by environment. */
export const BULLETIN_RPCS = {
    paseo: ["wss://paseo-bulletin-rpc.polkadot.io"],
    polkadot: [] as string[],
    kusama: [] as string[],
} as const;

/** Default bulletin endpoint (first paseo endpoint). */
export const DEFAULT_BULLETIN_ENDPOINT: string = BULLETIN_RPCS.paseo[0];
