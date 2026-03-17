// Primary API — environment-based typed chains
export { getChains, destroyAll } from "./chains.js";
export type { Environment, Chains } from "./chains.js";

// Utilities for connected chains
export {
    getTypedApi,
    getClient,
    getContractSdk,
    isConnected,
    destroy,
} from "./clients.js";
export { isInsideContainer } from "./container.js";
export type { ChainMeta, ConnectionMode } from "./types.js";
