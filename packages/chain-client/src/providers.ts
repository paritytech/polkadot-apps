import { getHostProvider } from "@polkadot-apps/host";
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
 * 2. Wrap with host provider if available (via `@polkadot-apps/host`) —
 *    it routes through the host inside a container, passes through to fallback outside.
 * 3. If host provider is unavailable, use the fallback directly.
 */
export async function createProvider(
    genesisHash: string,
    meta: ChainMeta,
): Promise<JsonRpcProvider> {
    const fallback = await createFallbackProvider(meta);

    const hostProvider = await getHostProvider(genesisHash as `0x${string}`, fallback ?? undefined);
    if (hostProvider) return hostProvider;

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
    const { test, expect, vi, beforeEach } = import.meta.vitest;

    // Shared state between hoisted mocks and tests
    const state = vi.hoisted(() => ({
        fakeProvider: (() => {}) as unknown as JsonRpcProvider,
        fakeWrappedProvider: (() => {}) as unknown as JsonRpcProvider,
        fakeChain: {} as unknown as Chain,
        wsProviderCalls: [] as unknown[][],
        hostProviderCalls: [] as unknown[][],
        addChainCalls: [] as unknown[][],
        smoldotStartCount: 0,
        terminateCount: 0,
        hostProviderAvailable: true,
    }));

    vi.mock("@polkadot-apps/host", async (importOriginal) => ({
        ...(await importOriginal<typeof import("@polkadot-apps/host")>()),
        getHostProvider: async (...args: unknown[]) => {
            state.hostProviderCalls.push(args);
            if (!state.hostProviderAvailable) return null;
            return state.fakeWrappedProvider;
        },
    }));

    vi.mock("polkadot-api/ws-provider/web", () => ({
        getWsProvider: (...args: unknown[]) => {
            state.wsProviderCalls.push(args);
            return state.fakeProvider;
        },
    }));

    vi.mock("polkadot-api/smoldot", () => ({
        start: () => {
            state.smoldotStartCount++;
            return {
                addChain: async (opts: unknown) => {
                    state.addChainCalls.push([opts]);
                    return state.fakeChain;
                },
                terminate: () => {
                    state.terminateCount++;
                },
            };
        },
    }));

    vi.mock("polkadot-api/sm-provider", () => ({
        getSmProvider: () => state.fakeProvider,
    }));

    beforeEach(() => {
        resetSmoldot();
        state.wsProviderCalls = [];
        state.hostProviderCalls = [];
        state.addChainCalls = [];
        state.smoldotStartCount = 0;
        state.terminateCount = 0;
        state.hostProviderAvailable = true;
    });

    // --- createProvider paths ---

    test("wraps with host provider when available", async () => {
        const result = await createProvider("0xabc", { rpcs: ["wss://rpc.example.com"] });
        expect(result).toBe(state.fakeWrappedProvider);
        expect(state.hostProviderCalls.length).toBe(1);
        expect(state.hostProviderCalls[0][0]).toBe("0xabc");
    });

    test("falls back to direct rpc when host provider unavailable", async () => {
        state.hostProviderAvailable = false;
        const result = await createProvider("0xabc", { rpcs: ["wss://rpc.example.com"] });
        expect(result).toBe(state.fakeProvider);
        expect(state.wsProviderCalls.length).toBe(1);
    });

    test("throws when no host provider and no rpcs", async () => {
        state.hostProviderAvailable = false;
        await expect(createProvider("0xtest", {})).rejects.toThrow(
            /No connection method available/,
        );
    });

    test("passes fallback provider to host provider", async () => {
        await createProvider("0xabc", { rpcs: ["wss://rpc.example.com"] });
        expect(state.hostProviderCalls[0][1]).toBe(state.fakeProvider);
    });

    test("rpc mode requires endpoints", async () => {
        state.hostProviderAvailable = false;
        await expect(createProvider("0xabc", { mode: "rpc" })).rejects.toThrow(
            /rpc mode requires at least one endpoint/,
        );
    });

    // --- smoldot singleton lifecycle ---

    test("smoldot starts once across multiple lightclient calls", async () => {
        state.hostProviderAvailable = false;
        const spec = '{"id":"test-chain"}';
        await createProvider("0xa", { mode: "lightclient", relayChainSpec: spec });
        await createProvider("0xb", { mode: "lightclient", relayChainSpec: spec });
        expect(state.smoldotStartCount).toBe(1);
    });

    test("resetSmoldot terminates and allows fresh start", async () => {
        state.hostProviderAvailable = false;
        const spec = '{"id":"test-chain"}';
        await createProvider("0xa", { mode: "lightclient", relayChainSpec: spec });
        expect(state.smoldotStartCount).toBe(1);

        resetSmoldot();
        expect(state.terminateCount).toBe(1);

        await createProvider("0xb", { mode: "lightclient", relayChainSpec: spec });
        expect(state.smoldotStartCount).toBe(2);
    });

    test("resetSmoldot is safe to call when no smoldot running", () => {
        expect(() => resetSmoldot()).not.toThrow();
    });

    test("smoldot persists on globalThis (HMR-safe)", async () => {
        state.hostProviderAvailable = false;
        const spec = '{"id":"test-chain"}';
        await createProvider("0xa", { mode: "lightclient", relayChainSpec: spec });
        expect(globalThis.__smoldotInstance).toBeDefined();
        resetSmoldot();
        expect(globalThis.__smoldotInstance).toBeUndefined();
    });

    // --- relay chain caching ---

    test("relay chain is cached and reused for same spec", async () => {
        state.hostProviderAvailable = false;
        const relay = '{"id":"relay"}';
        const para1 = '{"id":"para1"}';
        const para2 = '{"id":"para2"}';

        await createProvider("0xa", {
            mode: "lightclient",
            relayChainSpec: relay,
            paraChainSpec: para1,
        });
        await createProvider("0xb", {
            mode: "lightclient",
            relayChainSpec: relay,
            paraChainSpec: para2,
        });

        // addChain called 3 times: relay + para1 + para2 (relay NOT duplicated)
        expect(state.addChainCalls.length).toBe(3);
    });

    test("different relay specs get separate addChain calls", async () => {
        state.hostProviderAvailable = false;
        const relay1 = '{"id":"relay1"}';
        const relay2 = '{"id":"relay2"}';
        const para = '{"id":"para"}';

        await createProvider("0xa", {
            mode: "lightclient",
            relayChainSpec: relay1,
            paraChainSpec: para,
        });
        await createProvider("0xb", {
            mode: "lightclient",
            relayChainSpec: relay2,
            paraChainSpec: para,
        });

        // 4 calls: relay1 + para, relay2 + para
        expect(state.addChainCalls.length).toBe(4);
    });

    test("resetSmoldot clears relay cache", async () => {
        state.hostProviderAvailable = false;
        const relay = '{"id":"relay"}';
        const para = '{"id":"para"}';

        await createProvider("0xa", {
            mode: "lightclient",
            relayChainSpec: relay,
            paraChainSpec: para,
        });
        resetSmoldot();
        await createProvider("0xb", {
            mode: "lightclient",
            relayChainSpec: relay,
            paraChainSpec: para,
        });

        // relay added twice (cache was cleared)
        expect(state.addChainCalls.length).toBe(4);
    });

    // --- fetchChainSpec ---

    test("fetchChainSpec rejects malformed JSON", async () => {
        state.hostProviderAvailable = false;
        await expect(
            createProvider("0xa", { mode: "lightclient", relayChainSpec: "{not valid json" }),
        ).rejects.toThrow();
    });

    test("fetchChainSpec accepts valid inline JSON", async () => {
        state.hostProviderAvailable = false;
        const spec = '{"id":"test"}';
        await createProvider("0xa", { mode: "lightclient", relayChainSpec: spec });
        expect(state.addChainCalls.length).toBe(1);
    });
}
