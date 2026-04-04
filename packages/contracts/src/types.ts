import type { PolkadotSigner, SS58String, HexString } from "polkadot-api";

// ---------------------------------------------------------------------------
// cdm.json schema
// ---------------------------------------------------------------------------

export interface CdmJsonTarget {
    "asset-hub": string;
    bulletin: string;
}

export interface CdmJsonContract {
    version: number;
    address: string;
    abi: AbiEntry[];
    metadataCid: string;
}

export interface CdmJson {
    targets: Record<string, CdmJsonTarget>;
    dependencies: Record<string, Record<string, number | string>>;
    contracts?: Record<string, Record<string, CdmJsonContract>>;
}

// ---------------------------------------------------------------------------
// ABI types (Solidity-compatible, used by both Ink!/PolkaVM and Solidity)
// ---------------------------------------------------------------------------

export interface AbiParam {
    name: string;
    type: string;
    components?: AbiParam[];
}

export interface AbiEntry {
    type: string;
    name?: string;
    inputs: AbiParam[];
    outputs?: AbiParam[];
    stateMutability?: string;
}

// ---------------------------------------------------------------------------
// Contract type system
// ---------------------------------------------------------------------------

/** Per-contract definition shape — generated into `.cdm/contracts.d.ts` via module augmentation. */
export interface ContractDef {
    methods: Record<string, { args: any[]; response: any }>;
}

/**
 * Augmentable interface extended by codegen with per-contract method types.
 *
 * After running `cdm install`, a generated `.d.ts` file augments this
 * interface so that `ContractManager.getContract()` returns fully-typed
 * contract handles.
 */
// biome-ignore lint/suspicious/noEmptyInterface: extended by codegen
export interface Contracts {}

/** Result from a read-only contract query. */
export interface QueryResult<T> {
    success: boolean;
    value: T;
    gasRequired?: bigint;
}

/** Options for query calls — passed as the last argument after positional args. */
export interface QueryOptions {
    origin?: SS58String;
    value?: bigint;
}

/** Options for transaction calls — passed as the last argument after positional args. */
export interface TxOptions {
    signer?: PolkadotSigner;
    origin?: SS58String;
    value?: bigint;
    gasLimit?: { ref_time: bigint; proof_size: bigint };
    storageDepositLimit?: bigint;
}

/** Result from a submitted transaction. */
export interface TxResult {
    txHash: string;
    blockHash: string;
    ok: boolean;
    events: unknown[];
}

/** Mutable defaults shared across all contract handles from a manager. */
export interface ContractDefaults {
    origin?: SS58String;
    signer?: PolkadotSigner;
}

/** Options for {@link ContractManager} construction. */
export interface ContractManagerOptions {
    /** Explicit target hash to select from cdm.json. Defaults to the first target. */
    targetHash?: string;
    /** Default caller address for queries. */
    defaultOrigin?: SS58String;
    /** Default signer for transactions. */
    defaultSigner?: PolkadotSigner;
}

/** A typed contract handle where each method exposes `.query()` and `.tx()`. */
export type Contract<C extends ContractDef> = {
    [K in keyof C["methods"]]: {
        query: (
            ...args: [...C["methods"][K]["args"], opts?: QueryOptions]
        ) => Promise<QueryResult<C["methods"][K]["response"]>>;
        tx: (...args: [...C["methods"][K]["args"], opts?: TxOptions]) => Promise<TxResult>;
    };
};
