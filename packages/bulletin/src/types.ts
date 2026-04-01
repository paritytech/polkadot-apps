import { bulletin } from "@polkadot-apps/descriptors";
import type { TypedApi } from "polkadot-api";
import type { TxStatus, WaitFor } from "@polkadot-apps/tx";

/** Typed API for the Bulletin Chain, derived from PAPI descriptors. */
export type BulletinApi = TypedApi<typeof bulletin>;

/** Network environment. Matches chain-client's Environment type. */
export type Environment = "polkadot" | "kusama" | "paseo";

/**
 * Options for {@link upload}.
 *
 * Note: `waitFor`, `timeoutMs`, and `onStatus` only apply to the **transaction**
 * upload path (when an explicit signer is used or the dev signer fallback is active).
 * The preimage path delegates to the host which controls its own submission
 * lifecycle — these options are ignored in that case.
 */
export interface UploadOptions {
    /** IPFS gateway base URL (e.g., from `getGateway("paseo")`). If provided, result includes gatewayUrl. */
    gateway?: string;
    /** When to resolve: `"best-block"` (default) or `"finalized"`. Transaction path only. */
    waitFor?: WaitFor;
    /** Timeout in ms. Default: 300_000 (5 min). Transaction path only. */
    timeoutMs?: number;
    /** Lifecycle status callback for UI progress. Transaction path only. */
    onStatus?: (status: TxStatus) => void;
}

/** Fields common to all upload results. */
interface UploadResultBase {
    /** CIDv1 string (blake2b-256, raw codec). */
    cid: string;
    /** Gateway URL. Present only if `gateway` was provided in options. */
    gatewayUrl?: string;
}

/**
 * Result of a successful upload to the Bulletin Chain.
 *
 * Discriminated on `kind`:
 * - `"transaction"` — uploaded via a signed `TransactionStorage.store` extrinsic.
 * - `"preimage"` — uploaded via the host preimage API (no user signing).
 *
 * Use `result.kind` to narrow the type and access path-specific fields.
 */
export type UploadResult =
    | (UploadResultBase & {
          /** Upload was performed via a signed transaction. */
          kind: "transaction";
          /** Block hash where the store transaction was included. */
          blockHash: string;
      })
    | (UploadResultBase & {
          /** Upload was performed via the host preimage API. */
          kind: "preimage";
          /** Hex key returned by the host preimage API. */
          preimageKey: string;
      });

/** A single item in a batch upload. */
export interface BatchUploadItem {
    /** Raw bytes to upload. */
    data: Uint8Array;
    /** Label for progress tracking (e.g., filename). */
    label: string;
}

/** Fields common to all batch upload results. */
interface BatchUploadResultBase {
    label: string;
    cid: string;
    gatewayUrl?: string;
}

/**
 * Result for one item in a batch upload.
 *
 * Discriminated on `kind` (upload path) and `success` (outcome).
 * Use `result.success` to check for errors, then `result.kind` to access
 * path-specific fields like `blockHash` or `preimageKey`.
 */
export type BatchUploadResult =
    | (BatchUploadResultBase & {
          kind: "transaction";
          success: true;
          /** Block hash where the store transaction was included. */
          blockHash: string;
      })
    | (BatchUploadResultBase & {
          kind: "preimage";
          success: true;
          /** Hex key returned by the host preimage API. */
          preimageKey: string;
      })
    | (BatchUploadResultBase & {
          kind: "transaction" | "preimage";
          success: false;
          /** Error message describing the failure. */
          error: string;
      });

/** Options for {@link batchUpload}. */
export interface BatchUploadOptions extends UploadOptions {
    /** Called after each item completes (success or failure). */
    onProgress?: (completed: number, total: number, current: BatchUploadResult) => void;
}

/** Options for gateway fetch operations. */
export interface FetchOptions {
    /** Timeout in ms. Default: 30_000. */
    timeoutMs?: number;
}

/** Options for query operations that support host lookup auto-resolution. */
export interface QueryOptions extends FetchOptions {
    /**
     * Timeout for the host preimage lookup subscription in ms.
     * Only applies when the query resolves through the host path.
     * Default: 30_000.
     */
    lookupTimeoutMs?: number;
}
