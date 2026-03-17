import type { PolkadotClient } from "polkadot-api";
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
        assetHub: { genesis: polkadot_asset_hub.genesis!, rpcs: ["wss://polkadot-asset-hub-rpc.polkadot.io", "wss://sys.ibp.network/asset-hub-polkadot"] },
        // Bulletin and individuality only exist on Paseo/Preview-net for now
        bulletin: { genesis: bulletin.genesis!, rpcs: ["wss://paseo-bulletin-rpc.polkadot.io"] },
        individuality: { genesis: individuality.genesis!, rpcs: ["wss://previewnet.substrate.dev/people"] },
    },
    kusama: {
        assetHub: { genesis: kusama_asset_hub.genesis!, rpcs: ["wss://kusama-asset-hub-rpc.polkadot.io", "wss://sys.ibp.network/asset-hub-kusama"] },
        bulletin: { genesis: bulletin.genesis!, rpcs: ["wss://paseo-bulletin-rpc.polkadot.io"] },
        individuality: { genesis: individuality.genesis!, rpcs: ["wss://previewnet.substrate.dev/people"] },
    },
    paseo: {
        assetHub: { genesis: paseo_asset_hub.genesis!, rpcs: ["wss://sys.ibp.network/asset-hub-paseo", "wss://asset-hub-paseo-rpc.dwellir.com"] },
        bulletin: { genesis: bulletin.genesis!, rpcs: ["wss://paseo-bulletin-rpc.polkadot.io"] },
        individuality: { genesis: individuality.genesis!, rpcs: ["wss://previewnet.substrate.dev/people"] },
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
        createProvider(envRpcs.assetHub.genesis, { rpcs: envRpcs.assetHub.rpcs as unknown as string[] }),
        createProvider(envRpcs.bulletin.genesis, { rpcs: envRpcs.bulletin.rpcs as unknown as string[] }),
        createProvider(envRpcs.individuality.genesis, { rpcs: envRpcs.individuality.rpcs as unknown as string[] }),
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
                    try { entry.client.destroy(); } catch { /* already destroyed */ }
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
