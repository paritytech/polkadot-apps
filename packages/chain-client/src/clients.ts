import type { ChainDefinition, PolkadotClient, TypedApi } from "polkadot-api";
import { getClientCache, clearClientCache } from "./hmr.js";

function extractGenesis(descriptor: ChainDefinition): string {
    const genesis = descriptor.genesis;
    if (!genesis) {
        throw new Error(
            "Descriptor has no genesis hash. " +
                "Upgrade polkadot-api (run `papi add` again).",
        );
    }
    return genesis;
}

/**
 * Get a fully typed PAPI API for a chain that is already connected via getChains().
 *
 * For the primary workflow, use getChains("paseo") instead.
 * This is useful when you have a different descriptor for an already-connected chain.
 */
export function getTypedApi<D extends ChainDefinition>(descriptor: D): TypedApi<D> {
    const genesis = extractGenesis(descriptor);
    const cache = getClientCache();

    const entry = cache.get(genesis);
    if (!entry?.client) {
        throw new Error(
            `Chain not connected (genesis: ${genesis}). ` +
                `Call getChains() first to establish connections.`,
        );
    }

    // Return cached api if available for this descriptor
    if (entry.api.has(descriptor)) {
        return entry.api.get(descriptor) as TypedApi<D>;
    }

    // Create and cache for this descriptor
    const api = entry.client.getTypedApi(descriptor);
    entry.api.set(descriptor, api);
    return api;
}

/**
 * Get the raw PolkadotClient for a connected chain.
 */
export function getClient(descriptor: ChainDefinition): PolkadotClient {
    const genesis = extractGenesis(descriptor);
    const entry = getClientCache().get(genesis);
    if (!entry?.client) {
        throw new Error(
            `Chain not connected (genesis: ${genesis}). ` +
                `Call getChains() first to establish connections.`,
        );
    }
    return entry.client;
}

/**
 * Get a contract SDK instance for a connected chain.
 * Dynamically imports @polkadot-api/sdk-ink — zero cost if never called.
 * Cached per chain.
 */
export async function getContractSdk(descriptor: ChainDefinition): Promise<unknown> {
    const genesis = extractGenesis(descriptor);
    const cache = getClientCache();
    const entry = cache.get(genesis);

    if (entry?.contractSdk) return entry.contractSdk;

    const client = getClient(descriptor);
    const { createInkSdk } = await import("@polkadot-api/sdk-ink");
    const sdk = createInkSdk(client, { atBest: true });

    const cached = cache.get(genesis)!;
    cached.contractSdk = sdk;
    return sdk;
}

/**
 * Check if a chain is currently connected.
 * Sync — no side effects, no initialization.
 */
export function isConnected(descriptor: ChainDefinition): boolean {
    const genesis = descriptor.genesis;
    if (!genesis) return false;
    return getClientCache().has(genesis);
}

/**
 * Destroy the client for a single chain.
 */
export function destroy(descriptor: ChainDefinition): void {
    const genesis = extractGenesis(descriptor);
    const cache = getClientCache();
    const entry = cache.get(genesis);
    if (entry) {
        try {
            entry.client.destroy();
        } catch {
            // client may already be destroyed
        }
        cache.delete(genesis);
    }
}
