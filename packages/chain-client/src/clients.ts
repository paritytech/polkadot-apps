import type { ChainDefinition, PolkadotClient } from "polkadot-api";
import { createClient } from "polkadot-api";
import {
    polkadot_asset_hub,
    kusama_asset_hub,
    paseo_asset_hub,
    bulletin,
    individuality,
} from "@polkadot-apps/descriptors";
import { createProvider } from "./providers.js";
import { getClientCache, clearClientCache } from "./hmr.js";
import type { ChainEntry } from "./types.js";

export type Environment = "polkadot" | "kusama" | "paseo";

// Typed factories per environment — types flow directly from descriptors
function createPolkadotChains(ah: PolkadotClient, b: PolkadotClient, i: PolkadotClient) {
    return {
        assetHub: ah.getTypedApi(polkadot_asset_hub),
        bulletin: b.getTypedApi(bulletin),
        individuality: i.getTypedApi(individuality),
    };
}
function createKusamaChains(ah: PolkadotClient, b: PolkadotClient, i: PolkadotClient) {
    return {
        assetHub: ah.getTypedApi(kusama_asset_hub),
        bulletin: b.getTypedApi(bulletin),
        individuality: i.getTypedApi(individuality),
    };
}
function createPaseoChains(ah: PolkadotClient, b: PolkadotClient, i: PolkadotClient) {
    return {
        assetHub: ah.getTypedApi(paseo_asset_hub),
        bulletin: b.getTypedApi(bulletin),
        individuality: i.getTypedApi(individuality),
    };
}

const chainFactories = {
    polkadot: createPolkadotChains,
    kusama: createKusamaChains,
    paseo: createPaseoChains,
} as const;

type InkModule = typeof import("@polkadot-api/sdk-ink");
type ContractSdk = ReturnType<InkModule["createInkSdk"]>;

/** Fully typed chain API for an environment, derived from descriptors. */
export type ChainAPI<E extends Environment> = ReturnType<(typeof chainFactories)[E]> & {
    contracts: ContractSdk;
    destroy: () => void;
};

const rpcs = {
    polkadot: {
        assetHub: {
            genesis: polkadot_asset_hub.genesis!,
            rpcs: [
                "wss://polkadot-asset-hub-rpc.polkadot.io",
                "wss://sys.ibp.network/asset-hub-polkadot",
            ],
        },
        // Bulletin and individuality only exist on Paseo/Preview-net for now
        bulletin: { genesis: bulletin.genesis!, rpcs: ["wss://paseo-bulletin-rpc.polkadot.io"] },
        individuality: {
            genesis: individuality.genesis!,
            rpcs: ["wss://previewnet.substrate.dev/people"],
        },
    },
    kusama: {
        assetHub: {
            genesis: kusama_asset_hub.genesis!,
            rpcs: [
                "wss://kusama-asset-hub-rpc.polkadot.io",
                "wss://sys.ibp.network/asset-hub-kusama",
            ],
        },
        bulletin: { genesis: bulletin.genesis!, rpcs: ["wss://paseo-bulletin-rpc.polkadot.io"] },
        individuality: {
            genesis: individuality.genesis!,
            rpcs: ["wss://previewnet.substrate.dev/people"],
        },
    },
    paseo: {
        assetHub: {
            genesis: paseo_asset_hub.genesis!,
            rpcs: [
                "wss://sys.ibp.network/asset-hub-paseo",
                "wss://asset-hub-paseo-rpc.dwellir.com",
            ],
        },
        bulletin: { genesis: bulletin.genesis!, rpcs: ["wss://paseo-bulletin-rpc.polkadot.io"] },
        individuality: {
            genesis: individuality.genesis!,
            rpcs: ["wss://previewnet.substrate.dev/people"],
        },
    },
} as const;

const envCache = new Map<Environment, Promise<ChainAPI<Environment>>>();

/**
 * Get the typed chain API for a given environment.
 *
 * Returns asset hub, bulletin, individuality, and contracts — fully typed from descriptors.
 * Connections use host routing (via product-sdk) when inside a container,
 * falling back to direct RPC.
 *
 * @example
 * ```ts
 * const api = await getChainAPI("paseo")
 * await api.assetHub.query.System.Account.getValue(addr)
 * await api.bulletin.query.TransactionStorage.ByteFee.getValue()
 * const contract = api.contracts.getContract(descriptor, address)
 * ```
 */
export async function getChainAPI<E extends Environment>(env: E): Promise<ChainAPI<E>> {
    const existing = envCache.get(env);
    if (existing) return existing as Promise<ChainAPI<E>>;

    const promise = initChainAPI<E>(env);
    envCache.set(env, promise as Promise<ChainAPI<Environment>>);
    return promise;
}

async function initChainAPI<E extends Environment>(env: E): Promise<ChainAPI<E>> {
    const envRpcs = rpcs[env];
    const clientCache = getClientCache();

    // Create providers (handles host routing + smoldot fallback)
    const [ahProvider, bProvider, iProvider] = await Promise.all([
        createProvider(envRpcs.assetHub.genesis, {
            rpcs: envRpcs.assetHub.rpcs as unknown as string[],
        }),
        createProvider(envRpcs.bulletin.genesis, {
            rpcs: envRpcs.bulletin.rpcs as unknown as string[],
        }),
        createProvider(envRpcs.individuality.genesis, {
            rpcs: envRpcs.individuality.rpcs as unknown as string[],
        }),
    ]);

    // Create clients
    const ahClient = createClient(ahProvider);
    const bClient = createClient(bProvider);
    const iClient = createClient(iProvider);

    // Populate HMR cache so utility functions (isConnected, destroy, etc.) work
    const populateCache = (genesis: string, client: PolkadotClient) => {
        if (!clientCache.has(genesis)) {
            clientCache.set(genesis, {
                client,
                api: new Map(),
                contractSdk: null,
                initPromise: null,
            } satisfies ChainEntry);
        }
    };
    populateCache(envRpcs.assetHub.genesis, ahClient);
    populateCache(envRpcs.bulletin.genesis, bClient);
    populateCache(envRpcs.individuality.genesis, iClient);

    // Contract SDK on asset hub (where contracts are deployed)
    const { createInkSdk } = await import("@polkadot-api/sdk-ink");
    const contracts = createInkSdk(ahClient, { atBest: true });

    // Cache the contract SDK in HMR cache too
    const ahEntry = clientCache.get(envRpcs.assetHub.genesis);
    if (ahEntry) ahEntry.contractSdk = contracts;

    // Build typed APIs — types flow from descriptors via ReturnType
    const factory = chainFactories[env];
    const apis = factory(ahClient, bClient, iClient);

    return {
        ...apis,
        contracts,
        destroy() {
            for (const { genesis } of Object.values(envRpcs)) {
                const entry = clientCache.get(genesis);
                if (entry) {
                    try {
                        entry.client.destroy();
                    } catch {
                        /* already destroyed */
                    }
                    clientCache.delete(genesis);
                }
            }
            envCache.delete(env);
        },
    } as ChainAPI<E>;
}

/** Destroy all environments. */
export function destroyAll(): void {
    clearClientCache();
    envCache.clear();
}

/**
 * Get the raw PolkadotClient for a connected chain.
 * The chain must have been initialized via getChainAPI() first.
 */
export function getClient(descriptor: ChainDefinition): PolkadotClient {
    const genesis = descriptor.genesis;
    if (!genesis) throw new Error("Descriptor has no genesis hash.");
    const entry = getClientCache().get(genesis);
    if (!entry?.client) {
        throw new Error(
            `Chain not connected (genesis: ${genesis}). ` +
                `Call getChainAPI() first to establish connections.`,
        );
    }
    return entry.client;
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

if (import.meta.vitest) {
    const { test, expect, beforeEach } = import.meta.vitest;

    const fakeDescriptor = { genesis: "0xtest" } as unknown as ChainDefinition;
    const fakeClient = { destroy: () => {}, getTypedApi: () => ({}) } as unknown as PolkadotClient;

    function seedCache(genesis: string, client: PolkadotClient) {
        getClientCache().set(genesis, {
            client,
            api: new Map(),
            contractSdk: null,
            initPromise: null,
        });
    }

    beforeEach(() => {
        clearClientCache();
        envCache.clear();
    });

    test("isConnected returns false for unknown chain", () => {
        expect(isConnected(fakeDescriptor)).toBe(false);
    });

    test("isConnected returns true after cache is populated", () => {
        seedCache("0xtest", fakeClient);
        expect(isConnected(fakeDescriptor)).toBe(true);
    });

    test("isConnected returns false for descriptor without genesis", () => {
        expect(isConnected({} as ChainDefinition)).toBe(false);
    });

    test("getClient returns client from cache", () => {
        seedCache("0xtest", fakeClient);
        expect(getClient(fakeDescriptor)).toBe(fakeClient);
    });

    test("getClient throws for unconnected chain", () => {
        expect(() => getClient(fakeDescriptor)).toThrow(/Chain not connected/);
    });

    test("getClient throws for descriptor without genesis", () => {
        expect(() => getClient({} as ChainDefinition)).toThrow(/no genesis hash/);
    });

    test("destroyAll calls client.destroy() and clears caches", () => {
        let destroyed = false;
        const trackableClient = { destroy: () => { destroyed = true; }, getTypedApi: () => ({}) } as unknown as PolkadotClient;
        seedCache("0xtest", trackableClient);
        envCache.set("paseo", Promise.resolve({} as ChainAPI<"paseo">));
        destroyAll();
        expect(destroyed).toBe(true);
        expect(isConnected(fakeDescriptor)).toBe(false);
        expect(envCache.size).toBe(0);
    });

    test("getChainAPI returns same result for same environment", async () => {
        const fakeResult = {} as ChainAPI<"paseo">;
        envCache.set("paseo", Promise.resolve(fakeResult));
        const result = await getChainAPI("paseo");
        expect(result).toBe(fakeResult);
    });

    test("getChainAPI returns different results for different environments", async () => {
        const paseoResult = { env: "paseo" } as unknown as ChainAPI<"paseo">;
        const polkadotResult = { env: "polkadot" } as unknown as ChainAPI<"polkadot">;
        envCache.set("paseo", Promise.resolve(paseoResult));
        envCache.set("polkadot", Promise.resolve(polkadotResult));
        const a = await getChainAPI("paseo");
        const b = await getChainAPI("polkadot");
        expect(a).not.toBe(b);
    });

    test("getChainAPI deduplicates concurrent calls", async () => {
        const fakeResult = {} as ChainAPI<"kusama">;
        envCache.set("kusama", Promise.resolve(fakeResult));
        const [a, b] = await Promise.all([getChainAPI("kusama"), getChainAPI("kusama")]);
        expect(a).toBe(b);
    });

    test("full lifecycle: connect, verify, destroy, verify disconnected", () => {
        seedCache("0xtest", fakeClient);
        expect(isConnected(fakeDescriptor)).toBe(true);
        expect(getClient(fakeDescriptor)).toBe(fakeClient);
        destroyAll();
        expect(isConnected(fakeDescriptor)).toBe(false);
        expect(() => getClient(fakeDescriptor)).toThrow(/Chain not connected/);
    });

    test("descriptors have genesis hashes", () => {
        expect(polkadot_asset_hub.genesis).toBeTruthy();
        expect(kusama_asset_hub.genesis).toBeTruthy();
        expect(paseo_asset_hub.genesis).toBeTruthy();
        expect(bulletin.genesis).toBeTruthy();
        expect(individuality.genesis).toBeTruthy();
    });

    test("rpcs defined for all environments", () => {
        for (const env of ["polkadot", "kusama", "paseo"] as const) {
            const envRpcs = rpcs[env];
            expect(envRpcs.assetHub.rpcs.length).toBeGreaterThan(0);
            expect(envRpcs.bulletin.rpcs.length).toBeGreaterThan(0);
            expect(envRpcs.individuality.rpcs.length).toBeGreaterThan(0);
            expect(envRpcs.assetHub.genesis).toBeTruthy();
            expect(envRpcs.bulletin.genesis).toBeTruthy();
            expect(envRpcs.individuality.genesis).toBeTruthy();
        }
    });
}
