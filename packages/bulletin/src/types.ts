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

/** Result of a successful upload to the Bulletin Chain. */
export interface UploadResult {
    /** CIDv1 string (blake2b-256, raw codec). */
    cid: string;
    /** Block hash where the store transaction was included. */
    blockHash: string;
    /** Gateway URL. Present only if `gateway` was provided in options. */
    gatewayUrl?: string;
}

/** A single item in a batch upload. */
export interface BatchUploadItem {
    /** Raw bytes to upload. */
    data: Uint8Array;
    /** Label for progress tracking (e.g., filename). */
    label: string;
}

/** Result for one item in a batch upload. */
export interface BatchUploadResult {
    label: string;
    cid: string;
    success: boolean;
    blockHash: string;
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
