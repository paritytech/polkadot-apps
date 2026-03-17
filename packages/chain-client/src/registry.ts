import type { ChainMeta } from "./types.js";

const registry = new Map<string, ChainMeta>();

function populateWellKnownChains(): void {
    // Polkadot
    registry.set("0x91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3", {
        rpcs: ["wss://rpc.polkadot.io", "wss://polkadot-rpc.dwellir.com"],
    });
    // Polkadot Asset Hub
    registry.set("0x68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f", {
        rpcs: [
            "wss://polkadot-asset-hub-rpc.polkadot.io",
            "wss://sys.ibp.network/asset-hub-polkadot",
        ],
    });
    // Kusama
    registry.set("0xb0a8d493285c2df73290dfb7e61f870f17b41801197a149ca93654499ea3dafe", {
        rpcs: ["wss://kusama-rpc.polkadot.io", "wss://kusama-rpc.dwellir.com"],
    });
    // Kusama Asset Hub
    registry.set("0x48239ef607d7928874027a43a67689209727dfb3d3dc5e5b03a39bdc2eda771a", {
        rpcs: ["wss://kusama-asset-hub-rpc.polkadot.io", "wss://sys.ibp.network/asset-hub-kusama"],
    });
    // Paseo (testnet relay)
    registry.set("0x77afd6190f1554ad45fd0d31aee62aacc33c6db0ea801129acb813f913e0764f", {
        rpcs: ["wss://paseo-rpc.dwellir.com", "wss://rpc.ibp.network/paseo"],
    });
    // Paseo Asset Hub
    registry.set("0xd6eec26135305a8ad257a20d003357284c8aa03d0bdb2b357ab0a22371e11ef2", {
        rpcs: ["wss://sys.ibp.network/asset-hub-paseo", "wss://asset-hub-paseo-rpc.dwellir.com"],
    });
    // Paseo People
    registry.set("0x42e75530d0e97c80ebbb2e22f1ab8e31a21b0e5dab0993dda34a89ce3e91012c", {
        rpcs: ["wss://people-paseo-rpc.polkadot.io"],
    });
    // Polkadot People
    registry.set("0x67fa177a097bfa18f77ea95ab56e9bcdfeb0e5b8a40e46571e93f3789c1a8960", {
        rpcs: ["wss://polkadot-people-rpc.polkadot.io", "wss://sys.ibp.network/people-polkadot"],
    });
    // Bulletin Chain (Paseo)
    registry.set("0xc78be23339e26945c13a34fe0997543c0f0ac5ee8f498a220b2889d1b4569812", {
        rpcs: ["wss://paseo-bulletin-rpc.polkadot.io"],
    });
}

populateWellKnownChains();

/** Register or override connection metadata for a genesis hash. Merges with existing. */
export function registerChain(genesisHash: string, meta: ChainMeta): void {
    const existing = registry.get(genesisHash);
    registry.set(genesisHash, existing ? { ...existing, ...meta } : meta);
}

/** Look up metadata by genesis hash. Returns undefined if unknown. */
export function getChainMeta(genesisHash: string): ChainMeta | undefined {
    return registry.get(genesisHash);
}

/** Reset registry to well-known defaults. Used by tests. */
export function resetRegistry(): void {
    registry.clear();
    populateWellKnownChains();
}

if (import.meta.vitest) {
    const { test, expect } = import.meta.vitest;

    test("well-known chains are pre-populated", () => {
        // Paseo Asset Hub
        const meta = getChainMeta(
            "0xd6eec26135305a8ad257a20d003357284c8aa03d0bdb2b357ab0a22371e11ef2",
        );
        expect(meta).toBeDefined();
        expect(meta!.rpcs).toContain("wss://sys.ibp.network/asset-hub-paseo");
    });

    test("registerChain adds new entries", () => {
        registerChain("0xtest", { rpcs: ["wss://test.io"] });
        expect(getChainMeta("0xtest")).toEqual({ rpcs: ["wss://test.io"] });
    });

    test("registerChain merges with existing entries", () => {
        registerChain("0xmerge", { rpcs: ["wss://a.io"] });
        registerChain("0xmerge", { relayChainSpec: "https://spec.json" });
        const meta = getChainMeta("0xmerge");
        expect(meta!.rpcs).toEqual(["wss://a.io"]);
        expect(meta!.relayChainSpec).toBe("https://spec.json");
    });

    test("getChainMeta returns undefined for unknown chains", () => {
        expect(getChainMeta("0xunknown")).toBeUndefined();
    });

    test("resetRegistry restores defaults", () => {
        registerChain("0xcustom", { rpcs: ["wss://custom.io"] });
        resetRegistry();
        expect(getChainMeta("0xcustom")).toBeUndefined();
        expect(
            getChainMeta("0x91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3"),
        ).toBeDefined();
    });
}
