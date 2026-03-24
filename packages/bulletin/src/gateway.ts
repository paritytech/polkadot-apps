import type { Environment, FetchOptions } from "./types.js";

/**
 * Known IPFS gateways per environment.
 * Currently all point to the Paseo bulletin gateway (only one live).
 * Will be updated as Polkadot/Kusama bulletin chains go live.
 */
/** Add entries here as bulletin gateways go live on each network. */
const GATEWAYS: Partial<Record<Environment, string>> = {
    paseo: "https://paseo-ipfs.polkadot.io/ipfs/",
};

const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

/** Get the IPFS gateway URL for an environment. Throws if the network is not yet available. */
export function getGateway(env: Environment): string {
    const gw = GATEWAYS[env];
    if (!gw) {
        throw new Error(`Bulletin gateway for "${env}" is not yet available`);
    }
    return gw;
}

/** Build the full gateway URL for a CID. */
export function gatewayUrl(cid: string, gateway: string): string {
    return `${gateway}${cid}`;
}

/** Check if a CID exists on the gateway (HEAD request). Returns false on any error. */
export async function cidExists(cid: string, gateway: string): Promise<boolean> {
    try {
        const response = await fetch(gatewayUrl(cid, gateway), { method: "HEAD" });
        return response.ok;
    } catch {
        return false;
    }
}

/** Fetch raw bytes from the gateway. */
export async function fetchBytes(
    cid: string,
    gateway: string,
    options?: FetchOptions,
): Promise<Uint8Array> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(gatewayUrl(cid, gateway), { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`Gateway returned ${response.status}: ${response.statusText}`);
        }
        return new Uint8Array(await response.arrayBuffer());
    } finally {
        clearTimeout(timer);
    }
}

/** Fetch and parse JSON from the gateway. */
export async function fetchJson<T>(
    cid: string,
    gateway: string,
    options?: FetchOptions,
): Promise<T> {
    const bytes = await fetchBytes(cid, gateway, options);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

if (import.meta.vitest) {
    const { describe, test, expect, vi, afterEach } = import.meta.vitest;

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getGateway", () => {
        test("returns known URL for paseo", () => {
            const gw = getGateway("paseo");
            expect(gw).toMatch(/^https:\/\//);
            expect(gw).toMatch(/\/ipfs\/$/);
        });

        test("throws for environments without a live gateway", () => {
            expect(() => getGateway("polkadot")).toThrow("not yet available");
            expect(() => getGateway("kusama")).toThrow("not yet available");
        });
    });

    describe("gatewayUrl", () => {
        test("concatenates gateway and CID", () => {
            expect(gatewayUrl("bafyabc", "https://gw.example/ipfs/")).toBe(
                "https://gw.example/ipfs/bafyabc",
            );
        });
    });

    describe("cidExists", () => {
        test("returns true for 200 response", async () => {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
            expect(await cidExists("bafyabc", "https://gw/ipfs/")).toBe(true);
        });

        test("returns false for 404 response", async () => {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
            expect(await cidExists("bafyabc", "https://gw/ipfs/")).toBe(false);
        });

        test("returns false on network error", async () => {
            vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
            expect(await cidExists("bafyabc", "https://gw/ipfs/")).toBe(false);
        });
    });

    describe("fetchBytes", () => {
        test("returns bytes from response", async () => {
            const payload = new Uint8Array([1, 2, 3]);
            vi.stubGlobal(
                "fetch",
                vi.fn().mockResolvedValue({
                    ok: true,
                    arrayBuffer: () => Promise.resolve(payload.buffer),
                }),
            );
            const result = await fetchBytes("bafyabc", "https://gw/ipfs/");
            expect(result).toEqual(payload);
        });

        test("throws on non-ok response", async () => {
            vi.stubGlobal(
                "fetch",
                vi.fn().mockResolvedValue({
                    ok: false,
                    status: 500,
                    statusText: "Internal Server Error",
                }),
            );
            await expect(fetchBytes("bafyabc", "https://gw/ipfs/")).rejects.toThrow("500");
        });

        test("throws on timeout", async () => {
            vi.stubGlobal(
                "fetch",
                vi.fn().mockImplementation(
                    (_url: string, init: { signal: AbortSignal }) =>
                        new Promise((_resolve, reject) => {
                            init.signal.addEventListener("abort", () =>
                                reject(new DOMException("aborted", "AbortError")),
                            );
                        }),
                ),
            );
            await expect(
                fetchBytes("bafyabc", "https://gw/ipfs/", { timeoutMs: 10 }),
            ).rejects.toThrow();
        });
    });

    describe("fetchJson", () => {
        test("parses JSON from response", async () => {
            const obj = { name: "test", value: 42 };
            const bytes = new TextEncoder().encode(JSON.stringify(obj));
            vi.stubGlobal(
                "fetch",
                vi.fn().mockResolvedValue({
                    ok: true,
                    arrayBuffer: () => Promise.resolve(bytes.buffer),
                }),
            );
            const result = await fetchJson<{ name: string; value: number }>(
                "bafyabc",
                "https://gw/ipfs/",
            );
            expect(result).toEqual(obj);
        });
    });
}
