import { createLogger } from "@polkadot-apps/logger";
import { blake2b256 } from "@polkadot-apps/utils";

import { decodeData, encodeData, toHex } from "./data.js";
import { StatementConnectionError } from "./errors.js";
import { createChannel, createTopic, serializeTopicFilter, topicToHex } from "./topics.js";
import { createTransport } from "./transport.js";
import type {
    ConnectionCredentials,
    PublishOptions,
    ReceivedStatement,
    StatementSignerWithKey,
    StatementStoreConfig,
    StatementTransport,
    Unsubscribable,
} from "./types.js";
import { DEFAULT_POLL_INTERVAL_MS, DEFAULT_TTL_SECONDS } from "./types.js";

import type { Statement } from "@novasamatech/sdk-statement";
import { createExpiry } from "@novasamatech/sdk-statement";
import type { SdkTopicFilter } from "./types.js";

const log = createLogger("statement-store");

/**
 * High-level client for the Polkadot Statement Store.
 *
 * Provides a simple publish/subscribe API over the ephemeral statement store,
 * handling topic management, signing (host or local), and resilient delivery
 * (subscription + polling fallback).
 *
 * @example
 * ```ts
 * import { StatementStoreClient } from "@polkadot-apps/statement-store";
 *
 * // Inside a container (host mode)
 * const client = new StatementStoreClient({ appName: "my-app" });
 * await client.connect({ mode: "host", accountId: ["5Grw...", 42] });
 *
 * // Outside a container (local mode)
 * await client.connect({ mode: "local", signer: { publicKey, sign } });
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
    > & { endpoint?: string; transport?: StatementTransport };

    private transport: StatementTransport | null = null;
    private credentials: ConnectionCredentials | null = null;
    private subscription: Unsubscribable | null = null;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private callbacks: Array<(statement: ReceivedStatement<unknown>) => void> = [];
    private connected = false;
    private connectPromise: Promise<void> | null = null;
    /** Set by destroy() so doConnect() can abort cleanly if destroy races with an in-flight connect. */
    private destroyed = false;

    /**
     * Track seen statements by channel hex to avoid re-delivering the same statement.
     * Maps channel hex (or data hash) to the expiry value.
     */
    private seen = new Map<string, bigint>();

    /** Monotonic counter to ensure unique sequence numbers even within the same millisecond. */
    private sequenceCounter = 0;

    /** Cached hex topic string for the app name, used as the primary subscription topic. */
    private readonly appTopicHex: string;

    constructor(config: StatementStoreConfig) {
        this.config = {
            appName: config.appName,
            endpoint: config.endpoint,
            pollIntervalMs: config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
            defaultTtlSeconds: config.defaultTtlSeconds ?? DEFAULT_TTL_SECONDS,
            enablePolling: config.enablePolling ?? true,
            transport: config.transport,
        };
        this.appTopicHex = topicToHex(createTopic(config.appName));
    }

    /**
     * Connect to the statement store and start receiving statements.
     *
     * @param credentials - Connection credentials (host accountId or local signer).
     * @throws {StatementConnectionError} If the transport cannot be established.
     */
    async connect(credentials: ConnectionCredentials): Promise<void>;
    /** @deprecated Use `connect({ mode: "local", signer })` instead. */
    async connect(signer: StatementSignerWithKey): Promise<void>;
    async connect(arg: ConnectionCredentials | StatementSignerWithKey): Promise<void> {
        if (this.destroyed) {
            throw new StatementConnectionError(
                "Cannot connect: client has been destroyed. Create a new instance.",
            );
        }
        if (this.connected) {
            log.warn("Already connected, ignoring duplicate connect()");
            return;
        }
        if (this.connectPromise) {
            return this.connectPromise;
        }

        const credentials: ConnectionCredentials =
            "mode" in arg ? arg : { mode: "local", signer: arg };

        this.connectPromise = this.doConnect(credentials).finally(() => {
            this.connectPromise = null;
        });
        return this.connectPromise;
    }

    /* @integration */
    private async doConnect(credentials: ConnectionCredentials): Promise<void> {
        this.credentials = credentials;
        const transport =
            this.config.transport ?? (await createTransport({ endpoint: this.config.endpoint }));

        // destroy() may have been called while we were awaiting createTransport().
        // If so, clean up the newly-created transport (if we own it) instead of leaking.
        if (this.destroyed) {
            if (transport !== this.config.transport) {
                transport.destroy();
            }
            return;
        }

        this.transport = transport;

        try {
            log.info("Connected", { appName: this.config.appName });

            this.startSubscription();

            // Start polling fallback (only if transport supports query)
            if (
                this.config.enablePolling &&
                this.config.pollIntervalMs > 0 &&
                this.transport.query
            ) {
                this.startPolling();
            }

            this.connected = true;
        } catch (error) {
            this.destroy();
            throw error;
        }
    }

    /**
     * Publish typed data to the statement store.
     *
     * @typeParam T - The type of data being published.
     * @param data - The value to publish (must be JSON-serializable, max 512 bytes).
     * @param options - Optional channel, topic2, TTL, and decryption key overrides.
     * @returns `true` if accepted, `false` if rejected or errored.
     * @throws {StatementConnectionError} If not connected.
     * @throws {StatementDataTooLargeError} If the encoded data exceeds 512 bytes.
     */
    async publish<T>(data: T, options?: PublishOptions): Promise<boolean> {
        if (!this.transport || !this.credentials) {
            throw new StatementConnectionError("Not connected. Call connect() first.");
        }

        const dataBytes = encodeData(data);
        const ttl = options?.ttlSeconds ?? this.config.defaultTtlSeconds;
        const expirationTimestamp = Math.floor(Date.now() / 1000) + ttl;
        const sequenceNumber = (Date.now() + this.sequenceCounter++) % 0xffffffff;
        const expiry = createExpiry(expirationTimestamp, sequenceNumber);

        const topics: `0x${string}`[] = [this.appTopicHex as `0x${string}`];
        if (options?.topic2) {
            topics.push(topicToHex(createTopic(options.topic2)) as `0x${string}`);
        }

        const statement: Statement = {
            expiry,
            topics,
            channel: options?.channel
                ? (topicToHex(createChannel(options.channel)) as `0x${string}`)
                : undefined,
            decryptionKey: options?.decryptionKey
                ? (topicToHex(options.decryptionKey) as `0x${string}`)
                : undefined,
            data: dataBytes,
        };

        try {
            await this.transport.signAndSubmit(statement, this.credentials);
            log.debug("Published", { channel: options?.channel });
            return true;
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
     * @typeParam T - The expected data type (decoded from JSON).
     * @param callback - Called for each new statement.
     * @param options - Optional secondary topic filter.
     * @returns A handle to unsubscribe.
     */
    subscribe<T>(
        callback: (statement: ReceivedStatement<T>) => void,
        options?: { topic2?: string },
    ): Unsubscribable {
        const topic2Hex = options?.topic2 ? topicToHex(createTopic(options.topic2)) : undefined;

        const wrappedCallback = (statement: ReceivedStatement<unknown>) => {
            if (topic2Hex) {
                if (!statement.topics[1] || statement.topics[1] !== topic2Hex) return;
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
     * Only available when the transport supports queries (RPC mode).
     * In host mode, the subscription replays existing statements automatically.
     */
    async query<T>(options?: { topic2?: string }): Promise<ReceivedStatement<T>[]> {
        if (!this.transport) {
            throw new StatementConnectionError("Not connected. Call connect() first.");
        }
        if (!this.transport.query) {
            return []; // Host mode — subscription delivers initial state
        }

        const filter = this.buildFilter(options?.topic2);
        const statements = await this.transport.query(filter);
        const results: ReceivedStatement<T>[] = [];

        for (const stmt of statements) {
            const parsed = this.parseStatement<T>(stmt);
            if (parsed) results.push(parsed);
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
     * @returns The hex-encoded public key, or empty string if not connected or in host mode.
     */
    getPublicKeyHex(): string {
        if (this.credentials?.mode === "local") {
            return topicToHex(this.credentials.signer.publicKey);
        }
        return "";
    }

    /**
     * Destroy the client, stopping polling, unsubscribing, and closing the transport.
     *
     * Safe to call multiple times. After destruction, the client cannot be reused.
     */
    destroy(): void {
        // Signal to any in-flight doConnect() that cleanup should happen on its side.
        this.destroyed = true;

        this.stopPolling();

        if (this.subscription) {
            this.subscription.unsubscribe();
            this.subscription = null;
        }

        if (this.transport) {
            this.transport.destroy();
            this.transport = null;
        }

        this.credentials = null;
        this.connected = false;
        this.connectPromise = null;
        this.callbacks = [];
        this.seen.clear();

        log.info("Destroyed");
    }

    // ========================================================================
    // Internal
    // ========================================================================

    /* @integration */
    private startSubscription(): void {
        if (!this.transport) return;

        const filter = this.buildFilter();

        this.subscription = this.transport.subscribe(
            filter,
            (statements) => {
                for (const stmt of statements) {
                    this.handleStatementReceived(stmt);
                }
            },
            (error) => {
                log.warn("Subscription unavailable, relying on polling", {
                    error: error.message,
                });
            },
        );
    }

    /* @integration */
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

    /* @integration */
    private async poll(): Promise<void> {
        if (!this.transport?.query) return;

        this.pruneSeenMap();

        const filter = this.buildFilter();
        const statements = await this.transport.query(filter);

        let newCount = 0;
        for (const stmt of statements) {
            if (this.handleStatementReceived(stmt)) {
                newCount++;
            }
        }

        if (newCount > 0) {
            log.debug("Poll found new statements", {
                total: statements.length,
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
     * Process a received statement, dedup, parse, and deliver to callbacks.
     * Returns true if the statement was new and delivered.
     */
    private handleStatementReceived(stmt: Statement): boolean {
        const parsed = this.parseStatement<unknown>(stmt);
        if (!parsed) return false;

        // Deduplication key: channel hex (if present) or blake2b hash of data
        const dedupeKey =
            parsed.channelHex ?? (parsed.raw.data ? toHex(blake2b256(parsed.raw.data)) : "");

        const existingExpiry = this.seen.get(dedupeKey);
        const newExpiry = parsed.expiry ?? 0n;

        if (existingExpiry !== undefined && newExpiry <= existingExpiry) {
            return false;
        }

        this.seen.set(dedupeKey, newExpiry);

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

    private parseStatement<T>(stmt: Statement): ReceivedStatement<T> | null {
        try {
            if (!stmt.data) return null;

            const data = decodeData<T>(stmt.data);

            // Extract signer from proof if present
            let signerHex: string | undefined;
            if (stmt.proof) {
                const proofValue = stmt.proof.value as Record<string, unknown>;
                if ("signer" in proofValue && typeof proofValue.signer === "string") {
                    signerHex = proofValue.signer;
                }
            }

            return {
                data,
                signerHex,
                channelHex: stmt.channel,
                topics: stmt.topics ?? [],
                expiry: stmt.expiry,
                raw: stmt,
            };
        } catch {
            return null;
        }
    }

    /** Build an SdkTopicFilter for the app's primary topic. */
    private buildFilter(topic2Name?: string): SdkTopicFilter {
        const topics = [createTopic(this.config.appName)];
        if (topic2Name) topics.push(createTopic(topic2Name));
        return serializeTopicFilter({ matchAll: topics });
    }
}

if (import.meta.vitest) {
    const { describe, test, expect, vi, beforeEach } = import.meta.vitest;
    const { configure } = await import("@polkadot-apps/logger");
    const { createTopic: mkTopic, topicToHex: thx } = await import("./topics.js");

    beforeEach(() => {
        configure({ handler: () => {} });
    });

    /** Create a test Statement matching sdk-statement's shape. */
    function makeTestStatement(
        data: unknown,
        opts?: { channel?: string; topic1?: string; topic2?: string; expiry?: bigint },
    ): Statement {
        const dataBytes = new TextEncoder().encode(JSON.stringify(data));
        const topics: `0x${string}`[] = [];
        if (opts?.topic1) topics.push(thx(mkTopic(opts.topic1)) as `0x${string}`);
        if (opts?.topic2) topics.push(thx(mkTopic(opts.topic2)) as `0x${string}`);

        return {
            proof: {
                type: "sr25519" as const,
                value: {
                    signature: ("0x" + "bb".repeat(64)) as `0x${string}`,
                    signer: ("0x" + "aa".repeat(32)) as `0x${string}`,
                },
            },
            expiry: opts?.expiry ?? createExpiry(1700000030, 42),
            channel: opts?.channel ? (thx(mkTopic(opts.channel)) as `0x${string}`) : undefined,
            topics,
            data: dataBytes,
        } as Statement;
    }

    function createMockTransport(): StatementTransport & {
        subscribeCalls: unknown[];
        signAndSubmitCalls: unknown[];
        queryCalls: unknown[];
    } {
        const mock = {
            subscribeCalls: [] as unknown[],
            signAndSubmitCalls: [] as unknown[],
            queryCalls: [] as unknown[],
            subscribe: vi.fn(
                (
                    _filter: unknown,
                    _onStatements: (stmts: Statement[]) => void,
                    _onError: (e: Error) => void,
                ) => {
                    mock.subscribeCalls.push({ _filter, _onStatements, _onError });
                    return { unsubscribe: () => {} };
                },
            ),
            signAndSubmit: vi.fn(async (stmt: Statement, creds: ConnectionCredentials) => {
                mock.signAndSubmitCalls.push({ stmt, creds });
            }),
            query: vi.fn(async () => [] as Statement[]),
            destroy: vi.fn(),
        };
        return mock;
    }

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

        test("publish throws when not connected", async () => {
            const client = new StatementStoreClient({ appName: "test" });
            await expect(client.publish({ foo: "bar" })).rejects.toThrow(StatementConnectionError);
        });

        test("query throws when not connected", async () => {
            const client = new StatementStoreClient({ appName: "test" });
            await expect(client.query()).rejects.toThrow(StatementConnectionError);
        });

        // --- Tests using injected mock transport ---

        function injectTransport(
            client: StatementStoreClient,
            transport: StatementTransport,
            credentials?: ConnectionCredentials,
        ) {
            const internal = client as unknown as {
                transport: StatementTransport | null;
                credentials: ConnectionCredentials | null;
                connected: boolean;
            };
            internal.transport = transport;
            internal.credentials = credentials ?? {
                mode: "local",
                signer: {
                    publicKey: new Uint8Array(32).fill(0xaa),
                    sign: () => new Uint8Array(64).fill(0xbb),
                },
            };
            internal.connected = true;
        }

        test("publish calls signAndSubmit on transport", async () => {
            const client = new StatementStoreClient({ appName: "test-app" });
            const transport = createMockTransport();
            injectTransport(client, transport);

            const result = await client.publish(
                { type: "presence", peerId: "abc" },
                { channel: "ch1" },
            );

            expect(result).toBe(true);
            expect(transport.signAndSubmitCalls.length).toBe(1);
        });

        test("publish returns false on transport error", async () => {
            const client = new StatementStoreClient({ appName: "test-app" });
            const transport = createMockTransport();
            transport.signAndSubmit = vi.fn(async () => {
                throw new Error("network down");
            });
            injectTransport(client, transport);

            const result = await client.publish({ type: "test" });
            expect(result).toBe(false);
        });

        test("handleStatementReceived deduplicates by channel", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const callback = vi.fn();
            client.subscribe(callback);

            const stmt = makeTestStatement(
                { type: "test" },
                { channel: "ch1", expiry: createExpiry(1700000030, 42) },
            );

            const handle = client as unknown as {
                handleStatementReceived: (stmt: Statement) => boolean;
            };
            const delivered1 = handle.handleStatementReceived(stmt);
            const delivered2 = handle.handleStatementReceived(stmt);

            expect(delivered1).toBe(true);
            expect(delivered2).toBe(false);
            expect(callback).toHaveBeenCalledOnce();
        });

        test("handleStatementReceived delivers newer statement for same channel", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const callback = vi.fn();
            client.subscribe(callback);

            const stmt1 = makeTestStatement(
                { v: 1 },
                { channel: "ch1", expiry: createExpiry(1700000030, 1) },
            );
            const stmt2 = makeTestStatement(
                { v: 2 },
                { channel: "ch1", expiry: createExpiry(1700000060, 1) },
            );

            const handle = client as unknown as {
                handleStatementReceived: (stmt: Statement) => boolean;
            };
            handle.handleStatementReceived(stmt1);
            handle.handleStatementReceived(stmt2);

            expect(callback).toHaveBeenCalledTimes(2);
        });

        test("parseStatement returns null for no data", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const parse = (
                client as unknown as {
                    parseStatement: <T>(stmt: Statement) => ReceivedStatement<T> | null;
                }
            ).parseStatement;

            expect(parse.call(client, {} as Statement)).toBeNull();
        });

        test("callback errors are caught and logged", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const badCallback = vi.fn(() => {
                throw new Error("callback boom");
            });
            const goodCallback = vi.fn();

            client.subscribe(badCallback);
            client.subscribe(goodCallback);

            const stmt = makeTestStatement({ type: "test" }, { channel: "ch1" });

            const handle = client as unknown as {
                handleStatementReceived: (stmt: Statement) => boolean;
            };
            handle.handleStatementReceived(stmt);

            expect(badCallback).toHaveBeenCalledOnce();
            expect(goodCallback).toHaveBeenCalledOnce();
        });

        test("subscribe with topic2 filter only delivers matching statements", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const callback = vi.fn();
            client.subscribe(callback, { topic2: "room-1" });

            const stmtMatch = makeTestStatement(
                { v: 1 },
                { topic1: "test", topic2: "room-1", channel: "ch1" },
            );
            const stmtOther = makeTestStatement(
                { v: 2 },
                { topic1: "test", topic2: "room-2", channel: "ch2" },
            );

            const handle = client as unknown as {
                handleStatementReceived: (stmt: Statement) => boolean;
            };
            handle.handleStatementReceived(stmtMatch);
            handle.handleStatementReceived(stmtOther);

            expect(callback).toHaveBeenCalledOnce();
            expect(callback.mock.calls[0][0].data).toEqual({ v: 1 });
        });

        test("query returns parsed statements from transport", async () => {
            const client = new StatementStoreClient({ appName: "test-app" });
            const transport = createMockTransport();
            const testStmt = makeTestStatement({ type: "found" }, { channel: "ch" });
            transport.query = vi.fn(async () => [testStmt]);
            injectTransport(client, transport);

            const results = await client.query<{ type: string }>();
            expect(results.length).toBe(1);
            expect(results[0].data.type).toBe("found");
        });

        test("query returns empty for transport without query support", async () => {
            const client = new StatementStoreClient({ appName: "test-app" });
            const transport = createMockTransport();
            delete (transport as Partial<StatementTransport>).query;
            injectTransport(client, transport);

            const results = await client.query();
            expect(results).toEqual([]);
        });

        test("getPublicKeyHex returns hex in local mode", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const transport = createMockTransport();
            injectTransport(client, transport);

            const hex = client.getPublicKeyHex();
            expect(hex).toMatch(/^0x/);
            expect(hex.length).toBe(66);
        });

        test("getPublicKeyHex returns empty in host mode", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const transport = createMockTransport();
            injectTransport(client, transport, { mode: "host", accountId: ["addr", 0] });

            expect(client.getPublicKeyHex()).toBe("");
        });

        test("connect deduplicates concurrent calls", async () => {
            const client = new StatementStoreClient({ appName: "test" });
            const internal = client as unknown as {
                connectPromise: Promise<void> | null;
                connected: boolean;
            };

            let resolveConnect: () => void;
            internal.connectPromise = new Promise((r) => {
                resolveConnect = r;
            });

            const signer = {
                publicKey: new Uint8Array(32),
                sign: () => new Uint8Array(64),
            };
            const promise = client.connect(signer);
            expect(internal.connectPromise).not.toBeNull();

            resolveConnect!();
            await promise;
        });

        test("connect returns immediately if already connected", async () => {
            const client = new StatementStoreClient({ appName: "test" });
            const internal = client as unknown as { connected: boolean };
            internal.connected = true;

            const signer = {
                publicKey: new Uint8Array(32),
                sign: () => new Uint8Array(64),
            };
            await client.connect(signer);
        });

        test("pruneSeenMap removes expired entries", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const internal = client as unknown as {
                seen: Map<string, bigint>;
                pruneSeenMap: () => void;
            };

            internal.seen.set("expired", (100n << 32n) | 0n);
            internal.seen.set("valid", (9999999999n << 32n) | 0n);

            internal.pruneSeenMap();

            expect(internal.seen.has("expired")).toBe(false);
            expect(internal.seen.has("valid")).toBe(true);
        });

        test("destroy stops polling and cleans up transport", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const transport = createMockTransport();
            injectTransport(client, transport);

            const internal = client as unknown as {
                pollTimer: ReturnType<typeof setInterval> | null;
            };
            internal.pollTimer = setInterval(() => {}, 10000);

            client.destroy();

            expect(client.isConnected()).toBe(false);
            expect(transport.destroy).toHaveBeenCalledOnce();
            expect(internal.pollTimer).toBeNull();
        });

        test("config.transport overrides auto-detection", async () => {
            const transport = createMockTransport();
            const client = new StatementStoreClient({
                appName: "test",
                transport,
            });

            const signer = {
                publicKey: new Uint8Array(32).fill(0xaa),
                sign: () => new Uint8Array(64),
            };
            // connect should use the provided transport, not auto-detect
            await client.connect(signer);
            expect(client.isConnected()).toBe(true);
        });

        test("publish adds topic2 to topics when option provided", async () => {
            const client = new StatementStoreClient({ appName: "test-app" });
            const transport = createMockTransport();
            injectTransport(client, transport);

            await client.publish({ type: "msg" }, { topic2: "room-1" });

            expect(transport.signAndSubmitCalls.length).toBe(1);
            const call = transport.signAndSubmitCalls[0] as { stmt: Statement };
            // Topics should now have appTopic AND topic2
            expect(call.stmt.topics?.length).toBe(2);
        });

        test("destroy unsubscribes from active subscription", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const unsubSpy = vi.fn();
            // Inject an active subscription
            const internal = client as unknown as {
                subscription: Unsubscribable | null;
                transport: StatementTransport | null;
            };
            internal.subscription = { unsubscribe: unsubSpy };
            internal.transport = createMockTransport();

            client.destroy();

            expect(unsubSpy).toHaveBeenCalledOnce();
        });

        test("parseStatement returns null when decodeData throws", () => {
            const client = new StatementStoreClient({ appName: "test" });
            const parse = (
                client as unknown as {
                    parseStatement: <T>(stmt: Statement) => ReceivedStatement<T> | null;
                }
            ).parseStatement;

            // Data is non-UTF-8 bytes which will fail JSON.parse
            const invalidStmt = {
                data: new Uint8Array([0xff, 0xfe, 0xfd]),
                topics: [],
            } as unknown as Statement;

            expect(parse.call(client, invalidStmt)).toBeNull();
        });

        test("connect throws after destroy (one-way lifecycle)", async () => {
            const client = new StatementStoreClient({ appName: "test" });
            client.destroy();

            const signer = {
                publicKey: new Uint8Array(32),
                sign: () => new Uint8Array(64),
            };
            await expect(client.connect(signer)).rejects.toThrow(StatementConnectionError);
        });

        test("doConnect guard destroys newly-created transport if destroy races with await", async () => {
            // Directly exercise the guard in doConnect. The guard fires when destroyed=true
            // after the await point. We simulate this by pre-setting destroyed=true on
            // the internal state, which is the outcome of a destroy() call that races
            // with createTransport's microtask resolution.
            const client = new StatementStoreClient({ appName: "test" });
            const transport = createMockTransport();

            const internal = client as unknown as {
                doConnect: (c: ConnectionCredentials) => Promise<void>;
                destroyed: boolean;
                config: { transport?: StatementTransport };
            };

            // Inject the transport via config so doConnect takes it synchronously,
            // then pre-set destroyed to simulate the race outcome.
            internal.config.transport = transport;
            internal.destroyed = true;

            await internal.doConnect({
                mode: "local",
                signer: {
                    publicKey: new Uint8Array(32),
                    sign: () => new Uint8Array(64),
                },
            });

            // Guard should have kicked in before startSubscription
            expect(transport.subscribeCalls.length).toBe(0);
            expect(client.isConnected()).toBe(false);
            // User-provided transport (via config.transport) is NOT destroyed by us
            expect(transport.destroy).not.toHaveBeenCalled();
        });
    });
}
