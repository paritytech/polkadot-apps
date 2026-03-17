// Primary API — environment-based typed chain API
export { getChainAPI, destroyAll } from "./chain-api.js";
export type { Environment, ChainAPI } from "./chain-api.js";

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
