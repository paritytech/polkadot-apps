import { createLogger } from "@polkadot-apps/logger";
import { DEFAULT_BULLETIN_ENDPOINT } from "@polkadot-apps/host";

import { StatementConnectionError, StatementSubscriptionError } from "./errors.js";
import type { ConnectionCredentials, StatementTransport, Unsubscribable } from "./types.js";

import type { Statement, TopicFilter as SdkTopicFilter } from "@novasamatech/sdk-statement";

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
    private readonly store: HostStore;

    constructor(store: HostStore) {
        this.store = store;
    }

    subscribe(
        filter: SdkTopicFilter,
        onStatements: (statements: Statement[]) => void,
        onError: (error: Error) => void,
    ): Unsubscribable {
        const topics = extractTopicBytes(filter);

        try {
            const unsub = this.store.subscribe(topics, (statements) => {
                // product-sdk delivers SignedStatement[] — map to Statement[] shape
                onStatements(statements as unknown as Statement[]);
            });

            log.info("Host subscription active");

            return {
                unsubscribe: () => {
                    if (typeof unsub === "function") {
                        unsub();
                    } else if (
                        unsub &&
                        typeof (unsub as { unsubscribe?: () => void }).unsubscribe === "function"
                    ) {
                        (unsub as { unsubscribe: () => void }).unsubscribe();
                    }
                },
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

        // Map our Statement to the host's expected format
        const hostStatement = statement as unknown as Record<string, unknown>;
        const proof = await this.store.createProof(credentials.accountId, hostStatement);
        const signedStatement = { ...hostStatement, proof };
        await this.store.submit(signedStatement as never);

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
        const { getWsProvider } = await import("polkadot-api/ws-provider/web");
        const { createClient: createSubstrateClient } = await import(
            "@polkadot-api/substrate-client"
        );
        const { createStatementSdk } = await import("@novasamatech/sdk-statement");

        const provider = getWsProvider(endpoint);
        const client = createSubstrateClient(provider);

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
            return new HostTransport(store as unknown as HostStore);
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

/** Minimal type for the host statement store returned by product-sdk. */
interface HostStore {
    subscribe(
        topics: Uint8Array[],
        callback: (statements: unknown[]) => void,
    ): (() => void) | { unsubscribe: () => void };
    createProof(accountId: [string, number], statement: Record<string, unknown>): Promise<unknown>;
    submit(signedStatement: never): Promise<void>;
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
        function createMockHostStore(): HostStore & {
            subscribeCalls: unknown[];
            submitCalls: unknown[];
            createProofCalls: unknown[];
        } {
            const mock = {
                subscribeCalls: [] as unknown[],
                submitCalls: [] as unknown[],
                createProofCalls: [] as unknown[],
                subscribe: vi.fn((topics: Uint8Array[], callback: (stmts: unknown[]) => void) => {
                    mock.subscribeCalls.push({ topics, callback });
                    return () => {};
                }),
                createProof: vi.fn(
                    async (accountId: [string, number], statement: Record<string, unknown>) => {
                        mock.createProofCalls.push({ accountId, statement });
                        return {
                            type: "sr25519",
                            value: {
                                signature: "0x" + "aa".repeat(64),
                                signer: "0x" + "bb".repeat(32),
                            },
                        };
                    },
                ),
                submit: vi.fn(async () => {}),
            };
            return mock;
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

        test("subscribe delivers statements to callback", () => {
            const store = createMockHostStore();
            const transport = new HostTransport(store);
            const received: Statement[][] = [];

            transport.subscribe(
                "any",
                (stmts) => received.push(stmts),
                () => {},
            );

            // Simulate store delivering statements
            const call = store.subscribeCalls[0] as { callback: (s: unknown[]) => void };
            call.callback([{ data: new Uint8Array([1, 2, 3]) }]);

            expect(received.length).toBe(1);
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

        test("signAndSubmit calls createProof then submit", async () => {
            const store = createMockHostStore();
            const transport = new HostTransport(store);

            await transport.signAndSubmit({ data: new Uint8Array([1]) } as Statement, {
                mode: "host",
                accountId: ["5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY", 42],
            });

            expect(store.createProofCalls.length).toBe(1);
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
