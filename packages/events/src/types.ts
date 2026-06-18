import type { Environment } from "@polkadot-apps/chain-client";

// ============================================================================
// Subscription handle
// ============================================================================

/** Handle returned by watch methods. Call `unsubscribe()` to stop receiving events. */
export interface Unsubscribable {
    unsubscribe: () => void;
}

// ============================================================================
// Raw contract event
// ============================================================================

/** Raw `Revive.ContractEmitted` payload before Ink SDK decoding. */
export interface RawContractEvent {
    contract: { asHex: () => string };
    data: { asHex: () => string };
    topics: Array<{ asHex: () => string }>;
}

// ============================================================================
// Event shapes
// ============================================================================

/**
 * Structural type matching papi's `api.event.Pallet.Event`.
 *
 * This allows the watch/filter helpers to accept any papi event descriptor
 * without importing concrete chain types.
 */
export interface EventDescriptor<T = unknown> {
    watch: (filter?: (value: T) => boolean) => {
        subscribe: (handlers: {
            next: (event: EventOccurrence<T>) => void;
            error: (error: Error) => void;
        }) => { unsubscribe: () => void };
    };
    filter: (events: unknown[]) => T[];
}

/** Shape of an event emitted by papi's `.watch()` Observable. */
export interface EventOccurrence<T = unknown> {
    payload: T;
    meta: {
        phase: { type: string; value?: number };
        block: { hash: string; number: number };
    };
}

// ============================================================================
// Configuration
// ============================================================================

/** Configuration for {@link EventClient}. */
export interface EventClientConfig {
    /** Which environment to connect to. @default "paseo" */
    env?: Environment;
}

/**
 * Block selection mode for event watching.
 *
 * - `"finalized"` — Events from finalized blocks (default). Higher latency (~12-18s)
 *   but guaranteed to not be reverted.
 * - `"best"` — Events from best (latest) blocks. Lower latency but may include
 *   events from blocks that are later reorged.
 */
export type BlockMode = "finalized" | "best";

/** Options controlling retry behaviour for watch methods. */
export interface WatchOptions {
    /** Block selection mode. @default "finalized" */
    mode?: BlockMode;
    /** Delay in ms before resubscribing after a transient error. @default 2000 */
    retryDelayMs?: number;
    /** Maximum consecutive retry attempts before giving up (0 = unlimited). @default 5 */
    maxRetries?: number;
    /** Called when a transient error triggers a resubscription attempt. */
    onRetry?: (error: Error, attempt: number) => void;
    /** Called when retries are exhausted and watching has stopped. */
    onFatalError?: (error: Error) => void;
}
