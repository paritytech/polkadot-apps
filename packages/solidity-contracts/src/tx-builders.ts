import { Binary } from "polkadot-api";
import type { FixedSizeBinary } from "polkadot-api";

import { toH160 } from "@polkadot-apps/address";

import type { EthTransactTx, ReviveTypedApi, U256 } from "./types.js";

/**
 * Convert a bigint to U256 (four u64 limbs, little-endian).
 *
 * Pallet-revive represents `uint256` values as `FixedSizeArray<4, bigint>`
 * where each element is a u64 limb. Limb 0 holds the least-significant 64 bits.
 *
 * @param value - A non-negative bigint. Values exceeding 2^256 - 1 are truncated.
 * @returns A four-element tuple of bigints representing the U256 value.
 *
 * @example
 * ```ts
 * toU256(1_000_000_000_000_000_000n); // 1 ETH in wei
 * // => [1000000000000000000n, 0n, 0n, 0n]
 * ```
 */
export function toU256(value: bigint): U256 {
    const mask = (1n << 64n) - 1n;
    return [value & mask, (value >> 64n) & mask, (value >> 128n) & mask, (value >> 192n) & mask];
}

/**
 * Build an {@link EthTransactTx} object for `ReviveApi.eth_transact` dry-runs.
 *
 * Constructs the Ethereum-style transaction required by the runtime API.
 * The `from` field accepts both SS58 and H160 addresses — it is automatically
 * converted to H160 via `@polkadot-apps/address.toH160()`.
 *
 * @param opts.to - The H160 contract address to call.
 * @param opts.callData - ABI-encoded function call data.
 * @param opts.from - Optional sender address (SS58 or H160). Omit for anonymous calls.
 * @param opts.value - Optional wei value to send with the call.
 * @returns An {@link EthTransactTx} ready to pass to `ReviveApi.eth_transact`.
 *
 * @example
 * ```ts
 * const tx = buildEthTransactTx({
 *     to: "0x1234...abcd",
 *     callData: "0xa9059cbb...",
 *     from: "5GrwvaEF...",
 *     value: 1_000_000_000_000_000_000n,
 * });
 * const result = await typedApi.apis.ReviveApi.eth_transact(tx, { at: "best" });
 * ```
 */
export function buildEthTransactTx(opts: {
    to: `0x${string}`;
    callData: `0x${string}`;
    from?: string;
    value?: bigint;
}): EthTransactTx {
    const fromAddress = opts.from
        ? (Binary.fromHex(toH160(opts.from)) as FixedSizeBinary<20>)
        : undefined;

    return {
        to: Binary.fromHex(opts.to) as FixedSizeBinary<20>,
        value: opts.value ? toU256(opts.value) : undefined,
        input: { data: Binary.fromHex(opts.callData) },
        from: fromAddress,
        authorization_list: [],
        blob_versioned_hashes: [],
        blobs: [],
        gas_price: undefined,
        nonce: undefined,
        access_list: undefined,
        chain_id: undefined,
        gas: undefined,
        max_fee_per_blob_gas: undefined,
        max_fee_per_gas: undefined,
        max_priority_fee_per_gas: undefined,
        "r#type": undefined,
    };
}

/**
 * Build a `tx.Revive.call` PAPI transaction from dry-run results.
 *
 * Takes the weight and storage deposit estimates from a successful dry-run
 * and constructs a submittable `Revive.call` extrinsic. Applies a safety
 * buffer to weight and storage estimates to account for on-chain state changes
 * between dry-run and actual execution.
 *
 * @param typedApi - A typed API with the Revive pallet.
 * @param opts.dest - The H160 contract address.
 * @param opts.callData - ABI-encoded function call data.
 * @param opts.value - Optional wei value. Converted to planck by dividing by `nativeToEvmRatio`.
 * @param opts.nativeToEvmRatio - The chain's `NativeToEthRatio` constant.
 * @param opts.gasRequired - Weight estimate from dry-run (`weight_required`).
 * @param opts.storageDeposit - Storage deposit estimate from dry-run (`max_storage_deposit`).
 * @returns A submittable PAPI transaction.
 *
 * @example
 * ```ts
 * const tx = buildReviveCallTx(typedApi, {
 *     dest: "0x1234...abcd",
 *     callData: "0xa9059cbb...",
 *     value: 1_000_000_000_000_000_000n,
 *     nativeToEvmRatio: 1_000_000n,
 *     gasRequired: dryRun.weight_required,
 *     storageDeposit: dryRun.max_storage_deposit,
 * });
 * await tx.signSubmitAndWatch(signer);
 * ```
 */
export function buildReviveCallTx(
    typedApi: ReviveTypedApi,
    opts: {
        dest: `0x${string}`;
        callData: `0x${string}`;
        value?: bigint;
        nativeToEvmRatio: bigint;
        gasRequired: { ref_time: bigint; proof_size: bigint };
        storageDeposit: bigint;
    },
) {
    return typedApi.tx.Revive.call({
        dest: Binary.fromHex(opts.dest) as FixedSizeBinary<20>,
        // Convert wei → planck: pallet-revive multiplies value by NativeToEvmRatio internally
        value: opts.value ? opts.value / opts.nativeToEvmRatio : 0n,
        // 2x safety margin for weight — covers proxy overhead and dry-run vs
        // real execution variance in pallet-revive gas mapping
        weight_limit: {
            ref_time: opts.gasRequired.ref_time * 2n,
            proof_size: opts.gasRequired.proof_size * 2n,
        },
        storage_deposit_limit: opts.storageDeposit * 2n,
        data: Binary.fromHex(opts.callData),
    });
}

if (import.meta.vitest) {
    const { describe, test, expect } = import.meta.vitest;

    describe("toU256", () => {
        test("converts zero", () => {
            expect(toU256(0n)).toEqual([0n, 0n, 0n, 0n]);
        });

        test("converts small value fitting in first limb", () => {
            expect(toU256(42n)).toEqual([42n, 0n, 0n, 0n]);
        });

        test("converts value at first limb boundary", () => {
            const maxU64 = (1n << 64n) - 1n;
            expect(toU256(maxU64)).toEqual([maxU64, 0n, 0n, 0n]);
        });

        test("converts value spanning two limbs", () => {
            const val = 1n << 64n; // first bit of second limb
            expect(toU256(val)).toEqual([0n, 1n, 0n, 0n]);
        });

        test("converts 1 ETH in wei (10^18)", () => {
            const oneEth = 1_000_000_000_000_000_000n;
            expect(toU256(oneEth)).toEqual([oneEth, 0n, 0n, 0n]);
        });

        test("converts value spanning all four limbs", () => {
            const maxU256 = (1n << 256n) - 1n;
            const maxU64 = (1n << 64n) - 1n;
            expect(toU256(maxU256)).toEqual([maxU64, maxU64, maxU64, maxU64]);
        });

        test("converts known multi-limb value", () => {
            // 2^128 = limbs [0, 0, 1, 0]
            expect(toU256(1n << 128n)).toEqual([0n, 0n, 1n, 0n]);
        });

        test("converts value at third limb boundary", () => {
            // 2^192 = limbs [0, 0, 0, 1]
            expect(toU256(1n << 192n)).toEqual([0n, 0n, 0n, 1n]);
        });
    });

    describe("buildEthTransactTx", () => {
        test("builds minimal tx with only to and callData", () => {
            const tx = buildEthTransactTx({
                to: "0x1234567890abcdef1234567890abcdef12345678",
                callData: "0xa9059cbb",
            });

            expect(tx.to).toBeDefined();
            expect(tx.input.data).toBeDefined();
            expect(tx.from).toBeUndefined();
            expect(tx.value).toBeUndefined();
            expect(tx.authorization_list).toEqual([]);
            expect(tx.blob_versioned_hashes).toEqual([]);
            expect(tx.blobs).toEqual([]);
        });

        test("includes from when provided as H160", () => {
            const tx = buildEthTransactTx({
                to: "0x1234567890abcdef1234567890abcdef12345678",
                callData: "0xa9059cbb",
                from: "0xabcdef1234567890abcdef1234567890abcdef12",
            });

            expect(tx.from).toBeDefined();
        });

        test("includes value as U256 when provided", () => {
            const tx = buildEthTransactTx({
                to: "0x1234567890abcdef1234567890abcdef12345678",
                callData: "0xa9059cbb",
                value: 1_000_000_000_000_000_000n,
            });

            expect(tx.value).toEqual(toU256(1_000_000_000_000_000_000n));
        });

        test("omits value when not provided", () => {
            const tx = buildEthTransactTx({
                to: "0x1234567890abcdef1234567890abcdef12345678",
                callData: "0xa9059cbb",
            });

            expect(tx.value).toBeUndefined();
        });
    });

    describe("buildReviveCallTx", () => {
        const mockReviveCall = (args: unknown) => ({ args }) as unknown;
        const mockTypedApi = {
            tx: {
                Revive: {
                    call: mockReviveCall,
                },
            },
        } as unknown as ReviveTypedApi;

        test("applies 2x safety margin to weight", () => {
            const result = buildReviveCallTx(mockTypedApi, {
                dest: "0x1234567890abcdef1234567890abcdef12345678",
                callData: "0xa9059cbb",
                nativeToEvmRatio: 1_000_000n,
                gasRequired: { ref_time: 1000n, proof_size: 500n },
                storageDeposit: 100n,
            });

            // The mock returns the args object directly
            const args = (result as unknown as { args: Record<string, unknown> }).args;
            const weight = args.weight_limit as { ref_time: bigint; proof_size: bigint };
            expect(weight.ref_time).toBe(2000n);
            expect(weight.proof_size).toBe(1000n);
        });

        test("applies 2x safety margin to storage deposit", () => {
            const result = buildReviveCallTx(mockTypedApi, {
                dest: "0x1234567890abcdef1234567890abcdef12345678",
                callData: "0xa9059cbb",
                nativeToEvmRatio: 1_000_000n,
                gasRequired: { ref_time: 1000n, proof_size: 500n },
                storageDeposit: 100n,
            });

            const args = (result as unknown as { args: Record<string, unknown> }).args;
            expect(args.storage_deposit_limit).toBe(200n);
        });

        test("converts wei to planck by dividing by nativeToEvmRatio", () => {
            const result = buildReviveCallTx(mockTypedApi, {
                dest: "0x1234567890abcdef1234567890abcdef12345678",
                callData: "0xa9059cbb",
                value: 1_000_000_000_000_000_000n, // 1 ETH in wei
                nativeToEvmRatio: 1_000_000n,
                gasRequired: { ref_time: 1000n, proof_size: 500n },
                storageDeposit: 100n,
            });

            const args = (result as unknown as { args: Record<string, unknown> }).args;
            // 1e18 / 1e6 = 1e12
            expect(args.value).toBe(1_000_000_000_000n);
        });

        test("uses 0n for value when not provided", () => {
            const result = buildReviveCallTx(mockTypedApi, {
                dest: "0x1234567890abcdef1234567890abcdef12345678",
                callData: "0xa9059cbb",
                nativeToEvmRatio: 1_000_000n,
                gasRequired: { ref_time: 1000n, proof_size: 500n },
                storageDeposit: 100n,
            });

            const args = (result as unknown as { args: Record<string, unknown> }).args;
            expect(args.value).toBe(0n);
        });
    });
}
