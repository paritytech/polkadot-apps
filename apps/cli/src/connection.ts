import { getChainAPI, type Environment } from "@polkadot-apps/chain-client";
import { createInkSdk } from "@polkadot-api/sdk-ink";
import { ContractManager } from "@polkadot-apps/contracts";
import { CHAINS, DEFAULT_CHAIN } from "./config.js";

// Import as JSON module so bun embeds it in the compiled binary
import cdmJson from "../cdm.json" with { type: "json" };

// Map config chain names to chain-client Environment
const CHAIN_TO_ENV: Record<string, Environment> = {
    paseo: "paseo",
    polkadot: "polkadot",
};

function resolveEnvironment(chainName: string): Environment {
    const env = CHAIN_TO_ENV[chainName];
    if (!env) {
        const supported = Object.keys(CHAIN_TO_ENV).join(", ");
        throw new Error(
            `Chain "${chainName}" is not yet supported via chain-client. Supported: ${supported}`,
        );
    }
    return env;
}

export interface Connection {
    registry: any;
    assetHub: any;
    ipfsGateway: string;
    destroy: () => void;
}

/* @integration */
export async function connect(chainName?: string): Promise<Connection> {
    const name = chainName ?? DEFAULT_CHAIN;
    const chain = CHAINS[name];
    if (!chain) {
        throw new Error(`Unknown chain "${name}". Available: ${Object.keys(CHAINS).join(", ")}`);
    }

    const env = resolveEnvironment(name);
    const client = await getChainAPI(env);
    const inkSdk = createInkSdk(client.raw.assetHub, { atBest: true });
    const manager = new ContractManager(cdmJson, inkSdk);
    const registry = manager.getContract("@example/playground-registry");

    return {
        registry,
        assetHub: client.assetHub,
        ipfsGateway: chain.ipfsGateway,
        destroy: () => client.destroy(),
    };
}

// IPFS fetch helper
export async function fetchIpfs<T>(cid: string, gatewayUrl: string): Promise<T> {
    const sep = gatewayUrl.endsWith("/") ? "" : "/";
    const res = await fetch(`${gatewayUrl}${sep}${cid}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`IPFS fetch failed: ${res.statusText}`);
    return res.json() as Promise<T>;
}

// Unwrap Substrate Option type
export function unwrapOption<T>(val: unknown): T | undefined {
    if (val && typeof val === "object" && "isSome" in val) {
        const opt = val as { isSome: boolean; value: T };
        return opt.isSome ? opt.value : undefined;
    }
    return val as T;
}

if (import.meta.vitest) {
    const { test, expect, describe } = import.meta.vitest;

    describe("unwrapOption", () => {
        test("unwraps Some value", () => {
            expect(unwrapOption({ isSome: true, value: "hello" })).toBe("hello");
        });
        test("returns undefined for None", () => {
            expect(unwrapOption({ isSome: false, value: "" })).toBeUndefined();
        });
        test("passes through non-Option values", () => {
            expect(unwrapOption("plain string")).toBe("plain string");
            expect(unwrapOption(42)).toBe(42);
            expect(unwrapOption(null)).toBe(null);
        });
        test("handles undefined input", () => {
            expect(unwrapOption(undefined)).toBeUndefined();
        });
    });

    describe("resolveEnvironment", () => {
        test("resolves paseo", () => {
            expect(resolveEnvironment("paseo")).toBe("paseo");
        });
        test("resolves polkadot", () => {
            expect(resolveEnvironment("polkadot")).toBe("polkadot");
        });
        test("throws for unsupported chain", () => {
            expect(() => resolveEnvironment("local")).toThrow("not yet supported");
        });
        test("throws for unknown chain", () => {
            expect(() => resolveEnvironment("fakenet")).toThrow("not yet supported");
        });
        test("error message lists supported chains", () => {
            expect(() => resolveEnvironment("local")).toThrow("paseo, polkadot");
        });
    });

    describe("fetchIpfs", () => {
        test("constructs URL with separator", async () => {
            const mockFetch = globalThis.fetch;
            globalThis.fetch = (async (url: string) => {
                expect(url).toBe("https://gateway.io/ipfs/bafk123");
                return { ok: true, json: async () => ({ data: true }) };
            }) as any;
            const result = await fetchIpfs("bafk123", "https://gateway.io/ipfs");
            expect(result).toEqual({ data: true });
            globalThis.fetch = mockFetch;
        });

        test("skips separator when gateway ends with /", async () => {
            const mockFetch = globalThis.fetch;
            globalThis.fetch = (async (url: string) => {
                expect(url).toBe("https://gateway.io/ipfs/bafk123");
                return { ok: true, json: async () => ({}) };
            }) as any;
            await fetchIpfs("bafk123", "https://gateway.io/ipfs/");
            globalThis.fetch = mockFetch;
        });

        test("throws on non-ok response", async () => {
            const mockFetch = globalThis.fetch;
            globalThis.fetch = (async () => ({
                ok: false,
                statusText: "Not Found",
            })) as any;
            await expect(fetchIpfs("bafk", "https://gw")).rejects.toThrow("IPFS fetch failed");
            globalThis.fetch = mockFetch;
        });
    });
}
