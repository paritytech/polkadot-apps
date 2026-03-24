import { submitAndWatch } from "@polkadot-apps/tx";
import type { PolkadotSigner } from "polkadot-api";
import { Binary } from "polkadot-api";

import { computeCid } from "./cid.js";
import { gatewayUrl } from "./gateway.js";
import type {
    BatchUploadItem,
    BatchUploadOptions,
    BatchUploadResult,
    BulletinApi,
    UploadOptions,
    UploadResult,
} from "./types.js";

/**
 * Upload data to the Bulletin Chain via `TransactionStorage.store`.
 *
 * Computes the CID locally, submits the transaction via {@link submitAndWatch}
 * (from `@polkadot-apps/tx`), and returns the CID + block hash.
 */
export async function upload(
    api: BulletinApi,
    data: Uint8Array,
    signer: PolkadotSigner,
    options?: UploadOptions,
): Promise<UploadResult> {
    const cid = computeCid(data);
    const tx = api.tx.TransactionStorage.store({ data: Binary.fromBytes(data) });
    const result = await submitAndWatch(tx, signer, {
        waitFor: options?.waitFor,
        timeoutMs: options?.timeoutMs,
        onStatus: options?.onStatus,
    });

    return {
        cid,
        blockHash: result.block.hash,
        gatewayUrl: options?.gateway ? gatewayUrl(cid, options.gateway) : undefined,
    };
}

/**
 * Upload multiple items sequentially, reusing the same chain connection.
 *
 * Bulletin Chain requires sequential transaction submission (nonce ordering).
 * Individual failures are captured in results — the batch does not abort.
 */
export async function batchUpload(
    api: BulletinApi,
    items: BatchUploadItem[],
    signer: PolkadotSigner,
    options?: BatchUploadOptions,
): Promise<BatchUploadResult[]> {
    if (items.length === 0) return [];

    const results: BatchUploadResult[] = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        const cid = computeCid(item.data);

        try {
            const tx = api.tx.TransactionStorage.store({ data: Binary.fromBytes(item.data) });
            const result = await submitAndWatch(tx, signer, {
                waitFor: options?.waitFor,
                timeoutMs: options?.timeoutMs,
            });

            const entry: BatchUploadResult = {
                label: item.label,
                cid,
                success: true,
                blockHash: result.block.hash,
                gatewayUrl: options?.gateway ? gatewayUrl(cid, options.gateway) : undefined,
            };
            results.push(entry);
            options?.onProgress?.(i + 1, items.length, entry);
        } catch (err) {
            const entry: BatchUploadResult = {
                label: item.label,
                cid,
                success: false,
                blockHash: "",
                error: err instanceof Error ? err.message : String(err),
            };
            results.push(entry);
            options?.onProgress?.(i + 1, items.length, entry);
        }
    }

    return results;
}

if (import.meta.vitest) {
    const { describe, test, expect, vi } = import.meta.vitest;

    function createMockApi() {
        return {
            tx: {
                TransactionStorage: {
                    store: vi.fn().mockReturnValue({
                        signSubmitAndWatch: () => ({
                            subscribe: (handlers: { next: (e: unknown) => void }) => {
                                queueMicrotask(() => {
                                    handlers.next({ type: "signed", txHash: "0xtxhash" });
                                    handlers.next({
                                        type: "txBestBlocksState",
                                        txHash: "0xtxhash",
                                        found: true,
                                        ok: true,
                                        block: { hash: "0xblockhash", number: 1, index: 0 },
                                        events: [],
                                    });
                                });
                                return { unsubscribe: vi.fn() };
                            },
                        }),
                    }),
                },
            },
        };
    }

    const mockSigner = {} as PolkadotSigner;

    describe("upload", () => {
        test("calls TransactionStorage.store and returns CID + blockHash", async () => {
            const api = createMockApi();
            const data = new TextEncoder().encode("test data");
            const result = await upload(api as unknown as BulletinApi, data, mockSigner);

            expect(api.tx.TransactionStorage.store).toHaveBeenCalledOnce();
            expect(result.cid).toBeTruthy();
            expect(result.blockHash).toBe("0xblockhash");
        });

        test("includes gatewayUrl when gateway option provided", async () => {
            const api = createMockApi();
            const data = new TextEncoder().encode("test");
            const result = await upload(api as unknown as BulletinApi, data, mockSigner, {
                gateway: "https://gw/ipfs/",
            });

            expect(result.gatewayUrl).toBe(`https://gw/ipfs/${result.cid}`);
        });

        test("omits gatewayUrl when no gateway option", async () => {
            const api = createMockApi();
            const data = new TextEncoder().encode("test");
            const result = await upload(api as unknown as BulletinApi, data, mockSigner);

            expect(result.gatewayUrl).toBeUndefined();
        });
    });

    describe("batchUpload", () => {
        test("returns empty array for empty items", async () => {
            const api = createMockApi();
            const results = await batchUpload(api as unknown as BulletinApi, [], mockSigner);
            expect(results).toEqual([]);
        });

        test("processes items sequentially", async () => {
            const api = createMockApi();
            const items: BatchUploadItem[] = [
                { data: new TextEncoder().encode("a"), label: "file-a" },
                { data: new TextEncoder().encode("b"), label: "file-b" },
            ];
            const results = await batchUpload(api as unknown as BulletinApi, items, mockSigner);

            expect(results).toHaveLength(2);
            expect(results[0]!.label).toBe("file-a");
            expect(results[0]!.success).toBe(true);
            expect(results[1]!.label).toBe("file-b");
            expect(results[1]!.success).toBe(true);
        });

        test("captures individual failures without aborting batch", async () => {
            const callCount = { value: 0 };
            const api = createMockApi();
            // Make the second call fail
            api.tx.TransactionStorage.store.mockImplementation(() => {
                callCount.value++;
                if (callCount.value === 2) {
                    return {
                        signSubmitAndWatch: () => ({
                            subscribe: (handlers: { error: (e: Error) => void }) => {
                                queueMicrotask(() => handlers.error(new Error("tx failed")));
                                return { unsubscribe: vi.fn() };
                            },
                        }),
                    };
                }
                return {
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
                };
            });

            const items: BatchUploadItem[] = [
                { data: new TextEncoder().encode("a"), label: "ok" },
                { data: new TextEncoder().encode("b"), label: "fail" },
                { data: new TextEncoder().encode("c"), label: "ok2" },
            ];
            const results = await batchUpload(api as unknown as BulletinApi, items, mockSigner);

            expect(results).toHaveLength(3);
            expect(results[0]!.success).toBe(true);
            expect(results[1]!.success).toBe(false);
            expect(results[1]!.error).toContain("tx failed");
            expect(results[2]!.success).toBe(true);
        });

        test("calls onProgress for each item", async () => {
            const api = createMockApi();
            const items: BatchUploadItem[] = [
                { data: new TextEncoder().encode("a"), label: "a" },
                { data: new TextEncoder().encode("b"), label: "b" },
            ];
            const progress: Array<[number, number, string]> = [];
            await batchUpload(api as unknown as BulletinApi, items, mockSigner, {
                onProgress: (done, total, current) => progress.push([done, total, current.label]),
            });

            expect(progress).toEqual([
                [1, 2, "a"],
                [2, 2, "b"],
            ]);
        });
    });
}
