import type { JsonRpcProvider } from "polkadot-api/ws-provider/web";
import type { Client } from "polkadot-api/smoldot";
import type { ChainMeta } from "./types.js";

/**
 * Create a PAPI-compatible JSON-RPC provider for a chain.
 *
 * Strategy:
 * 1. Build a standalone fallback provider (rpc or lightclient)
 * 2. Wrap with product-sdk's createPapiProvider if available —
 *    it routes through the host inside a container, passes through to fallback outside.
 * 3. If product-sdk is not installed, use the fallback directly.
 */
export async function createProvider(
    genesisHash: string,
    meta: ChainMeta,
): Promise<JsonRpcProvider> {
    const fallback = await createFallbackProvider(meta);

    try {
        const { createPapiProvider } = await import("@novasamatech/product-sdk");
        return createPapiProvider(genesisHash as `0x${string}`, fallback ?? undefined);
    } catch {
        // product-sdk not installed or not in a valid environment
    }

    if (!fallback) {
        throw new Error(
            `No connection method available for chain ${genesisHash}. ` +
                `Provide rpcs or chain specs.`,
        );
    }
    return fallback;
}

async function createFallbackProvider(meta: ChainMeta): Promise<JsonRpcProvider | null> {
    const mode = meta.mode ?? (meta.rpcs?.length ? "rpc" : "lightclient");

    if (mode === "rpc") {
        if (!meta.rpcs?.length) {
            throw new Error("rpc mode requires at least one endpoint in rpcs.");
        }
        const { getWsProvider } = await import("polkadot-api/ws-provider/web");
        return getWsProvider([...meta.rpcs]);
    }

    if (mode === "lightclient") {
        return createSmoldotProvider(meta);
    }

    return null;
}

// Smoldot singleton — shared across chains
let smoldotInstance: Client | null = null;

/** Terminate the smoldot worker if running. Called by destroyAll(). */
export function resetSmoldot(): void {
    if (smoldotInstance) {
        smoldotInstance.terminate();
        smoldotInstance = null;
    }
    relayCache.clear();
}

// Cache relay chains by spec URL/content to avoid duplicate addChain() calls
// biome-ignore lint: internal cache, type derived from smoldot's addChain return
const relayCache = new Map<string, any>();

async function createSmoldotProvider(meta: ChainMeta): Promise<JsonRpcProvider | null> {
    if (!meta.relayChainSpec && !meta.paraChainSpec) {
        return null;
    }

    const { start } = await import("polkadot-api/smoldot");
    const { getSmProvider } = await import("polkadot-api/sm-provider");

    if (!smoldotInstance) {
        smoldotInstance = start();
    }

    if (meta.relayChainSpec && meta.paraChainSpec) {
        // Reuse relay chain if already added
        let relay = relayCache.get(meta.relayChainSpec);
        if (!relay) {
            const relaySpec = await fetchChainSpec(meta.relayChainSpec);
            relay = await smoldotInstance.addChain({ chainSpec: relaySpec });
            relayCache.set(meta.relayChainSpec, relay);
        }
        const paraSpec = await fetchChainSpec(meta.paraChainSpec);
        const para = await smoldotInstance.addChain({
            chainSpec: paraSpec,
            potentialRelayChains: [relay],
        });
        return getSmProvider(para);
    }

    // Standalone chain (relay chain itself or solo chain)
    const spec = meta.relayChainSpec ?? meta.paraChainSpec;
    const chain = await smoldotInstance.addChain({
        chainSpec: await fetchChainSpec(spec!),
    });
    return getSmProvider(chain);
}

async function fetchChainSpec(urlOrSpec: string): Promise<string> {
    if (urlOrSpec.trimStart().startsWith("{")) {
        JSON.parse(urlOrSpec); // validate — throws on malformed JSON
        return urlOrSpec;
    }
    const res = await fetch(urlOrSpec);
    if (!res.ok) {
        throw new Error(`Failed to fetch chain spec from ${urlOrSpec}: ${res.status}`);
    }
    return res.text();
}

if (import.meta.vitest) {
    const { test, expect } = import.meta.vitest;

    test("createProvider rejects with no rpcs and no valid environment", async () => {
        await expect(createProvider("0xtest", {})).rejects.toThrow();
    });
}
