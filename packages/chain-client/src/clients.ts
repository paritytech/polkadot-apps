import type { ChainDefinition, PolkadotClient, TypedApi } from "polkadot-api";
import { createClient } from "polkadot-api";
import { createInkSdk } from "@polkadot-api/sdk-ink";
import { createProvider, resetSmoldot } from "./providers.js";
import { getClientCache, clearClientCache } from "./hmr.js";
import type { ChainEntry } from "./types.js";

// Type-only imports — erased at compile time, zero bundle cost.
// These give us per-chain TypedApi types without importing runtime descriptor data.
import type PolkadotAssetHubDef from "@polkadot-apps/descriptors/polkadot-asset-hub";
import type KusamaAssetHubDef from "@polkadot-apps/descriptors/kusama-asset-hub";
import type PaseoAssetHubDef from "@polkadot-apps/descriptors/paseo-asset-hub";
import type BulletinDef from "@polkadot-apps/descriptors/bulletin";
import type IndividualityDef from "@polkadot-apps/descriptors/individuality";

export type Environment = "polkadot" | "kusama" | "paseo";

// Cache keys are env-scoped so chains with shared genesis hashes
// (bulletin/individuality today) don't collide across environments.
const cacheKey = (env: string, genesis: string) => `${env}:${genesis}`;

function findEntryByGenesis(genesis: string): ChainEntry | undefined {
    for (const [key, entry] of getClientCache()) {
        if (key.endsWith(`:${genesis}`)) return entry;
    }
}

// Genesis hashes are fixed per chain — extracted as constants to avoid
// importing all descriptor bundles at module scope.
const GENESIS = {
    polkadot_asset_hub: "0x68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f",
    kusama_asset_hub: "0x48239ef607d7928874027a43a67689209727dfb3d3dc5e5b03a39bdc2eda771a",
    paseo_asset_hub: "0xd6eec26135305a8ad257a20d003357284c8aa03d0bdb2b357ab0a22371e11ef2",
    bulletin: "0x744960c32e3a3df5440e1ecd4d34096f1ce2230d7016a5ada8a765d5a622b4ea",
    individuality: "0xe583155e68c7b71e9d2443f846eaba0016d0c38aa807884923545a7003f5bef0",
} as const;

/**
 * Lazy-load descriptors for a specific environment.
 * Only imports the chains needed — avoids bundling all 5 chains when
 * a consumer only uses one environment.
 */
async function loadDescriptors(env: Environment) {
    const [bulletinMod, individualityMod] = await Promise.all([
        import("@polkadot-apps/descriptors/bulletin"),
        import("@polkadot-apps/descriptors/individuality"),
    ]);
    const bulletin = bulletinMod.default;
    const individuality = individualityMod.default;
    switch (env) {
        case "polkadot": {
            const mod = await import("@polkadot-apps/descriptors/polkadot-asset-hub");
            return { assetHub: mod.default, bulletin, individuality };
        }
        case "kusama": {
            const mod = await import("@polkadot-apps/descriptors/kusama-asset-hub");
            return { assetHub: mod.default, bulletin, individuality };
        }
        case "paseo": {
            const mod = await import("@polkadot-apps/descriptors/paseo-asset-hub");
            return { assetHub: mod.default, bulletin, individuality };
        }
    }
}

type ContractSdk = ReturnType<typeof createInkSdk>;

/** Maps each environment to its asset hub descriptor type. */
type AssetHubDescriptors = {
    polkadot: typeof PolkadotAssetHubDef;
    kusama: typeof KusamaAssetHubDef;
    paseo: typeof PaseoAssetHubDef;
};

/** Fully typed chain API for an environment, derived from descriptors. */
export type ChainAPI<E extends Environment> = {
    assetHub: TypedApi<AssetHubDescriptors[E]>;
    bulletin: TypedApi<typeof BulletinDef>;
    individuality: TypedApi<typeof IndividualityDef>;
    contracts: ContractSdk;
    destroy: () => void;
};

/** Environments where all chains (asset hub, bulletin, individuality) are live. */
const AVAILABLE_ENVIRONMENTS: Set<Environment> = new Set(["paseo"]);

const rpcs = {
    polkadot: {
        assetHub: {
            genesis: GENESIS.polkadot_asset_hub,
            rpcs: [
                "wss://polkadot-asset-hub-rpc.polkadot.io",
                "wss://sys.ibp.network/asset-hub-polkadot",
            ],
        },
        bulletin: { genesis: GENESIS.bulletin, rpcs: [] as string[] },
        individuality: { genesis: GENESIS.individuality, rpcs: [] as string[] },
    },
    kusama: {
        assetHub: {
            genesis: GENESIS.kusama_asset_hub,
            rpcs: [
                "wss://kusama-asset-hub-rpc.polkadot.io",
                "wss://sys.ibp.network/asset-hub-kusama",
            ],
        },
        bulletin: { genesis: GENESIS.bulletin, rpcs: [] as string[] },
        individuality: { genesis: GENESIS.individuality, rpcs: [] as string[] },
    },
    paseo: {
        assetHub: {
            genesis: GENESIS.paseo_asset_hub,
            rpcs: [
                "wss://sys.ibp.network/asset-hub-paseo",
                "wss://asset-hub-paseo-rpc.dwellir.com",
            ],
        },
        bulletin: { genesis: GENESIS.bulletin, rpcs: ["wss://paseo-bulletin-rpc.polkadot.io"] },
        individuality: {
            genesis: GENESIS.individuality,
            rpcs: ["wss://pop3-testnet.parity-lab.parity.io/people"],
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

    const promise = initChainAPI<E>(env).catch((err) => {
        envCache.delete(env);
        throw err;
    });
    envCache.set(env, promise as Promise<ChainAPI<Environment>>);
    return promise;
}

/* @integration */
async function initChainAPI<E extends Environment>(env: E): Promise<ChainAPI<E>> {
    if (!AVAILABLE_ENVIRONMENTS.has(env)) {
        throw new Error(`Chain API for "${env}" is not yet available`);
    }
    const envRpcs = rpcs[env];
    const clientCache = getClientCache();

    // Load descriptors lazily — only the chains needed for this environment
    const descriptors = await loadDescriptors(env);

    // Create providers (handles host routing + smoldot fallback)
    const [ahProvider, bProvider, iProvider] = await Promise.all([
        createProvider(envRpcs.assetHub.genesis, { rpcs: envRpcs.assetHub.rpcs }),
        createProvider(envRpcs.bulletin.genesis, { rpcs: envRpcs.bulletin.rpcs }),
        createProvider(envRpcs.individuality.genesis, { rpcs: envRpcs.individuality.rpcs }),
    ]);

    // Create clients
    const ahClient = createClient(ahProvider);
    const bClient = createClient(bProvider);
    const iClient = createClient(iProvider);

    // Populate HMR cache so utility functions (isConnected, destroy, etc.) work
    const populateCache = (genesis: string, client: PolkadotClient) => {
        const key = cacheKey(env, genesis);
        if (!clientCache.has(key)) {
            clientCache.set(key, {
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
    const contracts = createInkSdk(ahClient, { atBest: true });

    // Cache the contract SDK in HMR cache too
    const ahEntry = clientCache.get(cacheKey(env, envRpcs.assetHub.genesis));
    if (ahEntry) ahEntry.contractSdk = contracts;

    // Build typed APIs from lazily-loaded descriptors
    const apis = {
        assetHub: ahClient.getTypedApi(descriptors.assetHub),
        bulletin: bClient.getTypedApi(descriptors.bulletin),
        individuality: iClient.getTypedApi(descriptors.individuality),
    };

    return {
        ...apis,
        contracts,
        destroy() {
            for (const { genesis } of Object.values(envRpcs)) {
                const key = cacheKey(env, genesis);
                const entry = clientCache.get(key);
                if (entry) {
                    try {
                        entry.client.destroy();
                    } catch {
                        /* already destroyed */
                    }
                    clientCache.delete(key);
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
    resetSmoldot();
}

/**
 * Get the raw PolkadotClient for a connected chain.
 * The chain must have been initialized via getChainAPI() first.
 */
export function getClient(descriptor: ChainDefinition): PolkadotClient {
    const genesis = descriptor.genesis;
    if (!genesis) throw new Error("Descriptor has no genesis hash.");
    const entry = findEntryByGenesis(genesis);
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
    return findEntryByGenesis(genesis) !== undefined;
}

if (import.meta.vitest) {
    const { test, expect, beforeEach } = import.meta.vitest;

    const fakeDescriptor = { genesis: "0xtest" } as ChainDefinition;
    const fakeClient = { destroy: () => {}, getTypedApi: () => ({}) } as unknown as PolkadotClient;

    function seedCache(genesis: string, client: PolkadotClient, env: Environment = "paseo") {
        getClientCache().set(cacheKey(env, genesis), {
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
        const trackableClient = {
            destroy: () => {
                destroyed = true;
            },
            getTypedApi: () => ({}),
        } as unknown as PolkadotClient;
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
        const paseoResult = {} as ChainAPI<"paseo">;
        const polkadotResult = {} as ChainAPI<"polkadot">;
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

    test("genesis constants are defined for all chains", () => {
        expect(GENESIS.polkadot_asset_hub).toBeTruthy();
        expect(GENESIS.kusama_asset_hub).toBeTruthy();
        expect(GENESIS.paseo_asset_hub).toBeTruthy();
        expect(GENESIS.bulletin).toBeTruthy();
        expect(GENESIS.individuality).toBeTruthy();
    });

    test("two envs cached independently, destroy one leaves other intact", () => {
        const sharedGenesis = "0xshared";
        const clientA = { destroy: () => {} } as PolkadotClient;
        const clientB = { destroy: () => {} } as PolkadotClient;
        const descriptorShared = { genesis: sharedGenesis } as ChainDefinition;

        seedCache(sharedGenesis, clientA, "polkadot");
        seedCache(sharedGenesis, clientB, "kusama");

        // Both envs visible via genesis lookup
        expect(isConnected(descriptorShared)).toBe(true);

        // Destroy polkadot's entry only
        const cache = getClientCache();
        const polkadotKey = cacheKey("polkadot", sharedGenesis);
        cache.get(polkadotKey)?.client.destroy();
        cache.delete(polkadotKey);

        // Kusama's entry still alive
        expect(isConnected(descriptorShared)).toBe(true);
        expect(getClient(descriptorShared)).toBe(clientB);
    });

    test("rpcs defined for all environments", () => {
        for (const env of ["polkadot", "kusama", "paseo"] as const) {
            const envRpcs = rpcs[env];
            expect(envRpcs.assetHub.rpcs.length).toBeGreaterThan(0);
            expect(envRpcs.assetHub.genesis).toBeTruthy();
            expect(envRpcs.bulletin.genesis).toBeTruthy();
            expect(envRpcs.individuality.genesis).toBeTruthy();
        }
    });

    test("paseo has RPCs for all chains", () => {
        const envRpcs = rpcs.paseo;
        expect(envRpcs.bulletin.rpcs.length).toBeGreaterThan(0);
        expect(envRpcs.individuality.rpcs.length).toBeGreaterThan(0);
    });

    test("polkadot and kusama throw as not yet available", async () => {
        await expect(getChainAPI("polkadot")).rejects.toThrow("not yet available");
        await expect(getChainAPI("kusama")).rejects.toThrow("not yet available");
    });

    test("genesis constants match rpcs config", () => {
        expect(rpcs.polkadot.assetHub.genesis).toBe(GENESIS.polkadot_asset_hub);
        expect(rpcs.kusama.assetHub.genesis).toBe(GENESIS.kusama_asset_hub);
        expect(rpcs.paseo.assetHub.genesis).toBe(GENESIS.paseo_asset_hub);
        expect(rpcs.paseo.bulletin.genesis).toBe(GENESIS.bulletin);
        expect(rpcs.paseo.individuality.genesis).toBe(GENESIS.individuality);
    });

    test("findEntryByGenesis returns undefined for missing genesis", () => {
        expect(findEntryByGenesis("0xnonexistent")).toBeUndefined();
    });

    test("loadDescriptors returns descriptors with genesis hashes for paseo", async () => {
        const descriptors = await loadDescriptors("paseo");
        expect(descriptors).toBeDefined();
        expect(descriptors!.assetHub).toBeDefined();
        expect(descriptors!.bulletin).toBeDefined();
        expect(descriptors!.individuality).toBeDefined();
        // Verify genesis hashes match the GENESIS constants
        expect(descriptors!.assetHub.genesis).toBe(GENESIS.paseo_asset_hub);
        expect(descriptors!.bulletin.genesis).toBe(GENESIS.bulletin);
        expect(descriptors!.individuality.genesis).toBe(GENESIS.individuality);
    });

    test("loadDescriptors returns correct asset hub per environment", async () => {
        const polkadot = await loadDescriptors("polkadot");
        const kusama = await loadDescriptors("kusama");
        const paseo = await loadDescriptors("paseo");
        expect(polkadot!.assetHub.genesis).toBe(GENESIS.polkadot_asset_hub);
        expect(kusama!.assetHub.genesis).toBe(GENESIS.kusama_asset_hub);
        expect(paseo!.assetHub.genesis).toBe(GENESIS.paseo_asset_hub);
        // bulletin and individuality are the same across environments
        expect(polkadot!.bulletin.genesis).toBe(paseo!.bulletin.genesis);
        expect(polkadot!.individuality.genesis).toBe(paseo!.individuality.genesis);
    });
}
