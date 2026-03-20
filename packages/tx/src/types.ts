import type { PolkadotSigner } from "polkadot-api";

/** Transaction lifecycle status for UI callbacks. */
export type TxStatus = "signing" | "broadcasting" | "in-block" | "finalized" | "error";

/** When to resolve the submission promise. */
export type WaitFor = "best-block" | "finalized";

/** Successful transaction result. */
export interface TxResult {
    /** Transaction hash. */
    txHash: string;
    /** Whether the on-chain dispatch succeeded. */
    ok: boolean;
    /** Block where the transaction was included. */
    block: { hash: string; number: number; index: number };
    /** Raw events emitted by the transaction. */
    events: unknown[];
    /** Dispatch error details when ok is false. */
    dispatchError?: unknown;
}

/** Options for {@link submitAndWatch}. */
export interface SubmitOptions {
    /** When to resolve the promise. Default: `"best-block"`. */
    waitFor?: WaitFor;
    /** Timeout in milliseconds. Default: `300_000` (5 minutes). */
    timeoutMs?: number;
    /** Mortality period in blocks. Default: `256` (~43 minutes on Polkadot). */
    mortalityPeriod?: number;
    /** Called on each lifecycle transition for UI progress indicators. */
    onStatus?: (status: TxStatus) => void;
}

/** Options for {@link withRetry}. */
export interface RetryOptions {
    /** Total attempts including the first. Default: `3`. */
    maxAttempts?: number;
    /** Base delay in ms for exponential backoff. Default: `1_000`. */
    baseDelayMs?: number;
    /** Maximum delay in ms. Default: `15_000`. */
    maxDelayMs?: number;
}

/**
 * Substrate weight representing computational and storage resources.
 *
 * Matches the shape returned by `ReviveApi.call` and `ReviveApi.eth_transact`
 * dry-run results in the `weight_required` field.
 */
export interface Weight {
    /** Reference time component in picoseconds. */
    ref_time: bigint;
    /** Proof size component in bytes. */
    proof_size: bigint;
}

/** Standard Substrate dev account names. */
export type DevAccountName = "Alice" | "Bob" | "Charlie" | "Dave" | "Eve" | "Ferdie";

/**
 * Structural type for any transaction object that supports Observable-based
 * sign-submit-and-watch. Works with raw PAPI transactions and Ink SDK
 * resolved transactions.
 */
export interface SubmittableTransaction {
    signSubmitAndWatch: (
        signer: PolkadotSigner,
        options?: { mortality?: { mortal: boolean; period: number } },
    ) => {
        subscribe: (handlers: {
            next: (event: TxEvent) => void;
            error: (error: Error) => void;
        }) => { unsubscribe: () => void };
    };
    /** Present on Ink SDK AsyncTransaction wrappers. */
    waited?: Promise<SubmittableTransaction>;
}

/** PAPI transaction event (discriminated union). */
export type TxEvent =
    | { type: "signed"; txHash: string }
    | { type: "broadcasted"; txHash: string }
    | {
          type: "txBestBlocksState";
          txHash: string;
          found: boolean;
          ok?: boolean;
          events?: unknown[];
          block?: { hash: string; number: number; index: number };
          dispatchError?: unknown;
      }
    | {
          type: "finalized";
          txHash: string;
          ok: boolean;
          events: unknown[];
          block: { hash: string; number: number; index: number };
          dispatchError?: unknown;
      };
