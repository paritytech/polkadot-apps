// ============================================================================
// Constants
// ============================================================================

/** Maximum size of a single statement's data payload in bytes. */
export const MAX_STATEMENT_SIZE = 512;

/** Maximum total storage per user in bytes. */
export const MAX_USER_TOTAL = 1024;

/** Default time-to-live for published statements in seconds. */
export const DEFAULT_TTL_SECONDS = 30;

/** Default polling interval in milliseconds for the fallback poller. */
export const DEFAULT_POLL_INTERVAL_MS = 10_000;

// ============================================================================
// Branded Types
// ============================================================================

/**
 * A 32-byte blake2b-256 hash used as a statement topic.
 *
 * Topics allow subscribers to filter statements efficiently on the network.
 * Create one with {@link createTopic}.
 */
export type TopicHash = Uint8Array & { readonly __brand: "TopicHash" };

/**
 * A 32-byte blake2b-256 hash used as a statement channel identifier.
 *
 * Channels enable last-write-wins semantics: for a given channel,
 * only the most recent statement (by timestamp) is kept.
 * Create one with {@link createChannel}.
 */
export type ChannelHash = Uint8Array & { readonly __brand: "ChannelHash" };

// ============================================================================
// Statement Types
// ============================================================================

/**
 * Raw statement fields before signing.
 *
 * These map directly to the SCALE-encoded fields in the on-chain statement format.
 * Field tags: 0=proof, 2=expiry, 3=decryptionKey, 4=topic1, 5=topic2, 6=channel, 8=data.
 */
export interface StatementFields {
    /** Unix timestamp (seconds) at which the statement expires. */
    expirationTimestamp: number;
    /** Sequence number for ordering within the same expiry window. */
    sequenceNumber: number;
    /** Optional 32-byte decryption key hint for filtering polled statements. */
    decryptionKey?: Uint8Array;
    /** Optional 32-byte channel hash for last-write-wins deduplication. */
    channel?: Uint8Array;
    /** Primary topic hash (32 bytes). Typically the application namespace. */
    topic1?: Uint8Array;
    /** Secondary topic hash (32 bytes). Typically the room or document ID. */
    topic2?: Uint8Array;
    /** Arbitrary data payload (max {@link MAX_STATEMENT_SIZE} bytes). */
    data?: Uint8Array;
}

/**
 * A statement decoded from the network.
 *
 * Contains all parsed fields from the SCALE-encoded on-chain representation.
 * The `signer` field is extracted from the Sr25519 authenticity proof.
 */
export interface DecodedStatement {
    /** 32-byte Sr25519 public key of the statement signer. */
    signer?: Uint8Array;
    /**
     * Combined expiry value: upper 32 bits are the Unix timestamp,
     * lower 32 bits are the sequence number.
     */
    expiry?: bigint;
    /** 32-byte decryption key hint. */
    decryptionKey?: Uint8Array;
    /** Primary topic (32 bytes). */
    topic1?: Uint8Array;
    /** Secondary topic (32 bytes). */
    topic2?: Uint8Array;
    /** Channel hash (32 bytes). */
    channel?: Uint8Array;
    /** Raw data payload. */
    data?: Uint8Array;
}

// ============================================================================
// Topic Filtering
// ============================================================================

/**
 * Filter for statement subscriptions and queries.
 *
 * - `"any"` — matches all statements (no filtering).
 * - `{ matchAll: [...] }` — matches statements that have **all** listed topics.
 * - `{ matchAny: [...] }` — matches statements that have **any** listed topic.
 */
export type TopicFilter = "any" | { matchAll: TopicHash[] } | { matchAny: TopicHash[] };

/** Serialized topic filter with hex-encoded topics, ready for JSON-RPC. */
export type SerializedTopicFilter = "any" | { matchAll: string[] } | { matchAny: string[] };

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for {@link StatementStoreClient}.
 *
 * Provide either `endpoint` for a direct WebSocket connection to a statement store node,
 * or rely on the chain-client's bulletin chain connection (the default).
 */
export interface StatementStoreConfig {
    /**
     * Application namespace used as the primary topic (topic1).
     *
     * All statements published by this client are tagged with `blake2b(appName)`.
     * Subscribers filter on this topic to receive only relevant statements.
     *
     * @example "ss-webrtc", "mark3t-presence", "my-app"
     */
    appName: string;

    /**
     * Direct WebSocket endpoint for the statement store node.
     *
     * When provided, the client connects directly to this endpoint
     * instead of using the chain-client's bulletin chain.
     *
     * @example "wss://paseo-bulletin-rpc.polkadot.io"
     */
    endpoint?: string;

    /**
     * Polling interval in milliseconds for the fallback poller.
     *
     * The client uses both subscriptions (real-time) and polling (fallback)
     * to ensure no statements are missed. Set to 0 to disable polling.
     *
     * @default 10_000
     */
    pollIntervalMs?: number;

    /**
     * Default time-to-live for published statements in seconds.
     *
     * Statements automatically expire after this duration.
     * Can be overridden per-publish via {@link PublishOptions.ttlSeconds}.
     *
     * @default 30
     */
    defaultTtlSeconds?: number;

    /**
     * Whether to enable the polling fallback.
     *
     * When true (default), the client polls for statements periodically
     * in addition to the real-time subscription. This handles gossip delays
     * and nodes that don't support subscriptions.
     *
     * @default true
     */
    enablePolling?: boolean;
}

// ============================================================================
// Publish & Subscribe
// ============================================================================

/**
 * Options for publishing a single statement.
 */
export interface PublishOptions {
    /**
     * Channel name for last-write-wins semantics.
     *
     * When provided, the statement is tagged with `blake2b(channel)`.
     * For a given channel, only the most recent statement is kept.
     *
     * @example "presence/peer-abc123", "handshake/alice-bob"
     */
    channel?: string;

    /**
     * Secondary topic for additional filtering.
     *
     * Hashed with blake2b and set as topic2. Useful for scoping
     * statements to a specific room, document, or context.
     *
     * @example "doc-abc123", "room-456"
     */
    topic2?: string;

    /**
     * Time-to-live in seconds. Overrides {@link StatementStoreConfig.defaultTtlSeconds}.
     */
    ttlSeconds?: number;

    /**
     * Decryption key hint (32 bytes).
     *
     * Used by the `statement_posted` RPC method to filter statements.
     * Typically set to the blake2b hash of the room or document ID.
     */
    decryptionKey?: Uint8Array;
}

/**
 * A received statement with typed data and metadata.
 *
 * @typeParam T - The parsed data type (decoded from JSON).
 */
export interface ReceivedStatement<T = unknown> {
    /** Parsed data payload. */
    data: T;
    /** 32-byte Sr25519 public key of the signer, if present. */
    signer?: Uint8Array;
    /** Channel hash, if present. */
    channel?: Uint8Array;
    /** Primary topic hash, if present. */
    topic1?: Uint8Array;
    /** Secondary topic hash, if present. */
    topic2?: Uint8Array;
    /** Combined expiry value (upper 32 bits = timestamp, lower 32 bits = sequence). */
    expiry?: bigint;
    /** The full decoded statement for advanced inspection. */
    raw: DecodedStatement;
}

// ============================================================================
// Signer
// ============================================================================

/**
 * A function that signs a message with an Sr25519 key.
 *
 * Takes the signature material bytes and returns a 64-byte Sr25519 signature.
 * May be synchronous or asynchronous (e.g., when signing via a hardware wallet).
 */
export type StatementSigner = (message: Uint8Array) => Uint8Array | Promise<Uint8Array>;

/**
 * An Sr25519 signer with its associated public key.
 *
 * Used by {@link StatementStoreClient.connect} to sign published statements.
 */
export interface StatementSignerWithKey {
    /** 32-byte Sr25519 public key. */
    publicKey: Uint8Array;
    /** Signing function. */
    sign: StatementSigner;
}

// ============================================================================
// Transport
// ============================================================================

/** Result status from submitting a statement via RPC. */
export type SubmitStatus = "new" | "known" | "rejected";

/** Handle returned by subscription methods. Call `unsubscribe()` to stop receiving events. */
export interface Unsubscribable {
    unsubscribe: () => void;
}

/**
 * Low-level transport interface for statement store communication.
 *
 * Implementations handle the actual RPC or Host API calls.
 * Most consumers should use {@link StatementStoreClient} instead.
 */
export interface StatementTransport {
    /**
     * Subscribe to statements matching a topic filter.
     *
     * @param filter - Topic filter for the subscription.
     * @param onStatement - Called with each statement's hex-encoded bytes.
     * @param onError - Called when the subscription encounters an error.
     * @returns A handle to unsubscribe.
     */
    subscribe(
        filter: TopicFilter,
        onStatement: (statementHex: string) => void,
        onError: (error: Error) => void,
    ): Unsubscribable;

    /**
     * Submit a signed statement to the network.
     *
     * @param statementHex - Hex-encoded SCALE-encoded signed statement.
     * @returns The submission status: "new" (accepted), "known" (duplicate), or "rejected".
     */
    submit(statementHex: string): Promise<SubmitStatus>;

    /**
     * Query existing statements from the store.
     *
     * Tries multiple RPC methods with graceful fallback:
     * `statement_posted` -> `statement_broadcasts` -> `statement_dump`.
     *
     * @param topics - Topic hashes to filter by.
     * @param decryptionKey - Optional hex-encoded decryption key for `statement_posted`.
     * @returns Array of hex-encoded statement strings.
     */
    query(topics: TopicHash[], decryptionKey?: string): Promise<string[]>;

    /** Destroy the transport and release all resources. */
    destroy(): void;
}

/**
 * Batched event format from the statement subscription API.
 *
 * The subscription returns batched events with metadata
 * instead of individual hex strings.
 */
export interface StatementEvent {
    /** Array of SCALE-encoded hex statements. */
    statements: string[];
    /** Count of remaining statements in initial sync. */
    remaining?: number;
}
