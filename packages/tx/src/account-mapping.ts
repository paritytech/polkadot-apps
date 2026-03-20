import type { PolkadotSigner } from "polkadot-api";

import { createLogger } from "@polkadot-apps/logger";

import { submitAndWatch } from "./submit.js";
import type { SubmittableTransaction, TxResult } from "./types.js";

const log = createLogger("tx:mapping");

/**
 * Error thrown when account mapping fails.
 */
export class TxAccountMappingError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "TxAccountMappingError";
    }
}

/**
 * Minimal interface for checking if an address is mapped on-chain.
 *
 * The Ink SDK's `createInkSdk(client)` returns an object with this method.
 * We accept it structurally to avoid importing `@polkadot-api/sdk-ink`.
 */
export interface MappingChecker {
    addressIsMapped(address: string): Promise<boolean>;
}

/**
 * Minimal typed API shape for `Revive.map_account()`.
 *
 * Accepted structurally so this module works with any PAPI typed API
 * that has the Revive pallet, without importing chain-specific descriptors.
 */
export interface ReviveApi {
    tx: {
        Revive: {
            map_account(): SubmittableTransaction;
        };
    };
}

/** Options for {@link ensureAccountMapped}. */
export interface EnsureAccountMappedOptions {
    /** Timeout in ms for the map_account transaction. Default: 60_000 (1 minute). */
    timeoutMs?: number;
    /** Called on mapping transaction status changes. */
    onStatus?: (status: "checking" | "mapping" | "mapped" | "already-mapped") => void;
}

/**
 * Ensure an account's SS58 address is mapped to its H160 EVM address on-chain.
 *
 * Account mapping is a prerequisite for any EVM contract interaction on Asset Hub.
 * This function checks the on-chain mapping status and, if unmapped, submits a
 * `Revive.map_account()` transaction and waits for inclusion.
 *
 * Idempotent — safe to call multiple times. Returns immediately if already mapped.
 *
 * @param address - The SS58 address to check/map.
 * @param signer - The signer for the account (must match the address).
 * @param checker - An object with `addressIsMapped()` (e.g., from `createInkSdk(client)`).
 * @param api - A typed API with `tx.Revive.map_account()`.
 * @param options - Optional timeout and status callback.
 * @returns The transaction result if mapping was performed, or `null` if already mapped.
 *
 * @throws {TxAccountMappingError} If the mapping check or transaction fails.
 * @throws {TxDispatchError} If the map_account transaction fails on-chain.
 * @throws {TxTimeoutError} If the mapping transaction times out.
 *
 * @example
 * ```ts
 * import { ensureAccountMapped } from "@polkadot-apps/tx";
 * import { createInkSdk } from "@polkadot-api/sdk-ink";
 *
 * const inkSdk = createInkSdk(client);
 * const api = client.getTypedApi(descriptor);
 *
 * await ensureAccountMapped(address, signer, inkSdk, api);
 * // Account is now mapped — safe to call EVM contracts
 * ```
 */
export async function ensureAccountMapped(
    address: string,
    signer: PolkadotSigner,
    checker: MappingChecker,
    api: ReviveApi,
    options?: EnsureAccountMappedOptions,
): Promise<TxResult | null> {
    const timeoutMs = options?.timeoutMs ?? 60_000;
    const onStatus = options?.onStatus;

    // Step 1: Check if already mapped
    onStatus?.("checking");
    let isMapped: boolean;
    try {
        isMapped = await checker.addressIsMapped(address);
    } catch (cause) {
        throw new TxAccountMappingError(`Failed to check mapping status for ${address}`, { cause });
    }

    if (isMapped) {
        log.debug("account already mapped", { address });
        onStatus?.("already-mapped");
        return null;
    }

    // Step 2: Submit map_account transaction
    log.info("mapping account", { address });
    onStatus?.("mapping");

    const tx = api.tx.Revive.map_account();
    // submitAndWatch throws TxDispatchError on dispatch failure and
    // TxTimeoutError on timeout — both propagate to the caller as documented.
    const result = await submitAndWatch(tx, signer, {
        waitFor: "best-block",
        timeoutMs,
    });

    log.info("account mapped successfully", { address, block: result.block });
    onStatus?.("mapped");
    return result;
}

/**
 * Check if an address is mapped on-chain.
 *
 * Convenience wrapper around `checker.addressIsMapped()` with error handling.
 */
export async function isAccountMapped(address: string, checker: MappingChecker): Promise<boolean> {
    try {
        return await checker.addressIsMapped(address);
    } catch (cause) {
        throw new TxAccountMappingError(`Failed to check mapping status for ${address}`, { cause });
    }
}

/* v8 ignore start */
if (import.meta.vitest) {
    const { describe, test, expect, vi } = import.meta.vitest;

    describe("ensureAccountMapped", () => {
        const mockSigner = {} as PolkadotSigner;

        test("returns null when already mapped", async () => {
            const checker: MappingChecker = {
                addressIsMapped: vi.fn().mockResolvedValue(true),
            };
            const api = {} as ReviveApi;

            const result = await ensureAccountMapped("5Alice", mockSigner, checker, api);
            expect(result).toBeNull();
            expect(checker.addressIsMapped).toHaveBeenCalledWith("5Alice");
        });

        test("calls onStatus with already-mapped when mapped", async () => {
            const statuses: string[] = [];
            const checker: MappingChecker = {
                addressIsMapped: vi.fn().mockResolvedValue(true),
            };

            await ensureAccountMapped("5Alice", mockSigner, checker, {} as ReviveApi, {
                onStatus: (s) => statuses.push(s),
            });
            expect(statuses).toEqual(["checking", "already-mapped"]);
        });

        test("throws TxAccountMappingError when check fails", async () => {
            const checker: MappingChecker = {
                addressIsMapped: vi.fn().mockRejectedValue(new Error("network error")),
            };

            await expect(
                ensureAccountMapped("5Alice", mockSigner, checker, {} as ReviveApi),
            ).rejects.toThrow(TxAccountMappingError);
        });

        test("submits map_account when not mapped", async () => {
            const checker: MappingChecker = {
                addressIsMapped: vi.fn().mockResolvedValue(false),
            };

            const mockTx: SubmittableTransaction = {
                signSubmitAndWatch: (_signer, _options) => ({
                    subscribe: (handlers) => {
                        queueMicrotask(() => {
                            handlers.next({ type: "signed", txHash: "0xabc" });
                            handlers.next({
                                type: "txBestBlocksState",
                                txHash: "0xabc",
                                found: true,
                                ok: true,
                                events: [],
                                block: { hash: "0xblock", number: 1, index: 0 },
                            });
                        });
                        return { unsubscribe: () => {} };
                    },
                }),
            };

            const api: ReviveApi = {
                tx: { Revive: { map_account: () => mockTx } },
            };

            const result = await ensureAccountMapped("5Alice", mockSigner, checker, api);
            expect(result).not.toBeNull();
            expect(result!.ok).toBe(true);
        });

        test("calls onStatus through full mapping flow", async () => {
            const statuses: string[] = [];
            const checker: MappingChecker = {
                addressIsMapped: vi.fn().mockResolvedValue(false),
            };

            const mockTx: SubmittableTransaction = {
                signSubmitAndWatch: (_signer, _options) => ({
                    subscribe: (handlers) => {
                        queueMicrotask(() => {
                            handlers.next({ type: "signed", txHash: "0xabc" });
                            handlers.next({
                                type: "txBestBlocksState",
                                txHash: "0xabc",
                                found: true,
                                ok: true,
                                events: [],
                                block: { hash: "0xblock", number: 1, index: 0 },
                            });
                        });
                        return { unsubscribe: () => {} };
                    },
                }),
            };

            const api: ReviveApi = {
                tx: { Revive: { map_account: () => mockTx } },
            };

            await ensureAccountMapped("5Alice", mockSigner, checker, api, {
                onStatus: (s) => statuses.push(s),
            });
            expect(statuses).toEqual(["checking", "mapping", "mapped"]);
        });

        test("propagates TxDispatchError from submitAndWatch", async () => {
            const { TxDispatchError } = await import("./errors.js");
            const checker: MappingChecker = {
                addressIsMapped: vi.fn().mockResolvedValue(false),
            };

            const mockTx: SubmittableTransaction = {
                signSubmitAndWatch: (_signer, _options) => ({
                    subscribe: (handlers) => {
                        queueMicrotask(() => {
                            handlers.next({
                                type: "txBestBlocksState",
                                txHash: "0xabc",
                                found: true,
                                ok: false,
                                events: [],
                                block: { hash: "0xblock", number: 1, index: 0 },
                                dispatchError: { type: "BadOrigin" },
                            });
                        });
                        return { unsubscribe: () => {} };
                    },
                }),
            };

            const api: ReviveApi = {
                tx: { Revive: { map_account: () => mockTx } },
            };

            await expect(ensureAccountMapped("5Alice", mockSigner, checker, api)).rejects.toThrow(
                TxDispatchError,
            );
        });

        test("propagates TxTimeoutError from submitAndWatch", async () => {
            const { TxTimeoutError } = await import("./errors.js");
            const checker: MappingChecker = {
                addressIsMapped: vi.fn().mockResolvedValue(false),
            };

            const mockTx: SubmittableTransaction = {
                signSubmitAndWatch: (_signer, _options) => ({
                    subscribe: () => ({ unsubscribe: () => {} }),
                }),
            };

            const api: ReviveApi = {
                tx: { Revive: { map_account: () => mockTx } },
            };

            await expect(
                ensureAccountMapped("5Alice", mockSigner, checker, api, { timeoutMs: 50 }),
            ).rejects.toThrow(TxTimeoutError);
        });
    });

    describe("isAccountMapped", () => {
        test("returns true when mapped", async () => {
            const checker: MappingChecker = {
                addressIsMapped: vi.fn().mockResolvedValue(true),
            };
            expect(await isAccountMapped("5Alice", checker)).toBe(true);
        });

        test("returns false when not mapped", async () => {
            const checker: MappingChecker = {
                addressIsMapped: vi.fn().mockResolvedValue(false),
            };
            expect(await isAccountMapped("5Alice", checker)).toBe(false);
        });

        test("throws TxAccountMappingError on failure", async () => {
            const checker: MappingChecker = {
                addressIsMapped: vi.fn().mockRejectedValue(new Error("timeout")),
            };
            await expect(isAccountMapped("5Alice", checker)).rejects.toThrow(TxAccountMappingError);
        });
    });
}
