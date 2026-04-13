// Core BYOD API — zero descriptor overhead
export { createChainClient, destroyAll, getClient, isConnected } from "./clients.js";

// Preset API — built-in descriptors + RPCs for known environments
export { getChainAPI } from "./presets.js";

// Types
export type { ChainClient, ChainClientConfig, ChainMeta, ConnectionMode } from "./types.js";
export type { Environment, PresetChains } from "./presets.js";

// Re-export from host
export { isInsideContainer, isInsideContainerSync } from "@polkadot-apps/host";
