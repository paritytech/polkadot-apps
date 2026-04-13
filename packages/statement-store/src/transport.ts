import { createLogger } from "@polkadot-apps/logger";
import { DEFAULT_BULLETIN_ENDPOINT } from "@polkadot-apps/host";
import type { HostStatementStore } from "@polkadot-apps/host";

import { StatementConnectionError, StatementSubscriptionError } from "./errors.js";
import type { ConnectionCredentials, StatementTransport, Unsubscribable } from "./types.js";

import type { Statement, TopicFilter as SdkTopicFilter } from "@novasamatech/sdk-statement";

// Type-only imports for the host↔sdk bridge (erased at compile time, zero bundle cost).
// product-sdk's SCALE-decoded types use Uint8Array + { tag } enums;
// sdk-statement's types use hex strings + { type } enums.
import type {
    Statement as HostStatement,
    SignedStatement as HostSignedStatement,
} from "@novasamatech/product-sdk";

const log = createLogger("statement-store:transport");

// ============================================================================
// Host Transport — uses the Host API's native binary protocol
// ============================================================================

/**
 * Statement transport that uses the Host API inside containers.
 *
 * Communicates through the host's native `remote_statement_store_*` protocol
 * which bypasses JSON-RPC entirely. Subscriptions, proof creation, and submission
 * all go through typed binary messages over the host transport.
 */
class HostTransport implements StatementTransport {
    private readonly store: HostStatementStore;

    constructor(store: HostStatementStore) {
        this.store = store;
    }

    subscribe(
        filter: SdkTopicFilter,
        onStatements: (statements: Statement[]) => void,
        onError: (error: Error) => void,
    ): Unsubscribable {
        const topics = extractTopicBytes(filter);

        try {
            const sub = this.store.subscribe(topics, (statements) => {
                // product-sdk delivers HostSignedStatement[] (Uint8Array fields, { tag } enums).
                // sdk-statement expects Statement (hex string fields, { type } enums).
                const converted = statements.map(hostSignedStatementToSdk);
                onStatements(converted);
            });

            log.info("Host subscription active");

            return {
                unsubscribe: () => sub.unsubscribe(),
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            log.warn("Host subscription failed", { error: msg });
            onError(new StatementSubscriptionError(msg));
            return { unsubscribe: () => {} };
        }
    }

    async signAndSubmit(statement: Statement, credentials: ConnectionCredentials): Promise<void> {
        if (credentials.mode !== "host") {
            throw new StatementConnectionError(
                "HostTransport requires host credentials. Use { mode: 'host', accountId } to connect.",
            );
        }

        // Convert sdk-statement format (hex strings) → product-sdk format (Uint8Array)
        // so the host's SCALE codec can encode it correctly.
        const hostStatement = sdkStatementToHost(statement);
        const proof = await this.store.createProof(credentials.accountId, hostStatement);
        const signedStatement: HostSignedStatement = { ...hostStatement, proof };
        await this.store.submit(signedStatement);

        log.debug("Statement submitted via host");
    }

    destroy(): void {
        // Host owns the transport — nothing to clean up
    }
}

// ============================================================================
// RPC Transport — uses substrate-client + sdk-statement
// ============================================================================

/**
 * Statement transport using JSON-RPC over WebSocket.
 *
 * Uses `@polkadot-api/substrate-client` (routes subscriptions by ID, not method name)
 * with `@novasamatech/sdk-statement` for statement SCALE encoding/decoding.
 *
 * This is the fallback transport for outside-container usage (development, testing).
 */
class RpcTransport implements StatementTransport {
    private readonly sdk: ReturnType<
        typeof import("@novasamatech/sdk-statement").createStatementSdk
    >;
    private readonly destroyClient: () => void;

    private constructor(sdk: RpcTransport["sdk"], destroyClient: () => void) {
        this.sdk = sdk;
        this.destroyClient = destroyClient;
    }

    static async create(endpoint: string): Promise<RpcTransport> {
        // Resolve all dynamic imports before allocating any resources.
        // This way, if a module is missing we fail fast with no cleanup needed.
        const [wsMod, substrateMod, sdkMod] = await Promise.all([
            import("polkadot-api/ws-provider/web"),
            import("@polkadot-api/substrate-client"),
            import("@novasamatech/sdk-statement"),
        ]);
        const { getWsProvider } = wsMod;
        const { createClient: createSubstrateClient } = substrateMod;
        const { createStatementSdk } = sdkMod;

        // Now allocate the WebSocket + client. Any failure from here on
        // must call client.destroy() to avoid leaking the socket.
        const provider = getWsProvider(endpoint);
        const client = createSubstrateClient(provider);

        try {
            // Build request/subscribe functions from the substrate client
            // following the lazyClient pattern from triangle-js-sdks
            const requestFn = <Reply>(method: string, params: unknown[]) =>
                new Promise<Reply>((resolve, reject) => {
                    client._request<Reply, unknown>(method, params, {
                        onSuccess: (result) => resolve(result),
                        onError: (e) => reject(e),
                    });
                });

            const subscribeFn = <T>(
                method: string,
                params: unknown[],
                onMessage: (message: T) => void,
                onError: (error: Error) => void,
            ) => {
                return client._request<string, T>(method, params, {
                    onSuccess: (subscriptionId, followSubscription) => {
                        followSubscription(subscriptionId, { next: onMessage, error: onError });
                    },
                    onError,
                });
            };

            const sdk = createStatementSdk(requestFn, subscribeFn);

            // Warm up the WebSocket connection — substrate-client's _request throws
            // synchronously if the WS isn't ready, unlike request() which queues.
            try {
                await requestFn("system_name", []);
            } catch {
                // Non-fatal — connection may still be usable
            }

            log.info("Connected via direct RPC", { endpoint });
            return new RpcTransport(sdk, () => client.destroy());
        } catch (error) {
            // Any failure during setup — destroy the client to avoid leaking the WS
            client.destroy();
            throw error;
        }
    }

    subscribe(
        filter: SdkTopicFilter,
        onStatements: (statements: Statement[]) => void,
        onError: (error: Error) => void,
    ): Unsubscribable {
        try {
            const unsub = this.sdk.subscribeStatements(
                filter,
                (statement) => {
                    // sdk-statement delivers one statement at a time — batch it
                    onStatements([statement]);
                },
                (error) => {
                    log.warn("RPC subscription error", { error: error.message });
                    onError(new StatementSubscriptionError(error.message, { cause: error }));
                },
            );

            log.info("RPC subscription active");

            return {
                unsubscribe: () => {
                    unsub();
                },
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            log.warn("Failed to start RPC subscription", { error: msg });
            onError(new StatementSubscriptionError(msg));
            return { unsubscribe: () => {} };
        }
    }

    async signAndSubmit(statement: Statement, credentials: ConnectionCredentials): Promise<void> {
        if (credentials.mode !== "local") {
            throw new StatementConnectionError(
                "RpcTransport requires local credentials. Use { mode: 'local', signer } to connect.",
            );
        }

        const { getStatementSigner } = await import("@novasamatech/sdk-statement");

        const signer = getStatementSigner(credentials.signer.publicKey, "sr25519", (data) =>
            credentials.signer.sign(data),
        );

        const signed = await signer.sign(statement);
        const result = await this.sdk.submit(signed);

        if (result.status === "new" || result.status === "known") {
            log.debug("Statement submitted via RPC", { status: result.status });
            return;
        }

        throw new Error(
            `Statement submission failed: ${result.status}${
                "reason" in result ? ` (${(result as { reason: string }).reason})` : ""
            }`,
        );
    }

    async query(filter: SdkTopicFilter): Promise<Statement[]> {
        return this.sdk.getStatements(filter);
    }

    destroy(): void {
        this.destroyClient();
    }
}

// ============================================================================
// Transport Factory
// ============================================================================

/**
 * Create a statement store transport.
 *
 * Strategy (Host API first):
 * 1. Try the Host API via `@polkadot-apps/host` — uses the container's native
 *    statement store protocol (binary, not JSON-RPC). This is the production path.
 * 2. If the host is unavailable (not inside a container, product-sdk not installed),
 *    fall back to a direct WebSocket connection using `@polkadot-api/substrate-client`
 *    with `@novasamatech/sdk-statement`.
 *
 * @param config - Configuration with an optional fallback `endpoint`.
 * @returns A configured {@link StatementTransport}.
 * @throws {StatementConnectionError} If no connection method is available.
 */
export async function createTransport(config: {
    endpoint?: string;
}): Promise<StatementTransport> {
    // 1. Try Host API first (inside container)
    try {
        const { getStatementStore } = await import("@polkadot-apps/host");
        const store = await getStatementStore();
        if (store) {
            log.info("Using host API statement store transport");
            return new HostTransport(store);
        }
    } catch (error) {
        log.debug("Host API unavailable", {
            error: error instanceof Error ? error.message : String(error),
        });
    }

    // 2. Fall back to direct RPC
    const endpoint = config.endpoint ?? DEFAULT_BULLETIN_ENDPOINT;
    if (endpoint) {
        try {
            return await RpcTransport.create(endpoint);
        } catch (error) {
            throw new StatementConnectionError(
                `Failed to connect to ${endpoint}: ${error instanceof Error ? error.message : String(error)}`,
                { cause: error instanceof Error ? error : undefined },
            );
        }
    }

    throw new StatementConnectionError(
        "No connection method available. Run inside a container or provide an explicit endpoint.",
    );
}

// ============================================================================
// Internal Helpers
// ============================================================================

// ============================================================================
// Host ↔ SDK Type Bridge
//
// product-sdk types (SCALE-decoded): Uint8Array fields, { tag: "Sr25519" } enums
// sdk-statement types:               hex string fields, { type: "sr25519" } enums
//
// Both represent the same on-chain statement data but with different runtime
// shapes. These converters bridge between the two so HostTransport can speak
// both languages correctly.
// ============================================================================

/** Convert a product-sdk SignedStatement (Uint8Array fields) → sdk-statement Statement (hex strings). */
function hostSignedStatementToSdk(hostStmt: HostSignedStatement): Statement {
    const result: Partial<Statement> = {};

    // data: Uint8Array → Uint8Array (same in both formats)
    if (hostStmt.data) result.data = hostStmt.data;

    // expiry: bigint → bigint (same in both formats)
    if (hostStmt.expiry !== undefined) result.expiry = hostStmt.expiry;

    // topics: Uint8Array[] → hex string[]
    if (hostStmt.topics) {
        result.topics = hostStmt.topics.map(bytesToHex) as Statement["topics"];
    }

    // channel: Uint8Array → hex string
    if (hostStmt.channel) {
        result.channel = bytesToHex(hostStmt.channel) as Statement["channel"];
    }

    // decryptionKey: Uint8Array → hex string
    if (hostStmt.decryptionKey) {
        result.decryptionKey = bytesToHex(hostStmt.decryptionKey) as Statement["decryptionKey"];
    }

    // proof: { tag: "Sr25519", value: { signature: Uint8Array, signer: Uint8Array } }
    //      → { type: "sr25519", value: { signature: hexString, signer: hexString } }
    if (hostStmt.proof) {
        const tag = hostStmt.proof.tag;
        const value = hostStmt.proof.value;
        const sdkType = tag.charAt(0).toLowerCase() + tag.slice(1);

        if ("signature" in value && "signer" in value) {
            result.proof = {
                type: sdkType,
                value: {
                    signature: bytesToHex(value.signature),
                    signer: bytesToHex(value.signer),
                },
            } as Statement["proof"];
        }
    }

    return result as Statement;
}

/** Convert an sdk-statement Statement (hex strings) → product-sdk HostStatement (Uint8Array). */
function sdkStatementToHost(stmt: Statement): HostStatement {
    const result: Partial<HostStatement> = {};

    // data: Uint8Array → Uint8Array (same)
    if (stmt.data) result.data = stmt.data;

    // expiry: bigint → bigint (same)
    if (stmt.expiry !== undefined) result.expiry = stmt.expiry;

    // topics: hex string[] → Uint8Array[]
    if (stmt.topics) {
        result.topics = stmt.topics.map(hexToBytes);
    }

    // channel: hex string → Uint8Array
    if (stmt.channel) {
        result.channel = hexToBytes(stmt.channel);
    }

    // decryptionKey: hex string → Uint8Array
    if (stmt.decryptionKey) {
        result.decryptionKey = hexToBytes(stmt.decryptionKey);
    }

    return result as HostStatement;
}

/** Extract topic Uint8Arrays from an sdk-statement TopicFilter for the host API. */
function extractTopicBytes(filter: SdkTopicFilter): Uint8Array[] {
    if (filter === "any") return [];
    if ("matchAll" in filter) {
        return filter.matchAll.map(hexToBytes);
    }
    if ("matchAny" in filter) {
        return filter.matchAny.map(hexToBytes);
    }
    return [];
}

/** Convert a 0x-prefixed hex string to Uint8Array. */
function hexToBytes(hex: string): Uint8Array {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

/** Convert Uint8Array to 0x-prefixed hex string. */
function bytesToHex(bytes: Uint8Array): string {
    let hex = "0x";
    for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex;
}

// ============================================================================
// Tests
// ============================================================================

if (import.meta.vitest) {
    const { describe, test, expect, vi, beforeEach } = import.meta.vitest;
    const { configure } = await import("@polkadot-apps/logger");

    beforeEach(() => {
        configure({ handler: () => {} });
    });

    describe("HostTransport", () => {
        function createMockHostStore() {
            const mock = {
                subscribeCalls: [] as unknown[],
                submitCalls: [] as unknown[],
                createProofCalls: [] as unknown[],
                subscribe: vi.fn(
                    (topics: Uint8Array[], callback: (stmts: HostSignedStatement[]) => void) => {
                        mock.subscribeCalls.push({ topics, callback });
                        return { unsubscribe: () => {}, onInterrupt: () => () => {} };
                    },
                ),
                createProof: vi.fn(async (accountId: unknown, statement: unknown) => {
                    mock.createProofCalls.push({ accountId, statement });
                    return {
                        tag: "Sr25519" as const,
                        value: {
                            signature: new Uint8Array(64).fill(0xaa),
                            signer: new Uint8Array(32).fill(0xbb),
                        },
                    };
                }),
                submit: vi.fn(async () => {}),
            };
            return mock as unknown as HostStatementStore & {
                subscribeCalls: unknown[];
                submitCalls: unknown[];
                createProofCalls: unknown[];
            };
        }

        test("subscribe calls store.subscribe with topic bytes", () => {
            const store = createMockHostStore();
            const transport = new HostTransport(store);

            transport.subscribe(
                { matchAll: ["0x" + "11".repeat(32)] as `0x${string}`[] },
                () => {},
                () => {},
            );

            expect(store.subscribeCalls.length).toBe(1);
            const call = store.subscribeCalls[0] as { topics: Uint8Array[] };
            expect(call.topics[0]).toEqual(new Uint8Array(32).fill(0x11));
        });

        test("subscribe converts product-sdk statements to sdk-statement shape", () => {
            const store = createMockHostStore();
            const transport = new HostTransport(store);
            const received: Statement[][] = [];

            transport.subscribe(
                "any",
                (stmts) => received.push(stmts),
                () => {},
            );

            // Simulate host delivering a product-sdk-shaped HostSignedStatement
            // (Uint8Array fields, { tag: "Sr25519" } proof)
            const call = store.subscribeCalls[0] as {
                callback: (s: HostSignedStatement[]) => void;
            };
            call.callback([
                {
                    data: new Uint8Array([1, 2, 3]),
                    topics: [new Uint8Array(32).fill(0x11)],
                    channel: new Uint8Array(32).fill(0x22),
                    expiry: 100n,
                    proof: {
                        tag: "Sr25519" as const,
                        value: {
                            signature: new Uint8Array(64).fill(0xaa),
                            signer: new Uint8Array(32).fill(0xbb),
                        },
                    },
                } as unknown as HostSignedStatement,
            ]);

            expect(received.length).toBe(1);
            const stmt = received[0][0];
            // Verify conversion: fields should now be hex strings
            expect(stmt.data).toBeInstanceOf(Uint8Array); // data stays as Uint8Array
            expect(typeof stmt.topics?.[0]).toBe("string"); // topics converted to hex
            expect(stmt.topics?.[0]).toBe("0x" + "11".repeat(32));
            expect(typeof stmt.channel).toBe("string"); // channel converted to hex
            expect(stmt.channel).toBe("0x" + "22".repeat(32));
            expect(stmt.expiry).toBe(100n);
            // Proof: tag → type, PascalCase → camelCase
            const proof = stmt.proof as { type: string; value: { signer: string } };
            expect(proof.type).toBe("sr25519"); // converted from "Sr25519"
            expect(typeof proof.value.signer).toBe("string"); // converted from Uint8Array
        });

        test("subscribe calls onError when store throws", () => {
            const store = createMockHostStore();
            store.subscribe = vi.fn(() => {
                throw new Error("store down");
            });
            const transport = new HostTransport(store);
            const errors: Error[] = [];

            transport.subscribe(
                "any",
                () => {},
                (e) => errors.push(e),
            );

            expect(errors.length).toBe(1);
            expect(errors[0]).toBeInstanceOf(StatementSubscriptionError);
        });

        test("signAndSubmit converts sdk-statement to host format and calls createProof then submit", async () => {
            const store = createMockHostStore();
            const transport = new HostTransport(store);

            // Pass sdk-statement-shaped Statement (hex string fields)
            const sdkStatement = {
                data: new Uint8Array([1]),
                topics: ["0x" + "11".repeat(32)] as `0x${string}`[],
                channel: ("0x" + "22".repeat(32)) as `0x${string}`,
                expiry: 100n,
            } as Statement;

            await transport.signAndSubmit(sdkStatement, {
                mode: "host",
                accountId: ["5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY", 42],
            });

            expect(store.createProofCalls.length).toBe(1);
            // Verify the statement was converted to host format (Uint8Array fields)
            const proofCall = store.createProofCalls[0] as {
                statement: Record<string, unknown>;
            };
            expect(proofCall.statement.topics).toBeInstanceOf(Array);
            expect((proofCall.statement.topics as Uint8Array[])[0]).toBeInstanceOf(Uint8Array);
            expect((proofCall.statement.topics as Uint8Array[])[0]).toEqual(
                new Uint8Array(32).fill(0x11),
            );
            expect(proofCall.statement.channel).toBeInstanceOf(Uint8Array);
            expect(store.submit).toHaveBeenCalledOnce();
        });

        test("signAndSubmit throws for local credentials", async () => {
            const store = createMockHostStore();
            const transport = new HostTransport(store);

            await expect(
                transport.signAndSubmit({} as Statement, {
                    mode: "local",
                    signer: { publicKey: new Uint8Array(32), sign: () => new Uint8Array(64) },
                }),
            ).rejects.toThrow("HostTransport requires host credentials");
        });

        test("destroy is safe to call", () => {
            const store = createMockHostStore();
            const transport = new HostTransport(store);
            expect(() => transport.destroy()).not.toThrow();
        });
    });

    describe("createTransport", () => {
        test("throws StatementConnectionError when no method available", async () => {
            // Mock host to return null (not inside container)
            vi.doMock("@polkadot-apps/host", () => ({
                getStatementStore: async () => null,
                DEFAULT_BULLETIN_ENDPOINT: "",
            }));
            try {
                await expect(createTransport({ endpoint: "" })).rejects.toThrow(
                    StatementConnectionError,
                );
            } finally {
                vi.doUnmock("@polkadot-apps/host");
            }
        });

        test("returns HostTransport when host API is available", async () => {
            const mockStore = {
                subscribe: vi.fn(() => ({ unsubscribe: () => {}, onInterrupt: () => () => {} })),
                createProof: vi.fn(),
                submit: vi.fn(),
            };
            vi.doMock("@polkadot-apps/host", () => ({
                getStatementStore: async () => mockStore,
                DEFAULT_BULLETIN_ENDPOINT: "wss://example.com",
            }));
            try {
                const { createTransport: createTransportFresh } = await import("./transport.js");
                const transport = await createTransportFresh({});
                expect(transport).toBeDefined();
                expect(typeof transport.subscribe).toBe("function");
                expect(typeof transport.signAndSubmit).toBe("function");
            } finally {
                vi.doUnmock("@polkadot-apps/host");
            }
        });

        test("wraps RpcTransport.create errors in StatementConnectionError", async () => {
            // Host unavailable, and RpcTransport.create will fail because the
            // dynamic imports for polkadot-api/ws-provider/web will succeed but
            // connecting to a bogus endpoint via system_name will fail non-fatally.
            // Instead, we simulate an endpoint import failure by using an invalid endpoint.
            // The error should wrap into StatementConnectionError.
            vi.doMock("@polkadot-apps/host", () => ({
                getStatementStore: async () => null,
                DEFAULT_BULLETIN_ENDPOINT: "wss://example.com",
            }));
            // Mock substrate-client to throw on createClient
            vi.doMock("@polkadot-api/substrate-client", () => ({
                createClient: () => {
                    throw new Error("mocked failure");
                },
            }));
            try {
                const { createTransport: createTransportFresh } = await import("./transport.js");
                await expect(
                    createTransportFresh({ endpoint: "wss://example.com" }),
                ).rejects.toThrow(StatementConnectionError);
            } finally {
                vi.doUnmock("@polkadot-apps/host");
                vi.doUnmock("@polkadot-api/substrate-client");
            }
        });
    });

    describe("RpcTransport (via mocked dynamic imports)", () => {
        function setupRpcMocks(options?: {
            submitResult?: { status: string; reason?: string };
            statementsResult?: Statement[];
            subscribeThrows?: boolean;
            submitThrows?: boolean;
            systemNameThrows?: boolean;
        }) {
            const destroyClient = vi.fn();
            const mockSdk = {
                submit: vi.fn(async () => {
                    if (options?.submitThrows) throw new Error("submit failed");
                    return options?.submitResult ?? { status: "new" };
                }),
                getStatements: vi.fn(async () => options?.statementsResult ?? []),
                subscribeStatements: vi.fn(
                    (
                        _filter: SdkTopicFilter,
                        _onStatement: (s: Statement) => void,
                        _onError: (e: Error) => void,
                    ) => {
                        if (options?.subscribeThrows) throw new Error("subscribe failed");
                        return () => {};
                    },
                ),
                getBroadcasts: vi.fn(),
                getPosted: vi.fn(),
            };

            vi.doMock("polkadot-api/ws-provider/web", () => ({
                getWsProvider: () => ({}),
            }));
            vi.doMock("@polkadot-api/substrate-client", () => ({
                createClient: () => ({
                    _request: (
                        method: string,
                        _params: unknown[],
                        callbacks: {
                            onSuccess: (r: unknown) => void;
                            onError: (e: Error) => void;
                        },
                    ) => {
                        if (method === "system_name") {
                            if (options?.systemNameThrows) {
                                callbacks.onError(new Error("system_name failed"));
                            } else {
                                callbacks.onSuccess("test-node");
                            }
                        }
                    },
                    destroy: destroyClient,
                }),
            }));
            vi.doMock("@novasamatech/sdk-statement", () => ({
                createStatementSdk: () => mockSdk,
                getStatementSigner: (publicKey: Uint8Array, type: string) => ({
                    publicKey,
                    sign: async (stmt: Statement) => ({
                        ...stmt,
                        proof: {
                            type,
                            value: {
                                signature: "0x" + "00".repeat(64),
                                signer: "0x" + "00".repeat(32),
                            },
                        },
                    }),
                }),
            }));

            return { mockSdk, destroyClient };
        }

        function teardownRpcMocks() {
            vi.doUnmock("polkadot-api/ws-provider/web");
            vi.doUnmock("@polkadot-api/substrate-client");
            vi.doUnmock("@novasamatech/sdk-statement");
        }

        test("create + subscribe delivers statements via SDK", async () => {
            const { mockSdk } = setupRpcMocks();
            try {
                const { createTransport: create } = await import("./transport.js");
                vi.doMock("@polkadot-apps/host", () => ({
                    getStatementStore: async () => null,
                    DEFAULT_BULLETIN_ENDPOINT: "wss://example.com",
                }));
                const transport = await create({ endpoint: "wss://example.com" });
                const received: Statement[][] = [];
                transport.subscribe(
                    "any",
                    (stmts) => received.push(stmts),
                    () => {},
                );

                expect(mockSdk.subscribeStatements).toHaveBeenCalled();

                // Simulate sdk delivering a statement
                const callback = mockSdk.subscribeStatements.mock.calls[0][1] as (
                    s: Statement,
                ) => void;
                callback({ expiry: 1n } as Statement);
                expect(received.length).toBe(1);

                transport.destroy();
                vi.doUnmock("@polkadot-apps/host");
            } finally {
                teardownRpcMocks();
            }
        });

        test("subscribe calls onError when sdk throws synchronously", async () => {
            setupRpcMocks({ subscribeThrows: true });
            try {
                const { createTransport: create } = await import("./transport.js");
                vi.doMock("@polkadot-apps/host", () => ({
                    getStatementStore: async () => null,
                    DEFAULT_BULLETIN_ENDPOINT: "wss://example.com",
                }));
                const transport = await create({ endpoint: "wss://example.com" });
                const errors: Error[] = [];
                transport.subscribe(
                    "any",
                    () => {},
                    (e) => errors.push(e),
                );

                expect(errors.length).toBe(1);
                expect(errors[0]).toBeInstanceOf(StatementSubscriptionError);

                transport.destroy();
                vi.doUnmock("@polkadot-apps/host");
            } finally {
                teardownRpcMocks();
            }
        });

        test("subscribe forwards sdk onError as StatementSubscriptionError", async () => {
            const { mockSdk } = setupRpcMocks();
            try {
                const { createTransport: create } = await import("./transport.js");
                vi.doMock("@polkadot-apps/host", () => ({
                    getStatementStore: async () => null,
                    DEFAULT_BULLETIN_ENDPOINT: "wss://example.com",
                }));
                const transport = await create({ endpoint: "wss://example.com" });
                const errors: Error[] = [];
                transport.subscribe(
                    "any",
                    () => {},
                    (e) => errors.push(e),
                );

                const sdkErrorCb = mockSdk.subscribeStatements.mock.calls[0][2] as (
                    e: Error,
                ) => void;
                sdkErrorCb(new Error("stream died"));

                expect(errors.length).toBe(1);
                expect(errors[0]).toBeInstanceOf(StatementSubscriptionError);

                transport.destroy();
                vi.doUnmock("@polkadot-apps/host");
            } finally {
                teardownRpcMocks();
            }
        });

        test("signAndSubmit signs and calls sdk.submit", async () => {
            const { mockSdk } = setupRpcMocks({ submitResult: { status: "new" } });
            try {
                const { createTransport: create } = await import("./transport.js");
                vi.doMock("@polkadot-apps/host", () => ({
                    getStatementStore: async () => null,
                    DEFAULT_BULLETIN_ENDPOINT: "wss://example.com",
                }));
                const transport = await create({ endpoint: "wss://example.com" });

                await transport.signAndSubmit({ data: new Uint8Array([1]) } as Statement, {
                    mode: "local",
                    signer: {
                        publicKey: new Uint8Array(32),
                        sign: () => new Uint8Array(64),
                    },
                });

                expect(mockSdk.submit).toHaveBeenCalled();
                transport.destroy();
                vi.doUnmock("@polkadot-apps/host");
            } finally {
                teardownRpcMocks();
            }
        });

        test("signAndSubmit throws for host credentials on RpcTransport", async () => {
            setupRpcMocks();
            try {
                const { createTransport: create } = await import("./transport.js");
                vi.doMock("@polkadot-apps/host", () => ({
                    getStatementStore: async () => null,
                    DEFAULT_BULLETIN_ENDPOINT: "wss://example.com",
                }));
                const transport = await create({ endpoint: "wss://example.com" });

                await expect(
                    transport.signAndSubmit({} as Statement, {
                        mode: "host",
                        accountId: ["addr", 0],
                    }),
                ).rejects.toThrow(StatementConnectionError);

                transport.destroy();
                vi.doUnmock("@polkadot-apps/host");
            } finally {
                teardownRpcMocks();
            }
        });

        test("signAndSubmit throws when submit result is rejected", async () => {
            setupRpcMocks({ submitResult: { status: "rejected", reason: "dataTooLarge" } });
            try {
                const { createTransport: create } = await import("./transport.js");
                vi.doMock("@polkadot-apps/host", () => ({
                    getStatementStore: async () => null,
                    DEFAULT_BULLETIN_ENDPOINT: "wss://example.com",
                }));
                const transport = await create({ endpoint: "wss://example.com" });

                await expect(
                    transport.signAndSubmit({ data: new Uint8Array([1]) } as Statement, {
                        mode: "local",
                        signer: {
                            publicKey: new Uint8Array(32),
                            sign: () => new Uint8Array(64),
                        },
                    }),
                ).rejects.toThrow(/rejected/);

                transport.destroy();
                vi.doUnmock("@polkadot-apps/host");
            } finally {
                teardownRpcMocks();
            }
        });

        test("query delegates to sdk.getStatements", async () => {
            const testStmt: Statement = { expiry: 5n };
            const { mockSdk } = setupRpcMocks({ statementsResult: [testStmt] });
            try {
                const { createTransport: create } = await import("./transport.js");
                vi.doMock("@polkadot-apps/host", () => ({
                    getStatementStore: async () => null,
                    DEFAULT_BULLETIN_ENDPOINT: "wss://example.com",
                }));
                const transport = await create({ endpoint: "wss://example.com" });

                const result = await transport.query?.("any");
                expect(result).toEqual([testStmt]);
                expect(mockSdk.getStatements).toHaveBeenCalledWith("any");

                transport.destroy();
                vi.doUnmock("@polkadot-apps/host");
            } finally {
                teardownRpcMocks();
            }
        });

        test("destroy calls client.destroy", async () => {
            const { destroyClient } = setupRpcMocks();
            try {
                const { createTransport: create } = await import("./transport.js");
                vi.doMock("@polkadot-apps/host", () => ({
                    getStatementStore: async () => null,
                    DEFAULT_BULLETIN_ENDPOINT: "wss://example.com",
                }));
                const transport = await create({ endpoint: "wss://example.com" });
                transport.destroy();
                expect(destroyClient).toHaveBeenCalledOnce();
                vi.doUnmock("@polkadot-apps/host");
            } finally {
                teardownRpcMocks();
            }
        });

        test("create still succeeds when system_name warmup fails", async () => {
            setupRpcMocks({ systemNameThrows: true });
            try {
                const { createTransport: create } = await import("./transport.js");
                vi.doMock("@polkadot-apps/host", () => ({
                    getStatementStore: async () => null,
                    DEFAULT_BULLETIN_ENDPOINT: "wss://example.com",
                }));
                const transport = await create({ endpoint: "wss://example.com" });
                expect(transport).toBeDefined();
                transport.destroy();
                vi.doUnmock("@polkadot-apps/host");
            } finally {
                teardownRpcMocks();
            }
        });
    });

    describe("HostTransport additional coverage", () => {
        test("subscribe skips statements with missing required fields gracefully", () => {
            // Build a mock that delivers partial statements (missing proof, missing data, etc.)
            const mockStore = {
                subscribe: vi.fn(
                    (_topics: Uint8Array[], callback: (stmts: HostSignedStatement[]) => void) => {
                        // Deliver a statement with only expiry — no proof, no data
                        callback([{ expiry: 1n } as unknown as HostSignedStatement]);
                        return { unsubscribe: () => {}, onInterrupt: () => () => {} };
                    },
                ),
                createProof: vi.fn(),
                submit: vi.fn(),
            } as unknown as HostStatementStore;

            const transport = new HostTransport(mockStore);
            const received: Statement[][] = [];
            transport.subscribe(
                "any",
                (stmts) => received.push(stmts),
                () => {},
            );

            expect(received.length).toBe(1);
            // Statement with minimal fields should still be delivered (just no proof/data)
            const stmt = received[0][0];
            expect(stmt.expiry).toBe(1n);
            expect(stmt.proof).toBeUndefined();
        });

        test("unsubscribe on returned handle calls store.subscribe's unsubscribe", () => {
            const unsubSpy = vi.fn();
            const mockStore = {
                subscribe: vi.fn(() => ({ unsubscribe: unsubSpy, onInterrupt: () => () => {} })),
                createProof: vi.fn(),
                submit: vi.fn(),
            } as unknown as HostStatementStore;

            const transport = new HostTransport(mockStore);
            const handle = transport.subscribe(
                "any",
                () => {},
                () => {},
            );
            handle.unsubscribe();

            expect(unsubSpy).toHaveBeenCalledOnce();
        });
    });

    describe("hostSignedStatementToSdk", () => {
        test("converts Uint8Array topics/channel to hex strings", () => {
            const result = hostSignedStatementToSdk({
                topics: [new Uint8Array(32).fill(0xaa)],
                channel: new Uint8Array(32).fill(0xbb),
                data: new Uint8Array([1, 2]),
                expiry: 42n,
                proof: {
                    tag: "Sr25519" as const,
                    value: {
                        signature: new Uint8Array(64),
                        signer: new Uint8Array(32),
                    },
                },
            } as unknown as HostSignedStatement);

            expect(result.topics?.[0]).toBe("0x" + "aa".repeat(32));
            expect(result.channel).toBe("0x" + "bb".repeat(32));
            expect(result.data).toEqual(new Uint8Array([1, 2]));
            expect(result.expiry).toBe(42n);
        });

        test("converts proof tag from PascalCase to camelCase", () => {
            const result = hostSignedStatementToSdk({
                proof: {
                    tag: "Sr25519" as const,
                    value: {
                        signature: new Uint8Array(64).fill(0xcc),
                        signer: new Uint8Array(32).fill(0xdd),
                    },
                },
            } as unknown as HostSignedStatement);

            const proof = result.proof as { type: string; value: { signer: string } };
            expect(proof.type).toBe("sr25519");
            expect(proof.value.signer).toBe("0x" + "dd".repeat(32));
        });
    });

    describe("sdkStatementToHost", () => {
        test("converts hex string topics/channel to Uint8Array", () => {
            const result = sdkStatementToHost({
                topics: ["0x" + "aa".repeat(32)],
                channel: "0x" + "bb".repeat(32),
                data: new Uint8Array([3, 4]),
                expiry: 99n,
            } as unknown as Statement);

            expect(result.topics?.[0]).toBeInstanceOf(Uint8Array);
            expect(result.topics?.[0]).toEqual(new Uint8Array(32).fill(0xaa));
            expect(result.channel).toBeInstanceOf(Uint8Array);
            expect(result.channel).toEqual(new Uint8Array(32).fill(0xbb));
            expect(result.data).toEqual(new Uint8Array([3, 4]));
            expect(result.expiry).toBe(99n);
        });

        test("handles missing optional fields", () => {
            const result = sdkStatementToHost({ expiry: 1n } as unknown as Statement);
            expect(result.topics).toBeUndefined();
            expect(result.channel).toBeUndefined();
        });
    });

    describe("extractTopicBytes", () => {
        test("returns empty array for 'any' filter", () => {
            expect(extractTopicBytes("any")).toEqual([]);
        });

        test("converts matchAll hex to bytes", () => {
            const result = extractTopicBytes({
                matchAll: ["0x" + "ff".repeat(32)] as `0x${string}`[],
            });
            expect(result.length).toBe(1);
            expect(result[0]).toEqual(new Uint8Array(32).fill(0xff));
        });

        test("converts matchAny hex to bytes", () => {
            const result = extractTopicBytes({
                matchAny: ["0x" + "aa".repeat(32), "0x" + "bb".repeat(32)] as `0x${string}`[],
            });
            expect(result.length).toBe(2);
        });
    });
}
