import { bulletin } from "@polkadot-apps/descriptors";
import type { TypedApi } from "polkadot-api";
import type { TxStatus, WaitFor } from "@polkadot-apps/tx";

/** Typed API for the Bulletin Chain, derived from PAPI descriptors. */
export type BulletinApi = TypedApi<typeof bulletin>;

/** Network environment. Matches chain-client's Environment type. */
export type Environment = "polkadot" | "kusama" | "paseo";

/** Options for {@link upload}. */
export interface UploadOptions {
    /** IPFS gateway base URL (e.g., from `getGateway("paseo")`). If provided, result includes gatewayUrl. */
    gateway?: string;
    /** When to resolve: `"best-block"` (default) or `"finalized"`. Passed to submitAndWatch. */
    waitFor?: WaitFor;
    /** Timeout in ms. Default: 300_000 (5 min). Passed to submitAndWatch. */
    timeoutMs?: number;
    /** Lifecycle status callback for UI progress. Passed to submitAndWatch. */
    onStatus?: (status: TxStatus) => void;
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
    | {
          /** Upload was performed via a signed transaction. */
          kind: "transaction";
          /** CIDv1 string (blake2b-256, raw codec). */
          cid: string;
          /** Block hash where the store transaction was included. */
          blockHash: string;
          /** Gateway URL. Present only if `gateway` was provided in options. */
          gatewayUrl?: string;
      }
    | {
          /** Upload was performed via the host preimage API. */
          kind: "preimage";
          /** CIDv1 string (blake2b-256, raw codec). */
          cid: string;
          /** Hex key returned by the host preimage API. */
          preimageKey: string;
          /** Gateway URL. Present only if `gateway` was provided in options. */
          gatewayUrl?: string;
      };

/** A single item in a batch upload. */
export interface BatchUploadItem {
    /** Raw bytes to upload. */
    data: Uint8Array;
    /** Label for progress tracking (e.g., filename). */
    label: string;
}

/**
 * Result for one item in a batch upload.
 *
 * When `success` is `true`, either `blockHash` (transaction path) or
 * `preimageKey` (preimage path) will be present. When `success` is `false`,
 * `error` describes the failure.
 */
export interface BatchUploadResult {
    label: string;
    cid: string;
    success: boolean;
    /** Block hash. Present on successful transaction uploads. */
    blockHash?: string;
    /** Hex key from host preimage API. Present on successful preimage uploads. */
    preimageKey?: string;
    gatewayUrl?: string;
    error?: string;
}

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
