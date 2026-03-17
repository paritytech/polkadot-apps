import type { ChainDefinition, PolkadotClient, TypedApi } from "polkadot-api";
import { createClient } from "polkadot-api";
import { getClientCache, clearClientCache } from "./hmr.js";
import { getChainMeta } from "./registry.js";
import { createProvider } from "./providers.js";
import type { ChainEntry } from "./types.js";

function extractGenesis(descriptor: ChainDefinition): string {
    const genesis = descriptor.genesis;
    if (!genesis) {
        throw new Error(
            "Descriptor has no genesis hash. " +
                "Upgrade polkadot-api (run `papi add` again) or use registerChain() for this chain.",
        );
    }
    return genesis;
}

/**
 * Get a fully typed PAPI API for a chain.
 *
 * Lazily initializes a singleton client per genesis hash.
 * Reads connection details from the built-in well-known registry,
 * or from metadata added via registerChain().
 */
export async function getTypedApi<D extends ChainDefinition>(descriptor: D): Promise<TypedApi<D>> {
    const genesis = extractGenesis(descriptor);
    const cache = getClientCache();

    // Return cached api if available
    const existing = cache.get(genesis);
    if (existing?.api.has(descriptor)) {
        return existing.api.get(descriptor) as TypedApi<D>;
    }

    // If init is in flight, wait for it then return api
    if (existing?.initPromise) {
        await existing.initPromise;
        if (existing.api.has(descriptor)) {
            return existing.api.get(descriptor) as TypedApi<D>;
        }
        // Client exists but this descriptor hasn't been used yet
        const api = existing.client.getTypedApi(descriptor);
        existing.api.set(descriptor, api);
        return api;
    }

    // If client exists but no initPromise (already resolved), create api
    if (existing?.client) {
        const api = existing.client.getTypedApi(descriptor);
        existing.api.set(descriptor, api);
        return api;
    }

    // New chain — initialize
    const meta = getChainMeta(genesis);
    if (!meta) {
        throw new Error(
            `Unknown chain (genesis: ${genesis}). ` +
                `Call registerChain("${genesis}", { rpcs: [...] }) to add connection details.`,
        );
    }

    const entry: ChainEntry = {
        client: null!,
        api: new Map(),
        contractSdk: null,
        initPromise: null,
    };

    // Set initPromise SYNCHRONOUSLY before any await to prevent
    // React StrictMode double-effects and concurrent callers from duplicating.
    entry.initPromise = (async () => {
        const provider = await createProvider(genesis, meta);
        entry.client = createClient(provider);
    })();
    cache.set(genesis, entry);

    await entry.initPromise;
    entry.initPromise = null;

    const api = entry.client.getTypedApi(descriptor);
    entry.api.set(descriptor, api);
    return api;
}

/**
 * Get the raw PolkadotClient for a chain.
 * Triggers lazy initialization if not yet connected.
 */
export async function getClient(descriptor: ChainDefinition): Promise<PolkadotClient> {
    await getTypedApi(descriptor);
    const genesis = extractGenesis(descriptor);
    return getClientCache().get(genesis)!.client;
}

/**
 * Get a contract SDK instance for a chain.
 * Dynamically imports @polkadot-api/sdk-ink — zero cost if never called.
 * Cached per chain.
 */
export async function getContractSdk(descriptor: ChainDefinition): Promise<unknown> {
    const genesis = extractGenesis(descriptor);
    const cache = getClientCache();
    const entry = cache.get(genesis);

    if (entry?.contractSdk) return entry.contractSdk;

    const client = await getClient(descriptor);
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

/**
 * Destroy all chain clients. Use for app shutdown.
 */
export function destroyAll(): void {
    clearClientCache();
}

// TODO: Add in-source tests for clients.ts once we have a mock ChainDefinition fixture.
// Tests needed:
// - getTypedApi reads descriptor.genesis for cache lookup
// - getTypedApi deduplicates concurrent calls for same genesis hash
// - isConnected returns true only for initialized chains
// - destroy() clears single cache entry
// - destroyAll() clears entire cache
