import { getChainAPI } from "@polkadot-apps/chain-client";
import type { PolkadotSigner } from "polkadot-api";

import { computeCid } from "./cid.js";
import { cidExists, fetchBytes, fetchJson, getGateway, gatewayUrl } from "./gateway.js";
import { batchUpload, upload } from "./upload.js";
import type {
    BatchUploadItem,
    BatchUploadOptions,
    BatchUploadResult,
    BulletinApi,
    Environment,
    FetchOptions,
    UploadOptions,
    UploadResult,
} from "./types.js";

/**
 * Ergonomic entry point for Bulletin Chain operations.
 *
 * Bundles a typed Bulletin API (from chain-client) and an IPFS gateway URL
 * so callers don't need to re-pass them on every call.
 *
 * @example
 * ```ts
 * const bulletin = await BulletinClient.create("paseo");
 * const result = await bulletin.upload(fileBytes, signer);
 * const metadata = await bulletin.fetchJson<Metadata>(result.cid);
 * ```
 */
export class BulletinClient {
    readonly api: BulletinApi;
    readonly gateway: string;

    private constructor(api: BulletinApi, gateway: string) {
        this.api = api;
        this.gateway = gateway;
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

    /** Upload data to the Bulletin Chain. */
    async upload(
        data: Uint8Array,
        signer: PolkadotSigner,
        options?: Omit<UploadOptions, "gateway">,
    ): Promise<UploadResult> {
        return upload(this.api, data, signer, { ...options, gateway: this.gateway });
    }

    /** Upload multiple items sequentially. */
    async batchUpload(
        items: BatchUploadItem[],
        signer: PolkadotSigner,
        options?: Omit<BatchUploadOptions, "gateway">,
    ): Promise<BatchUploadResult[]> {
        return batchUpload(this.api, items, signer, { ...options, gateway: this.gateway });
    }

    /** Fetch raw bytes by CID from the gateway. */
    async fetchBytes(cid: string, options?: FetchOptions): Promise<Uint8Array> {
        return fetchBytes(cid, this.gateway, options);
    }

    /** Fetch and parse JSON by CID from the gateway. */
    async fetchJson<T>(cid: string, options?: FetchOptions): Promise<T> {
        return fetchJson<T>(cid, this.gateway, options);
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

        test("upload() passes gateway from client", async () => {
            const client = BulletinClient.from(mockApi, GATEWAY);
            const data = new TextEncoder().encode("test");
            const result = await client.upload(data, {} as PolkadotSigner);
            expect(result.gatewayUrl).toContain(GATEWAY);
            expect(result.cid).toBeTruthy();
        });
    });
}
