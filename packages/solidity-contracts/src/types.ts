import type { Binary, FixedSizeBinary } from "polkadot-api";

/**
 * Four u64 limbs in little-endian order representing a 256-bit unsigned integer.
 * Used for Ethereum `uint256` values (e.g., wei amounts).
 */
export type U256 = [bigint, bigint, bigint, bigint];

/**
 * Weight descriptor used by pallet-revive for gas metering.
 */
export interface Weight {
    ref_time: bigint;
    proof_size: bigint;
}

/**
 * Ethereum-style transaction for `ReviveApi.eth_transact` dry-runs.
 *
 * Matches the `GenericTransaction` shape expected by the runtime API.
 * Only the fields relevant for contract calls are required; the rest are
 * optional and default to `undefined`.
 */
export interface EthTransactTx {
    blob_versioned_hashes: Array<FixedSizeBinary<32>>;
    authorization_list: Array<unknown>;
    blobs: Array<Binary>;
    from?: FixedSizeBinary<20> | undefined;
    input: {
        input?: Binary | undefined;
        data?: Binary | undefined;
    };
    to?: FixedSizeBinary<20> | undefined;
    value?: U256 | undefined;
    gas_price?: unknown;
    nonce?: unknown;
    access_list?: unknown;
    chain_id?: unknown;
    gas?: unknown;
    max_fee_per_blob_gas?: unknown;
    max_fee_per_gas?: unknown;
    max_priority_fee_per_gas?: unknown;
    "r#type"?: unknown;
}

/**
 * Successful result from `ReviveApi.eth_transact`.
 */
export interface EthTransactResult {
    data: Binary;
    weight_required: Weight;
    max_storage_deposit: bigint;
}

/**
 * Failure value from `ReviveApi.eth_transact`.
 *
 * The runtime returns an Enum with two variants:
 * - `{ type: "Message", value: string }` — runtime-level error (balance, gas, etc.)
 * - `{ type: "Data", value: Binary }` — contract revert data (Error(string) or custom error)
 */
export type EthTransactError = { type: "Message"; value: string } | { type: "Data"; value: Binary };

/**
 * Minimal structural interface for a PAPI typed API that has the Revive pallet.
 *
 * Defined structurally so this package works with any chain descriptor that
 * includes pallet-revive — no import of chain-specific descriptors needed.
 */
export interface ReviveTypedApi {
    apis: {
        ReviveApi: {
            eth_transact(
                tx: EthTransactTx,
                options?: { at: string },
            ): Promise<{
                success: boolean;
                value: EthTransactResult | EthTransactError;
            }>;
        };
    };
    tx: {
        Revive: {
            call(args: {
                dest: FixedSizeBinary<20>;
                value: bigint;
                weight_limit: Weight;
                storage_deposit_limit: bigint;
                data: Binary;
            }): SubmittableTransaction;
        };
    };
    constants: {
        Revive: {
            NativeToEthRatio(): Promise<bigint>;
        };
    };
}

/**
 * A PAPI transaction that can be signed, submitted, and watched.
 *
 * Structural type matching the shape returned by `typedApi.tx.Pallet.method()`.
 */
export interface SubmittableTransaction {
    signSubmitAndWatch(
        signer: unknown,
        options?: unknown,
    ): {
        subscribe(handlers: {
            next: (event: unknown) => void;
            error?: (err: unknown) => void;
            complete?: () => void;
        }): { unsubscribe: () => void };
    };
}

/**
 * Result of a successful write dry-run.
 * Callers use `send()` to create the on-chain transaction.
 */
export interface SolidityWriteResult {
    /** Decoded return value from the dry-run simulation. */
    response: unknown;
    /** Create a PAPI Transaction for on-chain submission. */
    send(): SubmittableTransaction;
    /** Re-run dry-run after on-chain failure to decode the revert reason. */
    diagnose(): Promise<string | undefined>;
}

/**
 * Generic Solidity contract interface for calling any contract via PAPI.
 *
 * Uses viem for ABI encoding/decoding and `ReviveApi.eth_transact` for execution.
 * Works with any Solidity contract deployed on a pallet-revive chain.
 */
export interface SolidityContract {
    /** Call a `view` or `pure` function and return the decoded result. */
    read(functionName: string, args?: unknown[]): Promise<unknown>;
    /** Dry-run a state-changing function, return `send()` for submission. */
    write(
        functionName: string,
        args: unknown[],
        origin: string,
        value?: bigint,
    ): Promise<SolidityWriteResult>;
}

/**
 * Options for {@link createSolidityContract}.
 */
export interface CreateSolidityContractOptions {
    /**
     * Override the wei-to-planck conversion ratio.
     *
     * When omitted, the ratio is read lazily from `constants.Revive.NativeToEthRatio`
     * on the first `write()` call and cached for subsequent calls.
     */
    nativeToEvmRatio?: bigint;
}
