import { createLogger } from "@polkadot-apps/logger";

import {
    decodeData,
    decodeStatement,
    createSignatureMaterial,
    encodeData,
    encodeStatement,
    toHex,
} from "./codec.js";
import { StatementConnectionError } from "./errors.js";
import { createChannel, createTopic, topicToHex } from "./topics.js";
import { createTransport, type RpcClient, RpcTransport } from "./transport.js";
import type {
    DecodedStatement,
    PublishOptions,
    ReceivedStatement,
    StatementFields,
    StatementSignerWithKey,
    StatementStoreConfig,
    StatementTransport,
    Unsubscribable,
} from "./types.js";
import { DEFAULT_POLL_INTERVAL_MS, DEFAULT_TTL_SECONDS } from "./types.js";

const log = createLogger("statement-store");

/**
 * High-level client for the Polkadot Statement Store.
 *
 * Provides a simple publish/subscribe API over the ephemeral statement store,
 * handling SCALE encoding, Sr25519 signing, topic management, and resilient
 * delivery (subscription + polling fallback).
 *
 * @example
 * ```ts
 * import { StatementStoreClient } from "@polkadot-apps/statement-store";
 *
 * const client = new StatementStoreClient({ appName: "my-app" });
 * await client.connect(signer);
 *
 * // Publish
 * await client.publish({ type: "presence", peerId: "abc" }, {
 *     channel: "presence/abc",
 *     topic2: "room-123",
 * });
 *
 * // Subscribe
 * client.subscribe<{ type: string }>(statement => {
 *     console.log(statement.data.type);
 * });
 *
 * // Cleanup
 * client.destroy();
 * ```
 */
export class StatementStoreClient {
    private readonly config: Required<
        Pick<
            StatementStoreConfig,
            "appName" | "pollIntervalMs" | "defaultTtlSeconds" | "enablePolling"
        >
    > & { endpoint?: string };

    private transport: StatementTransport | null = null;
    private signer: StatementSignerWithKey | null = null;
    private subscription: Unsubscribable | null = null;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private callbacks: Array<(statement: ReceivedStatement<unknown>) => void> = [];
    private connected = false;
    private connectPromise: Promise<void> | null = null;

    /**
     * Track seen statements by channel hex to avoid re-delivering the same statement.
     * Maps channel hex (or statement data hash) to the expiry value.
     */
    private seen = new Map<string, bigint>();

    /** Monotonic counter to ensure unique sequence numbers even within the same millisecond. */
    private sequenceCounter = 0;

    /** Cached blake2b hash of the appName, used as topic1. */
    private readonly appTopic;

    constructor(config: StatementStoreConfig) {
        this.config = {
            appName: config.appName,
            endpoint: config.endpoint,
            pollIntervalMs: config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
            defaultTtlSeconds: config.defaultTtlSeconds ?? DEFAULT_TTL_SECONDS,
            enablePolling: config.enablePolling ?? true,
        };
        this.appTopic = createTopic(config.appName);
    }

    /**
     * Connect to the statement store and start receiving statements.
     *
     * Establishes the transport connection, starts a real-time subscription
     * on the application's topic, fetches existing statements, and begins
     * the polling fallback (if enabled).
     *
     * @param signer - The Sr25519 signer used to sign published statements.
     * @throws {StatementConnectionError} If the transport cannot be established.
     */
    async connect(signer: StatementSignerWithKey): Promise<void> {
        if (this.connected) {
            log.warn("Already connected, ignoring duplicate connect()");
            return;
        }
        // Deduplicate concurrent connect() calls — return the in-flight promise
        if (this.connectPromise) {
            return this.connectPromise;
        }
        this.connectPromise = this.doConnect(signer).finally(() => {
            this.connectPromise = null;
        });
        return this.connectPromise;
    }

    private async doConnect(signer: StatementSignerWithKey): Promise<void> {
        this.signer = signer;
        this.transport = await createTransport({ endpoint: this.config.endpoint });

        try {
            log.info("Connected", {
                appName: this.config.appName,
                publicKey: topicToHex(signer.publicKey),
            });

            // Start subscription for real-time updates
            this.startSubscription();

            // Fetch pre-existing statements (subscription only delivers new ones)
            await this.poll();

            // Start polling fallback
            if (this.config.enablePolling && this.config.pollIntervalMs > 0) {
                this.startPolling();
            }

            this.connected = true;
        } catch (error) {
            // Clean up partial state on failure so connect() can be retried
            this.destroy();
            throw error;
        }
    }

    /**
     * Publish typed data to the statement store.
     *
     * Encodes the data as JSON, builds a SCALE-encoded statement with the
     * configured topics and TTL, signs it with Sr25519, and submits it
     * to the network.
     *
     * @typeParam T - The type of data being published.
     * @param data - The value to publish (must be JSON-serializable, max 512 bytes).
     * @param options - Optional channel, topic2, TTL, and decryption key overrides.
     * @returns `true` if accepted ("new" or "known"), `false` if rejected.
     * @throws {StatementConnectionError} If not connected.
     * @throws {StatementDataTooLargeError} If the encoded data exceeds 512 bytes.
     */
    async publish<T>(data: T, options?: PublishOptions): Promise<boolean> {
        if (!this.transport || !this.signer) {
            throw new StatementConnectionError("Not connected. Call connect() first.");
        }

        const dataBytes = encodeData(data);
        const ttl = options?.ttlSeconds ?? this.config.defaultTtlSeconds;
        const expirationTimestamp = Math.floor(Date.now() / 1000) + ttl;
        const sequenceNumber = (Date.now() + this.sequenceCounter++) % 0xffffffff;

        const fields: StatementFields = {
            expirationTimestamp,
            sequenceNumber,
            topic1: this.appTopic,
            topic2: options?.topic2 ? createTopic(options.topic2) : undefined,
            channel: options?.channel ? createChannel(options.channel) : undefined,
            decryptionKey: options?.decryptionKey,
            data: dataBytes,
        };

        // Sign
        const signatureMaterial = createSignatureMaterial(fields);
        const signature = await Promise.resolve(this.signer.sign(signatureMaterial));

        // Encode
        const encoded = encodeStatement(fields, this.signer.publicKey, signature);
        const hex = toHex(encoded);

        // Submit
        try {
            const status = await this.transport.submit(hex);
            if (status === "new" || status === "known") {
                log.debug("Published", {
                    channel: options?.channel,
                    status,
                });
                return true;
            }
            log.warn("Publish rejected", { status });
            return false;
        } catch (error) {
            log.error("Publish failed", {
                error: error instanceof Error ? error.message : String(error),
            });
            return false;
        }
    }

    /**
     * Subscribe to incoming statements on this application's topic.
     *
     * Receives both real-time subscription events and polling results.
     * Statements are deduplicated by channel + expiry to prevent double delivery.
     *
     * @typeParam T - The expected data type (decoded from JSON).
     * @param callback - Called for each new statement.
     * @param options - Optional secondary topic filter.
     * @returns A handle to unsubscribe.
     */
    subscribe<T>(
        callback: (statement: ReceivedStatement<T>) => void,
        options?: { topic2?: string },
    ): Unsubscribable {
        const topic2Hash = options?.topic2 ? createTopic(options.topic2) : undefined;
        const topic2Hex = topic2Hash ? topicToHex(topic2Hash) : undefined;

        const wrappedCallback = (statement: ReceivedStatement<unknown>) => {
            // Filter by topic2 if specified
            if (topic2Hex) {
                if (!statement.topic2) return;
                const statementTopic2Hex = topicToHex(statement.topic2);
                if (statementTopic2Hex !== topic2Hex) return;
            }
            callback(statement as ReceivedStatement<T>);
        };

        this.callbacks.push(wrappedCallback);

        return {
            unsubscribe: () => {
                const index = this.callbacks.indexOf(wrappedCallback);
                if (index >= 0) {
                    this.callbacks.splice(index, 1);
                }
            },
        };
    }

    /**
     * Query existing statements from the store.
     *
     * Fetches statements that were published before the subscription started.
     * Useful for catching up on state (e.g., existing presence announcements).
     *
     * @typeParam T - The expected data type.
     * @param options - Optional secondary topic filter.
     * @returns Array of received statements.
     */
    async query<T>(options?: {
        topic2?: string;
        /** Explicit decryption key for `statement_posted` filtering. If omitted, derived from topic2. */
        decryptionKey?: Uint8Array;
    }): Promise<ReceivedStatement<T>[]> {
        if (!this.transport) {
            throw new StatementConnectionError("Not connected. Call connect() first.");
        }

        const topics = [this.appTopic];
        if (options?.topic2) {
            topics.push(createTopic(options.topic2));
        }

        // Use explicit decryptionKey if provided, else derive from topic2
        const decryptionKey = options?.decryptionKey
            ? topicToHex(options.decryptionKey)
            : options?.topic2
              ? topicToHex(createTopic(options.topic2))
              : undefined;

        const hexStatements = await this.transport.query(topics, decryptionKey);
        const results: ReceivedStatement<T>[] = [];

        for (const hex of hexStatements) {
            const parsed = this.parseStatement<T>(hex);
            if (parsed) {
                results.push(parsed);
            }
        }

        return results;
    }

    /** Whether the client is connected and ready to publish/subscribe. */
    isConnected(): boolean {
        return this.connected;
    }

    /**
     * Get the signer's public key as a hex string (with 0x prefix).
     *
     * @returns The hex-encoded public key, or empty string if not connected.
     */
    getPublicKeyHex(): string {
        return this.signer ? topicToHex(this.signer.publicKey) : "";
    }

    /**
     * Destroy the client, stopping polling, unsubscribing, and closing the transport.
     *
     * Safe to call multiple times. After destruction, the client cannot be reused.
     */
    destroy(): void {
        this.stopPolling();

        if (this.subscription) {
            this.subscription.unsubscribe();
            this.subscription = null;
        }

        if (this.transport) {
            this.transport.destroy();
            this.transport = null;
        }

        this.signer = null;
        this.connected = false;
        this.connectPromise = null;
        this.callbacks = [];
        this.seen.clear();

        log.info("Destroyed");
    }

    // ========================================================================
    // Internal
    // ========================================================================

    private startSubscription(): void {
        if (!this.transport) return;

        const filter = { matchAll: [this.appTopic] };

        this.subscription = this.transport.subscribe(
            filter,
            (hex) => this.handleStatementReceived(hex),
            (error) => {
                log.warn("Subscription unavailable, relying on polling", {
                    error: error.message,
                });
            },
        );
    }

    private startPolling(): void {
        this.pollTimer = setInterval(() => {
            this.poll().catch((error) => {
                log.warn("Poll failed", {
                    error: error instanceof Error ? error.message : String(error),
                });
            });
        }, this.config.pollIntervalMs);
    }

    private stopPolling(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    private async poll(): Promise<void> {
        if (!this.transport) return;

        // Prune expired entries from the seen map to prevent unbounded growth
        this.pruneSeenMap();

        const hexStatements = await this.transport.query([this.appTopic]);

        let newCount = 0;
        for (const hex of hexStatements) {
            if (this.handleStatementReceived(hex)) {
                newCount++;
            }
        }

        if (newCount > 0) {
            log.debug("Poll found new statements", {
                total: hexStatements.length,
                new: newCount,
            });
        }
    }

    /** Remove entries from the seen map whose expiry timestamp is in the past. */
    private pruneSeenMap(): void {
        const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
        for (const [key, expiry] of this.seen) {
            const expiryTimestamp = expiry >> 32n;
            if (expiryTimestamp > 0n && expiryTimestamp < nowSeconds) {
                this.seen.delete(key);
            }
        }
    }

    /**
     * Process a received statement hex, dedup, parse, and deliver to callbacks.
     * Returns true if the statement was new and delivered.
     */
    private handleStatementReceived(hex: string): boolean {
        const parsed = this.parseStatement<unknown>(hex);
        if (!parsed) return false;

        // Deduplication key: channel hex (if present) or data hash
        const dedupeKey = parsed.channel ? topicToHex(parsed.channel) : hex.substring(0, 64);

        const existingExpiry = this.seen.get(dedupeKey);
        const newExpiry = parsed.expiry ?? 0n;

        if (existingExpiry !== undefined && newExpiry <= existingExpiry) {
            return false; // Already seen or older
        }

        this.seen.set(dedupeKey, newExpiry);

        // Deliver to callbacks (snapshot to handle mid-iteration unsubscribes)
        for (const callback of [...this.callbacks]) {
            try {
                callback(parsed);
            } catch (error) {
                log.error("Callback error", {
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        return true;
    }

    private parseStatement<T>(hex: string): ReceivedStatement<T> | null {
        try {
            const decoded = decodeStatement(hex);
            if (!decoded.data) return null;

            const data = decodeData<T>(decoded.data);

            return {
                data,
                signer: decoded.signer,
                channel: decoded.channel,
                topic1: decoded.topic1,
                topic2: decoded.topic2,
                expiry: decoded.expiry,
                raw: decoded,
            };
        } catch {
            // Skip malformed statements
            return null;
        }
    }
}

if (import.meta.vitest) {
    const { describe, test, expect, vi, beforeEach } = import.meta.vitest;
    const { configure } = await import("@polkadot-apps/logger");
    const { encodeStatement: encodeStmt, toHex: bytesToHex } = await import("./codec.js");
    const { createTopic: mkTopic } = await import("./topics.js");

    beforeEach(() => {
        configure({ handler: () => {} });
    });

    // Helper to create a hex-encoded test statement
    function makeTestStatementHex(
        data: unknown,
        opts?: { channel?: Uint8Array; topic1?: Uint8Array; topic2?: Uint8Array; expiry?: number },
    ): string {
        const dataBytes = new TextEncoder().encode(JSON.stringify(data));
        const fields: StatementFields = {
            expirationTimestamp: opts?.expiry ?? 1700000030,
            sequenceNumber: Date.now() % 0xffffffff,
            topic1: opts?.topic1 ?? mkTopic("test-app"),
            topic2: opts?.topic2,
            channel: opts?.channel,
            data: dataBytes,
        };
        const signer = new Uint8Array(32).fill(0xaa);
        const signature = new Uint8Array(64).fill(0xbb);
        const encoded = encodeStmt(fields, signer, signature);
        return bytesToHex(encoded);
    }

    function createMockTransport(): StatementTransport & {
        subscribeCalls: unknown[];
        submitCalls: string[];
        queryCalls: unknown[];
    } {
        const mock = {
            subscribeCalls: [] as unknown[],
            submitCalls: [] as string[],
            queryCalls: [] as unknown[],
            subscribe: vi.fn(
                (
                    _filter: unknown,
                    _onStatement: (hex: string) => void,
                    _onError: (e: Error) => void,
                ) => {
                    mock.subscribeCalls.push({ _filter, _onStatement, _onError });
                    return { unsubscribe: () => {} };
                },
            ),
            submit: vi.fn(async (hex: string) => {
                mock.submitCalls.push(hex);
                return "new" as const;
            }),
            query: vi.fn(async () => {
                return [] as string[];
            }),
            destroy: vi.fn(),
        };
        return mock;
    }

    // We need to mock createTransport to return our mock transport
    describe("StatementStoreClient", () => {
        test("constructor sets config defaults", () => {
            const client = new StatementStoreClient({ appName: "test" });
            expect(client.isConnected()).toBe(false);
            expect(client.getPublicKeyHex()).toBe("");
        });

        test("destroy is safe to call when not connected", () => {
            const client = new StatementStoreClient({ appName: "test" });
            expect(() => client.destroy()).not.toThrow();
        });

        test("destroy clears state", () => {
            const client = new StatementStoreClient({ appName: "test" });
            client.destroy();
            expect(client.isConnected()).toBe(false);
            expect(client.getPublicKeyHex()).toBe("");
        });

        test("subscribe returns unsubscribable handle", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const callback = vi.fn();
            const sub = client.subscribe(callback);
            expect(sub.unsubscribe).toBeTypeOf("function");
            sub.unsubscribe();
        });

        test("multiple subscribes and unsubscribes work correctly", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const cb1 = vi.fn();
            const cb2 = vi.fn();
            const sub1 = client.subscribe(cb1);
            const sub2 = client.subscribe(cb2);
            sub1.unsubscribe();
            sub2.unsubscribe();
            // Unsubscribe is idempotent
            sub1.unsubscribe();
        });

        test("publish throws when not connected", async () => {
            const client = new StatementStoreClient({ appName: "test" });
            await expect(client.publish({ foo: "bar" })).rejects.toThrow(StatementConnectionError);
        });

        test("query throws when not connected", async () => {
            const client = new StatementStoreClient({ appName: "test" });
            await expect(client.query()).rejects.toThrow(StatementConnectionError);
        });

        test("handleStatementReceived deduplicates by channel", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const callback = vi.fn();
            client.subscribe(callback);

            const channel = mkTopic("test-channel");
            const hex = makeTestStatementHex({ type: "test" }, { channel, expiry: 1700000030 });

            // Access private method via bracket notation for testing
            const delivered1 = (
                client as unknown as { handleStatementReceived: (hex: string) => boolean }
            ).handleStatementReceived(hex);
            const delivered2 = (
                client as unknown as { handleStatementReceived: (hex: string) => boolean }
            ).handleStatementReceived(hex);

            expect(delivered1).toBe(true);
            expect(delivered2).toBe(false); // Duplicate
            expect(callback).toHaveBeenCalledOnce();
        });

        test("handleStatementReceived delivers newer statement for same channel", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const callback = vi.fn();
            client.subscribe(callback);

            const channel = mkTopic("test-channel");
            const hex1 = makeTestStatementHex({ v: 1 }, { channel, expiry: 1700000030 });
            const hex2 = makeTestStatementHex({ v: 2 }, { channel, expiry: 1700000060 });

            const handle = client as unknown as {
                handleStatementReceived: (hex: string) => boolean;
            };
            handle.handleStatementReceived(hex1);
            handle.handleStatementReceived(hex2);

            expect(callback).toHaveBeenCalledTimes(2);
        });

        test("parseStatement returns null for no data", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const parse = (
                client as unknown as {
                    parseStatement: <T>(hex: string) => ReceivedStatement<T> | null;
                }
            ).parseStatement;

            // Minimal statement with only expiry, no data
            const fields: StatementFields = {
                expirationTimestamp: 100,
                sequenceNumber: 1,
            };
            const encoded = encodeStmt(fields, new Uint8Array(32), new Uint8Array(64));
            const hex = bytesToHex(encoded);

            expect(parse.call(client, hex)).toBeNull();
        });

        test("parseStatement returns null for malformed hex", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const parse = (
                client as unknown as {
                    parseStatement: <T>(hex: string) => ReceivedStatement<T> | null;
                }
            ).parseStatement;
            expect(parse.call(client, "0xdeadbeef")).toBeNull();
        });

        test("callback errors are caught and logged", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const badCallback = vi.fn(() => {
                throw new Error("callback boom");
            });
            const goodCallback = vi.fn();

            client.subscribe(badCallback);
            client.subscribe(goodCallback);

            const channel = mkTopic("ch");
            const hex = makeTestStatementHex({ type: "test" }, { channel });

            const handle = client as unknown as {
                handleStatementReceived: (hex: string) => boolean;
            };
            handle.handleStatementReceived(hex);

            // Bad callback threw but good callback still received the statement
            expect(badCallback).toHaveBeenCalledOnce();
            expect(goodCallback).toHaveBeenCalledOnce();
        });

        test("subscribe with topic2 filter only delivers matching statements", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const callback = vi.fn();
            client.subscribe(callback, { topic2: "room-1" });

            const topic2Match = mkTopic("room-1");
            const topic2Other = mkTopic("room-2");

            const hexMatch = makeTestStatementHex(
                { v: 1 },
                { topic2: topic2Match, channel: mkTopic("ch1") },
            );
            const hexOther = makeTestStatementHex(
                { v: 2 },
                { topic2: topic2Other, channel: mkTopic("ch2") },
            );

            const handle = client as unknown as {
                handleStatementReceived: (hex: string) => boolean;
            };
            handle.handleStatementReceived(hexMatch);
            handle.handleStatementReceived(hexOther);

            expect(callback).toHaveBeenCalledOnce();
            expect(callback.mock.calls[0][0].data).toEqual({ v: 1 });
        });

        test("subscribe with topic2 filter rejects statements without topic2", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const callback = vi.fn();
            client.subscribe(callback, { topic2: "room-1" });

            // Statement without topic2
            const hex = makeTestStatementHex({ v: 1 }, { channel: mkTopic("ch") });

            const handle = client as unknown as {
                handleStatementReceived: (hex: string) => boolean;
            };
            handle.handleStatementReceived(hex);

            expect(callback).not.toHaveBeenCalled();
        });

        // --- Tests using injected mock transport ---

        function injectTransport(client: StatementStoreClient, transport: StatementTransport) {
            const internal = client as unknown as {
                transport: StatementTransport | null;
                signer: StatementSignerWithKey | null;
                connected: boolean;
            };
            internal.transport = transport;
            internal.signer = {
                publicKey: new Uint8Array(32).fill(0xaa),
                sign: () => new Uint8Array(64).fill(0xbb),
            };
            internal.connected = true;
        }

        test("publish encodes, signs, and submits via transport", async () => {
            const client = new StatementStoreClient({ appName: "test-app" });
            const transport = createMockTransport();
            injectTransport(client, transport);

            const result = await client.publish(
                { type: "presence", peerId: "abc" },
                { channel: "ch1" },
            );

            expect(result).toBe(true);
            expect(transport.submitCalls.length).toBe(1);
            expect(transport.submitCalls[0]).toMatch(/^0x/);
        });

        test("publish returns false on rejection", async () => {
            const client = new StatementStoreClient({ appName: "test-app" });
            const transport = createMockTransport();
            transport.submit = vi.fn(async () => "rejected" as const);
            injectTransport(client, transport);

            const result = await client.publish({ type: "test" });
            expect(result).toBe(false);
        });

        test("publish returns false on transport error", async () => {
            const client = new StatementStoreClient({ appName: "test-app" });
            const transport = createMockTransport();
            transport.submit = vi.fn(async () => {
                throw new Error("network down");
            });
            injectTransport(client, transport);

            const result = await client.publish({ type: "test" });
            expect(result).toBe(false);
        });

        test("query returns parsed statements from transport", async () => {
            const client = new StatementStoreClient({ appName: "test-app" });
            const transport = createMockTransport();
            const testHex = makeTestStatementHex({ type: "found" }, { channel: mkTopic("ch") });
            transport.query = vi.fn(async () => [testHex]);
            injectTransport(client, transport);

            const results = await client.query<{ type: string }>();
            expect(results.length).toBe(1);
            expect(results[0].data.type).toBe("found");
        });

        test("query forwards decryptionKey to transport", async () => {
            const client = new StatementStoreClient({ appName: "test-app" });
            const transport = createMockTransport();
            const querySpy = vi.fn(async () => [] as string[]);
            transport.query = querySpy;
            injectTransport(client, transport);

            const dk = new Uint8Array(32).fill(0xff);
            await client.query({ decryptionKey: dk });

            const args = querySpy.mock.calls[0] as unknown[];
            // Second arg is the hex-encoded decryptionKey
            expect(args[1]).toMatch(/^0x/);
            expect(args[1]).toContain("ff");
        });

        test("query derives decryptionKey from topic2 when not explicit", async () => {
            const { topicToHex: thx, createTopic: ct } = await import("./topics.js");
            const client = new StatementStoreClient({ appName: "test-app" });
            const transport = createMockTransport();
            const querySpy = vi.fn(async () => [] as string[]);
            transport.query = querySpy;
            injectTransport(client, transport);

            await client.query({ topic2: "room-1" });

            const args = querySpy.mock.calls[0] as unknown[];
            expect(args[1]).toBe(thx(ct("room-1")));
        });

        test("pruneSeenMap removes expired entries", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const internal = client as unknown as {
                seen: Map<string, bigint>;
                pruneSeenMap: () => void;
            };

            // Entry with expiry far in the past (timestamp=100, seq=0)
            internal.seen.set("expired", (100n << 32n) | 0n);
            // Entry with expiry far in the future (timestamp=9999999999, seq=0)
            internal.seen.set("valid", (9999999999n << 32n) | 0n);

            internal.pruneSeenMap();

            expect(internal.seen.has("expired")).toBe(false);
            expect(internal.seen.has("valid")).toBe(true);
        });

        test("destroy stops polling and cleans up transport", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const transport = createMockTransport();
            injectTransport(client, transport);

            // Start a poll timer manually
            const internal = client as unknown as {
                pollTimer: ReturnType<typeof setInterval> | null;
            };
            internal.pollTimer = setInterval(() => {}, 10000);

            client.destroy();

            expect(client.isConnected()).toBe(false);
            expect(transport.destroy).toHaveBeenCalledOnce();
            expect(internal.pollTimer).toBeNull();
        });

        test("getPublicKeyHex returns hex when connected", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const transport = createMockTransport();
            injectTransport(client, transport);

            const hex = client.getPublicKeyHex();
            expect(hex).toMatch(/^0x/);
            expect(hex.length).toBe(66); // 0x + 64 hex chars
        });

        test("connect deduplicates concurrent calls", async () => {
            const client = new StatementStoreClient({ appName: "test" });
            const internal = client as unknown as {
                connectPromise: Promise<void> | null;
                connected: boolean;
            };

            // Simulate an in-flight connect
            let resolveConnect: () => void;
            internal.connectPromise = new Promise((r) => {
                resolveConnect = r;
            });

            // Second connect should return a promise (not start a new connection)
            const signer = {
                publicKey: new Uint8Array(32),
                sign: () => new Uint8Array(64),
            };
            const promise = client.connect(signer);
            // The promise is derived from connectPromise, so it's linked
            expect(internal.connectPromise).not.toBeNull();

            resolveConnect!();
            await promise; // Should resolve without error
        });

        test("connect returns immediately if already connected", async () => {
            const client = new StatementStoreClient({ appName: "test" });
            const internal = client as unknown as { connected: boolean };
            internal.connected = true;

            const signer = {
                publicKey: new Uint8Array(32),
                sign: () => new Uint8Array(64),
            };
            // Should not throw — just returns
            await client.connect(signer);
        });
    });
}
