import type { JsonRpcProvider } from "polkadot-api/ws-provider/web";
import type { Client, Chain } from "polkadot-api/smoldot";
import type { ChainMeta } from "./types.js";

declare global {
    var __smoldotInstance: Client | undefined;
    var __relayCache: Map<string, Chain> | undefined;
}

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

function getSmoldot(): Client | undefined {
    return globalThis.__smoldotInstance;
}

function setSmoldot(client: Client): void {
    globalThis.__smoldotInstance = client;
}

function getRelayCache(): Map<string, Chain> {
    globalThis.__relayCache ??= new Map();
    return globalThis.__relayCache;
}

/** Terminate the smoldot worker if running. Called by destroyAll(). */
export function resetSmoldot(): void {
    const instance = getSmoldot();
    if (instance) {
        instance.terminate();
        globalThis.__smoldotInstance = undefined;
    }
    getRelayCache().clear();
}

async function createSmoldotProvider(meta: ChainMeta): Promise<JsonRpcProvider | null> {
    if (!meta.relayChainSpec && !meta.paraChainSpec) {
        return null;
    }

    const { start } = await import("polkadot-api/smoldot");
    const { getSmProvider } = await import("polkadot-api/sm-provider");

    let smoldot = getSmoldot();
    if (!smoldot) {
        smoldot = start();
        setSmoldot(smoldot);
    }

    const cache = getRelayCache();

    if (meta.relayChainSpec && meta.paraChainSpec) {
        // Reuse relay chain if already added
        let relay = cache.get(meta.relayChainSpec);
        if (!relay) {
            const relaySpec = await fetchChainSpec(meta.relayChainSpec);
            relay = await smoldot.addChain({ chainSpec: relaySpec });
            cache.set(meta.relayChainSpec, relay);
        }
        const paraSpec = await fetchChainSpec(meta.paraChainSpec);
        const para = await smoldot.addChain({
            chainSpec: paraSpec,
            potentialRelayChains: [relay],
        });
        return getSmProvider(para);
    }

    // Standalone chain (relay chain itself or solo chain)
    const spec = meta.relayChainSpec ?? meta.paraChainSpec;
    const chain = await smoldot.addChain({
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
