import type { ChainDefinition, PolkadotClient } from "polkadot-api";

/** Fallback strategy override. Controls which standalone provider is built. */
export type ConnectionMode = "rpc" | "lightclient";

/** Connection metadata for a chain, keyed by genesis hash in the registry. */
export interface ChainMeta {
    rpcs?: readonly string[];
    relayChainSpec?: string;
    paraChainSpec?: string;
    mode?: ConnectionMode;
}

/** Internal per-chain state stored in the HMR-safe cache. */
export interface ChainEntry {
    client: PolkadotClient;
    api: Map<ChainDefinition, unknown>;
    contractSdk: unknown | null;
    initPromise: Promise<void> | null;
}
