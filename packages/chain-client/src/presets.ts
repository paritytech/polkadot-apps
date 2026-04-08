import type { ChainDefinition } from "polkadot-api";
import { createChainClient } from "./clients.js";
import type { ChainClient } from "./types.js";

// Type-only imports — erased at compile time, zero bundle cost.
// These give us per-chain TypedApi types without importing runtime descriptor data.
import type { polkadot_asset_hub as PolkadotAssetHubDef } from "@polkadot-apps/descriptors/polkadot-asset-hub";
import type { kusama_asset_hub as KusamaAssetHubDef } from "@polkadot-apps/descriptors/kusama-asset-hub";
import type { paseo_asset_hub as PaseoAssetHubDef } from "@polkadot-apps/descriptors/paseo-asset-hub";
import type { bulletin as BulletinDef } from "@polkadot-apps/descriptors/bulletin";
import type { individuality as IndividualityDef } from "@polkadot-apps/descriptors/individuality";

/** Known network environment with built-in descriptors and RPC endpoints. */
export type Environment = "polkadot" | "kusama" | "paseo";

// Genesis hashes — fixed per chain, extracted as constants to avoid
// importing descriptor bundles at module scope.
const GENESIS = {
    polkadot_asset_hub: "0x68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f",
    kusama_asset_hub: "0x48239ef607d7928874027a43a67689209727dfb3d3dc5e5b03a39bdc2eda771a",
    paseo_asset_hub: "0xd6eec26135305a8ad257a20d003357284c8aa03d0bdb2b357ab0a22371e11ef2",
    bulletin: "0x744960c32e3a3df5440e1ecd4d34096f1ce2230d7016a5ada8a765d5a622b4ea",
    individuality: "0xe583155e68c7b71e9d2443f846eaba0016d0c38aa807884923545a7003f5bef0",
} as const;

/** Environments where all chains (asset hub, bulletin, individuality) are live. */
const AVAILABLE_ENVIRONMENTS: Set<Environment> = new Set(["paseo"]);

const rpcs = {
    polkadot: {
        assetHub: [
            "wss://polkadot-asset-hub-rpc.polkadot.io",
            "wss://sys.ibp.network/asset-hub-polkadot",
        ],
        bulletin: [] as string[],
        individuality: [] as string[],
    },
    kusama: {
        assetHub: [
            "wss://kusama-asset-hub-rpc.polkadot.io",
            "wss://sys.ibp.network/asset-hub-kusama",
        ],
        bulletin: [] as string[],
        individuality: [] as string[],
    },
    paseo: {
        assetHub: [
            "wss://sys.ibp.network/asset-hub-paseo",
            "wss://asset-hub-paseo-rpc.dwellir.com",
        ],
        bulletin: ["wss://paseo-bulletin-rpc.polkadot.io"],
        individuality: ["wss://pop3-testnet.parity-lab.parity.io/people"],
    },
} as const;

/**
 * Lazy-load descriptors for a specific environment.
 * Only imports the chains needed — avoids bundling all 5 chains when
 * a consumer only uses one environment.
 */
async function loadDescriptors(env: Environment) {
    const assetHubImport = {
        polkadot: () => import("@polkadot-apps/descriptors/polkadot-asset-hub"),
        kusama: () => import("@polkadot-apps/descriptors/kusama-asset-hub"),
        paseo: () => import("@polkadot-apps/descriptors/paseo-asset-hub"),
    }[env]();

    const [ahMod, { bulletin }, { individuality }] = await Promise.all([
        assetHubImport,
        import("@polkadot-apps/descriptors/bulletin"),
        import("@polkadot-apps/descriptors/individuality"),
    ]);

    // Extract the asset hub descriptor (the named export varies per environment)
    const assetHub =
        "polkadot_asset_hub" in ahMod
            ? ahMod.polkadot_asset_hub
            : "kusama_asset_hub" in ahMod
              ? ahMod.kusama_asset_hub
              : (ahMod as typeof import("@polkadot-apps/descriptors/paseo-asset-hub"))
                    .paseo_asset_hub;

    return { assetHub, bulletin, individuality };
}

/** Maps each environment to its asset hub descriptor type. */
type AssetHubDescriptors = {
    polkadot: typeof PolkadotAssetHubDef;
    kusama: typeof KusamaAssetHubDef;
    paseo: typeof PaseoAssetHubDef;
};

/** The chain shape returned by {@link getChainAPI} for a given environment. */
export type PresetChains<E extends Environment> = {
    assetHub: AssetHubDescriptors[E];
    bulletin: typeof BulletinDef;
    individuality: typeof IndividualityDef;
};

/**
 * Get a chain client for a known environment with built-in descriptors and RPCs.
 *
 * This is the **zero-config** path — no need to import descriptors or specify
 * endpoints. For custom chains or BYOD descriptors, use
 * {@link createChainClient} instead.
 *
 * Returns the same {@link ChainClient} type as `createChainClient`, with
 * `assetHub`, `bulletin`, and `individuality` chain keys.
 *
 * @example
 * ```ts
 * import { getChainAPI } from "@polkadot-apps/chain-client";
 *
 * const client = await getChainAPI("paseo");
 *
 * // Fully typed — no descriptor imports needed
 * const account = await client.assetHub.query.System.Account.getValue(addr);
 * const fee = await client.bulletin.query.TransactionStorage.ByteFee.getValue();
 *
 * // Raw client for advanced use (e.g., InkSdk for contracts)
 * import { createInkSdk } from "@polkadot-api/sdk-ink";
 * const inkSdk = createInkSdk(client.raw.assetHub, { atBest: true });
 *
 * client.destroy();
 * ```
 */
export async function getChainAPI<E extends Environment>(
    env: E,
): Promise<ChainClient<PresetChains<E>>> {
    if (!AVAILABLE_ENVIRONMENTS.has(env)) {
        throw new Error(`Chain API for "${env}" is not yet available`);
    }

    const descriptors = await loadDescriptors(env);
    const envRpcs = rpcs[env];

    return createChainClient({
        chains: {
            assetHub: descriptors.assetHub,
            bulletin: descriptors.bulletin,
            individuality: descriptors.individuality,
        },
        rpcs: {
            assetHub: [...envRpcs.assetHub],
            bulletin: [...envRpcs.bulletin],
            individuality: [...envRpcs.individuality],
        },
    }) as Promise<ChainClient<PresetChains<E>>>;
}

if (import.meta.vitest) {
    const { test, expect, beforeEach } = import.meta.vitest;
    const { clearClientInstances, destroyAll } = await import("./clients.js");

    beforeEach(() => {
        destroyAll();
        clearClientInstances();
    });

    // --- GENESIS constants ---

    test("genesis constants are valid hex hashes", () => {
        for (const hash of Object.values(GENESIS)) {
            expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
        }
    });

    // --- RPC config ---

    test("rpcs defined for all environments", () => {
        for (const env of ["polkadot", "kusama", "paseo"] as const) {
            const envRpcs = rpcs[env];
            expect(envRpcs.assetHub.length).toBeGreaterThan(0);
        }
    });

    test("paseo has RPCs for all chains", () => {
        const envRpcs = rpcs.paseo;
        expect(envRpcs.bulletin.length).toBeGreaterThan(0);
        expect(envRpcs.individuality.length).toBeGreaterThan(0);
    });

    // --- getChainAPI ---

    test("polkadot and kusama throw as not yet available", async () => {
        await expect(getChainAPI("polkadot")).rejects.toThrow("not yet available");
        await expect(getChainAPI("kusama")).rejects.toThrow("not yet available");
    });

    // --- loadDescriptors ---

    test("loadDescriptors returns descriptors with genesis hashes for paseo", async () => {
        const descriptors = await loadDescriptors("paseo");
        expect(descriptors).toBeDefined();
        expect(descriptors.assetHub).toBeDefined();
        expect(descriptors.bulletin).toBeDefined();
        expect(descriptors.individuality).toBeDefined();
        expect(descriptors.assetHub.genesis).toBe(GENESIS.paseo_asset_hub);
        expect(descriptors.bulletin.genesis).toBe(GENESIS.bulletin);
        expect(descriptors.individuality.genesis).toBe(GENESIS.individuality);
    });

    test("loadDescriptors returns correct asset hub per environment", async () => {
        const polkadot = await loadDescriptors("polkadot");
        const kusama = await loadDescriptors("kusama");
        const paseo = await loadDescriptors("paseo");
        expect(polkadot.assetHub.genesis).toBe(GENESIS.polkadot_asset_hub);
        expect(kusama.assetHub.genesis).toBe(GENESIS.kusama_asset_hub);
        expect(paseo.assetHub.genesis).toBe(GENESIS.paseo_asset_hub);
        // bulletin and individuality are the same across environments
        expect(polkadot.bulletin.genesis).toBe(paseo.bulletin.genesis);
        expect(polkadot.individuality.genesis).toBe(paseo.individuality.genesis);
    });

    // --- AVAILABLE_ENVIRONMENTS ---

    test("only paseo is currently available", () => {
        expect(AVAILABLE_ENVIRONMENTS.has("paseo")).toBe(true);
        expect(AVAILABLE_ENVIRONMENTS.has("polkadot")).toBe(false);
        expect(AVAILABLE_ENVIRONMENTS.has("kusama")).toBe(false);
    });
}
