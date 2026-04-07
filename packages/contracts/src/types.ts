import type { HexString, PolkadotSigner, SS58String } from "polkadot-api";
import type { SubmitOptions, TxResult, Weight } from "@polkadot-apps/tx";

// Re-export from the tx package — single source of truth.
export type { TxResult, SubmitOptions } from "@polkadot-apps/tx";

// ---------------------------------------------------------------------------
// cdm.json schema
// ---------------------------------------------------------------------------

export interface CdmJsonTarget {
    "asset-hub": string;
    bulletin: string;
}

export interface CdmJsonContract {
    version: number;
    address: HexString;
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
export interface TxOptions extends SubmitOptions {
    signer?: PolkadotSigner;
    origin?: SS58String;
    value?: bigint;
    gasLimit?: Weight;
    storageDepositLimit?: bigint;
}

/**
 * Reactive signer source — provides the currently logged-in account's
 * signer and address.
 *
 * {@link SignerManager} from `@polkadot-apps/signer` satisfies this
 * interface structurally — no import required.
 *
 * Resolved at **call time** so account switches are picked up
 * automatically without re-creating contracts.
 */
export interface SignerSource {
    /** Get the PolkadotSigner for the currently selected account. */
    getSigner(): PolkadotSigner | null;
    /** Get the current state including the selected account's address. */
    getState(): { selectedAccount: { address: string } | null };
}

/** Mutable defaults shared across all contract handles from a manager. */
export interface ContractDefaults {
    origin?: SS58String;
    signer?: PolkadotSigner;
    signerSource?: SignerSource;
}

/**
 * Options for {@link createContract} and base for {@link ContractManagerOptions}.
 *
 * Signer resolution order (highest wins):
 * 1. Explicit override in call options
 * 2. `signerSource` (current logged-in account)
 * 3. Static `defaultSigner` / `defaultOrigin`
 */
export interface ContractOptions {
    /**
     * Reactive signer source — typically a `SignerManager` from
     * `@polkadot-apps/signer`. When provided, the currently selected
     * account is used as the default signer and origin for all contract
     * interactions. Checked at call time so account switches are
     * reflected immediately.
     */
    signerSource?: SignerSource;
    /** Static fallback caller address for queries. */
    defaultOrigin?: SS58String;
    /** Static fallback signer for transactions. */
    defaultSigner?: PolkadotSigner;
}

/** Options for {@link ContractManager} construction. */
export interface ContractManagerOptions extends ContractOptions {
    /** Explicit target hash to select from cdm.json. Defaults to the first target. */
    targetHash?: string;
}

/**
 * A typed contract handle where each ABI method exposes `.query()` and `.tx()`.
 *
 * Both accept the method's positional arguments followed by an optional
 * options object as the last argument.
 */
export type Contract<C extends ContractDef> = {
    [K in keyof C["methods"]]: {
        /**
         * Dry-run the method (read-only). Does not submit a transaction or
         * cost gas. Returns the decoded response and estimated gas required.
         *
         * Origin is resolved from: explicit `{ origin }` option → signerSource →
         * defaultOrigin → dev fallback (Alice).
         */
        query: (
            ...args: [...C["methods"][K]["args"], opts?: QueryOptions]
        ) => Promise<QueryResult<C["methods"][K]["response"]>>;
        /**
         * Sign, submit, and watch the method as an on-chain transaction.
         * Resolves at best-block by default (configurable via `waitFor`).
         *
         * Signer is resolved from: explicit `{ signer }` option → signerSource →
         * defaultSigner. Throws {@link ContractSignerMissingError} if none available.
         */
        tx: (...args: [...C["methods"][K]["args"], opts?: TxOptions]) => Promise<TxResult>;
    };
};
