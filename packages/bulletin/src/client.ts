import { getChainAPI } from "@polkadot-apps/chain-client";
import type { PolkadotSigner } from "polkadot-api";

import { computeCid } from "./cid.js";
import { cidExists, getGateway, gatewayUrl } from "./gateway.js";
import { executeQuery } from "./query.js";
import { resolveQueryStrategy, type QueryStrategy } from "./resolve-query.js";
import { batchUpload, upload } from "./upload.js";
import type {
    BatchUploadItem,
    BatchUploadOptions,
    BatchUploadResult,
    BulletinApi,
    Environment,
    QueryOptions,
    UploadOptions,
    UploadResult,
} from "./types.js";

/**
 * Ergonomic entry point for Bulletin Chain operations.
 *
 * Bundles a typed Bulletin API (from chain-client) and an IPFS gateway URL
 * so callers don't need to re-pass them on every call.
 *
 * Both upload and query paths auto-resolve based on the environment:
 * - **Uploads** — inside a host container the host preimage API signs and
 *   submits automatically; standalone falls back to a dev signer.
 * - **Queries** (`fetchBytes`/`fetchJson`) — inside a host container the
 *   host preimage lookup (with caching) is used; standalone falls back to
 *   direct IPFS gateway HTTP fetch.
 *
 * @example
 * ```ts
 * const bulletin = await BulletinClient.create("paseo");
 * // Auto-resolved signer (preimage in host, dev signer standalone):
 * const result = await bulletin.upload(fileBytes);
 * // Auto-resolved query (host lookup in container, gateway standalone):
 * const metadata = await bulletin.fetchJson<Metadata>(result.cid);
 * ```
 */
export class BulletinClient {
    readonly api: BulletinApi;
    readonly gateway: string;

    private queryStrategyPromise: Promise<QueryStrategy> | null = null;

    private constructor(api: BulletinApi, gateway: string) {
        this.api = api;
        this.gateway = gateway;
    }

    /** Lazily resolve and cache the query strategy for the client lifetime. */
    private resolveQuery(): Promise<QueryStrategy> {
        if (!this.queryStrategyPromise) {
            this.queryStrategyPromise = resolveQueryStrategy();
        }
        return this.queryStrategyPromise;
    }

    /** Create from an environment — resolves API via chain-client, gateway from known list. */
    static async create(env: Environment): Promise<BulletinClient> {
        const chain = await getChainAPI(env);
        return new BulletinClient(chain.bulletin, getGateway(env));
    }

    /** Create from an explicit API and gateway (custom setups, testing). */
    static from(api: BulletinApi, gateway: string): BulletinClient {
        return new BulletinClient(api, gateway);
    }

    /** Compute CID without uploading. Static — no instance needed. */
    static computeCid(data: Uint8Array): string {
        return computeCid(data);
    }

    /**
     * Upload data to the Bulletin Chain.
     *
     * @param data   - Raw bytes to store.
     * @param signer - Optional signer. When omitted, auto-resolved (preimage in host, dev signer standalone).
     * @param options - Upload options (timeout, waitFor, status callback).
     */
    async upload(
        data: Uint8Array,
        signer?: PolkadotSigner,
        options?: Omit<UploadOptions, "gateway">,
    ): Promise<UploadResult> {
        return upload(this.api, data, signer, { ...options, gateway: this.gateway });
    }

    /**
     * Upload multiple items sequentially.
     *
     * @param items  - Array of items to upload, each with data and a label.
     * @param signer - Optional signer. When omitted, auto-resolved.
     * @param options - Batch upload options (timeout, progress callback).
     */
    async batchUpload(
        items: BatchUploadItem[],
        signer?: PolkadotSigner,
        options?: Omit<BatchUploadOptions, "gateway">,
    ): Promise<BatchUploadResult[]> {
        return batchUpload(this.api, items, signer, { ...options, gateway: this.gateway });
    }

    /**
     * Fetch raw bytes by CID.
     *
     * Auto-resolves query path: host preimage lookup inside a container,
     * direct IPFS gateway fetch standalone.
     */
    async fetchBytes(cid: string, options?: QueryOptions): Promise<Uint8Array> {
        const strategy = await this.resolveQuery();
        return executeQuery(strategy, cid, this.gateway, options);
    }

    /**
     * Fetch and parse JSON by CID.
     *
     * Auto-resolves query path (same as {@link fetchBytes}).
     */
    async fetchJson<T>(cid: string, options?: QueryOptions): Promise<T> {
        const bytes = await this.fetchBytes(cid, options);
        return JSON.parse(new TextDecoder().decode(bytes)) as T;
    }

    /** Check if a CID exists on the gateway. */
    async cidExists(cid: string): Promise<boolean> {
        return cidExists(cid, this.gateway);
    }

    /** Build the full gateway URL for a CID. */
    gatewayUrl(cid: string): string {
        return gatewayUrl(cid, this.gateway);
    }
}

if (import.meta.vitest) {
    const { describe, test, expect, vi } = import.meta.vitest;

    const mockApi = {
        tx: {
            TransactionStorage: {
                store: vi.fn().mockReturnValue({
                    signSubmitAndWatch: () => ({
                        subscribe: (handlers: { next: (e: unknown) => void }) => {
                            queueMicrotask(() => {
                                handlers.next({ type: "signed", txHash: "0x" });
                                handlers.next({
                                    type: "txBestBlocksState",
                                    txHash: "0x",
                                    found: true,
                                    ok: true,
                                    block: { hash: "0xblock", number: 1, index: 0 },
                                    events: [],
                                });
                            });
                            return { unsubscribe: vi.fn() };
                        },
                    }),
                }),
            },
        },
    } as unknown as BulletinApi;

    const GATEWAY = "https://test-gw/ipfs/";

    describe("BulletinClient", () => {
        test("from() creates client with given API and gateway", () => {
            const client = BulletinClient.from(mockApi, GATEWAY);
            expect(client.api).toBe(mockApi);
            expect(client.gateway).toBe(GATEWAY);
        });

        test("computeCid() is static and delegates to standalone", () => {
            const data = new TextEncoder().encode("hello");
            const cid = BulletinClient.computeCid(data);
            expect(cid).toBe(computeCid(data));
        });

        test("gatewayUrl() returns gateway + cid", () => {
            const client = BulletinClient.from(mockApi, GATEWAY);
            expect(client.gatewayUrl("bafyabc")).toBe("https://test-gw/ipfs/bafyabc");
        });

        test("upload() passes gateway from client with explicit signer", async () => {
            const client = BulletinClient.from(mockApi, GATEWAY);
            const data = new TextEncoder().encode("test");
            const result = await client.upload(data, {} as PolkadotSigner);
            expect(result.gatewayUrl).toContain(GATEWAY);
            expect(result.cid).toBeTruthy();
        });

        test("fetchBytes auto-resolves query strategy", async () => {
            const client = BulletinClient.from(mockApi, GATEWAY);
            const payload = new Uint8Array([1, 2, 3]);
            vi.stubGlobal(
                "fetch",
                vi.fn().mockResolvedValue({
                    ok: true,
                    arrayBuffer: () => Promise.resolve(payload.buffer),
                }),
            );
            try {
                const result = await client.fetchBytes("bafyabc");
                expect(result).toEqual(payload);
            } finally {
                vi.unstubAllGlobals();
            }
        });

        test("fetchJson auto-resolves and parses JSON", async () => {
            const obj = { key: "value" };
            const bytes = new TextEncoder().encode(JSON.stringify(obj));
            vi.stubGlobal(
                "fetch",
                vi.fn().mockResolvedValue({
                    ok: true,
                    arrayBuffer: () => Promise.resolve(bytes.buffer),
                }),
            );
            try {
                const client = BulletinClient.from(mockApi, GATEWAY);
                const result = await client.fetchJson<typeof obj>("bafyabc");
                expect(result).toEqual(obj);
            } finally {
                vi.unstubAllGlobals();
            }
        });
    });
}
