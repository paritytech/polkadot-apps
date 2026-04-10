import { createLogger } from "@polkadot-apps/logger";

import { StatementConnectionError, StatementSubscriptionError } from "./errors.js";
import { serializeTopicFilter, topicToHex } from "./topics.js";
import type {
    StatementEvent,
    StatementTransport,
    SubmitStatus,
    TopicFilter,
    TopicHash,
    Unsubscribable,
} from "./types.js";

const log = createLogger("statement-store:transport");

// ============================================================================
// Statement Event Extraction
// ============================================================================

/**
 * Extract a {@link StatementEvent} from the various response formats
 * that different node versions produce.
 *
 * Handles:
 * - Direct: `{ statements: [...] }`
 * - Wrapped: `{ NewStatements: { statements: [...] } }`
 * - Data-wrapped: `{ data: { statements: [...] } }` (most common in practice)
 */
function extractStatementEvent(event: unknown): StatementEvent | null {
    if (event == null || typeof event !== "object") return null;

    const obj = event as Record<string, unknown>;

    // Direct format
    if (Array.isArray(obj.statements)) {
        return obj as unknown as StatementEvent;
    }

    // NewStatements wrapped format
    if (
        obj.NewStatements != null &&
        typeof obj.NewStatements === "object" &&
        Array.isArray((obj.NewStatements as Record<string, unknown>).statements)
    ) {
        return obj.NewStatements as unknown as StatementEvent;
    }

    // Data-wrapped format (what the node actually sends)
    if (
        obj.data != null &&
        typeof obj.data === "object" &&
        Array.isArray((obj.data as Record<string, unknown>).statements)
    ) {
        return obj.data as unknown as StatementEvent;
    }

    return null;
}

// ============================================================================
// RPC Transport
// ============================================================================

/**
 * A PolkadotClient-compatible interface for raw RPC operations.
 *
 * This matches the subset of `PolkadotClient` methods we need.
 * Using an interface allows easy mocking in tests.
 */
export interface RpcClient {
    /** Make a one-shot RPC request. */
    request: (method: string, params: unknown[]) => Promise<unknown>;
    /** Start a subscription. Returns an unsubscribe function. */
    _request: <T, S>(
        method: string,
        params: unknown[],
        callbacks: {
            onSuccess: (
                subscriptionId: T,
                followSubscription: (
                    id: T,
                    handlers: { next: (event: S) => void; error: (e: Error) => void },
                ) => void,
            ) => void;
            onError: (error: Error) => void;
        },
    ) => () => void;
    /** Destroy the client and close the connection. */
    destroy: () => void;
}

/**
 * Statement store transport using JSON-RPC over WebSocket.
 *
 * Communicates with a statement store node via the standard `statement_*` RPC methods.
 * Supports both subscription-based real-time delivery and polling-based queries
 * with graceful fallback across multiple RPC methods.
 */
export class RpcTransport implements StatementTransport {
    private readonly client: RpcClient;
    private readonly ownsClient: boolean;

    /**
     * @param client - The RPC client to use for communication.
     * @param ownsClient - If true, `destroy()` will also destroy the client.
     *   Set to false when sharing a client from chain-client.
     */
    constructor(client: RpcClient, ownsClient: boolean) {
        this.client = client;
        this.ownsClient = ownsClient;
    }

    /**
     * Subscribe to statements matching a topic filter.
     *
     * Uses the `statement_subscribeStatement` RPC method which returns
     * batched events via a subscription stream. Handles all three event formats
     * (raw hex, StatementEvent, nested wrappers) for cross-node compatibility.
     *
     * If the node does not support subscriptions, `onError` is called
     * and the caller should fall back to polling.
     */
    subscribe(
        filter: TopicFilter,
        onStatement: (statementHex: string) => void,
        onError: (error: Error) => void,
    ): Unsubscribable {
        const serializedFilter = serializeTopicFilter(filter);

        let unsubFn: (() => void) | null = null;

        try {
            unsubFn = this.client._request("statement_subscribeStatement", [serializedFilter], {
                onSuccess: (_subscriptionId, followSubscription) => {
                    log.info("Subscription active");
                    followSubscription(_subscriptionId, {
                        next: (event: unknown) => {
                            // Handle raw hex string (legacy format)
                            if (typeof event === "string") {
                                onStatement(event);
                                return;
                            }

                            // Extract batched event from various wrapper formats
                            const statementEvent = extractStatementEvent(event);
                            if (statementEvent) {
                                for (const hex of statementEvent.statements) {
                                    onStatement(hex);
                                }
                            }
                        },
                        error: (e: Error) => {
                            log.warn("Subscription stream error", { error: e.message });
                            onError(new StatementSubscriptionError(e.message, { cause: e }));
                        },
                    });
                },
                onError: (e: Error) => {
                    log.warn("Subscription not available", { error: e.message });
                    onError(new StatementSubscriptionError(e.message, { cause: e }));
                },
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            log.warn("Failed to start subscription", { error: msg });
            onError(new StatementSubscriptionError(msg));
        }

        return {
            unsubscribe: () => {
                if (unsubFn) {
                    unsubFn();
                    unsubFn = null;
                }
            },
        };
    }

    /**
     * Submit a signed statement via the `statement_submit` RPC method.
     *
     * @returns The submission status extracted from the RPC response.
     */
    async submit(statementHex: string): Promise<SubmitStatus> {
        const result = await this.client.request("statement_submit", [statementHex]);

        const status = extractSubmitStatus(result);
        log.debug("Statement submitted", { status });
        return status;
    }

    /**
     * Query existing statements from the store.
     *
     * Tries multiple RPC methods with graceful fallback:
     * 1. `statement_posted` — filtered by topics + decryptionKey (most efficient)
     * 2. `statement_broadcasts` — filtered by topics only
     * 3. `statement_dump` — unfiltered, returns all statements
     *
     * Each method returns hex-encoded statements. If a method is not supported
     * by the node, the next one is tried.
     */
    async query(topics: TopicHash[], decryptionKey?: string): Promise<string[]> {
        const topicHexes = topics.map(topicToHex);

        // Try statement_posted (for statements with decryptionKey)
        if (decryptionKey) {
            try {
                const result = await this.client.request("statement_posted", [
                    topicHexes,
                    decryptionKey,
                ]);
                return asStringArray(result);
            } catch (error) {
                log.debug("statement_posted unavailable", {
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        // Try statement_broadcasts
        try {
            const result = await this.client.request("statement_broadcasts", [topicHexes]);
            return asStringArray(result);
        } catch (error) {
            log.debug("statement_broadcasts unavailable", {
                error: error instanceof Error ? error.message : String(error),
            });
        }

        // Fallback to statement_dump (all statements, unfiltered)
        try {
            const result = await this.client.request("statement_dump", []);
            return asStringArray(result);
        } catch (error) {
            log.debug("statement_dump unavailable", {
                error: error instanceof Error ? error.message : String(error),
            });
        }

        return [];
    }

    /**
     * Destroy the transport and release resources.
     *
     * If this transport owns the RPC client (created via `endpoint` config),
     * the client is also destroyed. If the client is shared from chain-client,
     * only the transport's state is cleaned up.
     */
    destroy(): void {
        if (this.ownsClient) {
            this.client.destroy();
        }
    }
}

/** Extract a SubmitStatus from a potentially nested RPC response. */
function extractSubmitStatus(result: unknown): SubmitStatus {
    if (result == null) return "rejected";

    if (typeof result === "string") {
        const lower = result.toLowerCase();
        if (lower === "new" || lower === "known") return lower as SubmitStatus;
        return "rejected";
    }

    if (typeof result === "object") {
        const obj = result as Record<string, unknown>;
        if (typeof obj.status === "string") {
            return extractSubmitStatus(obj.status);
        }
    }

    return "rejected";
}

/** Safely cast an unknown RPC result to a string array. */
function asStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === "string");
    }
    return [];
}

/**
 * Create a statement store transport.
 *
 * Strategy (Host API first):
 * 1. Try chain-client's bulletin chain connection — this uses product-sdk's
 *    `createPapiProvider` which routes through the Host API when inside a container,
 *    falling back to direct RPC outside.
 * 2. If chain-client is unavailable (not initialized, not installed), fall back
 *    to a direct WebSocket connection using the provided `endpoint`.
 * 3. If neither works, throw {@link StatementConnectionError}.
 *
 * @param config - Configuration with an optional fallback `endpoint`.
 * @returns A configured {@link StatementTransport}.
 * @throws {StatementConnectionError} If no connection method is available.
 */
export async function createTransport(config: {
    endpoint?: string;
}): Promise<StatementTransport> {
    // Always try chain-client first (routes through Host API in containers)
    try {
        return await createChainClientTransport();
    } catch (chainClientError) {
        log.debug("Chain-client transport unavailable, trying direct endpoint", {
            error:
                chainClientError instanceof Error
                    ? chainClientError.message
                    : String(chainClientError),
        });
    }

    // Fall back to direct WebSocket if endpoint is provided
    if (config.endpoint) {
        return createDirectTransport(config.endpoint);
    }

    throw new StatementConnectionError(
        "No connection method available. Either initialize chain-client " +
            "(call getChainAPI() first) or provide an explicit endpoint.",
    );
}

/* @integration */
async function createDirectTransport(endpoint: string): Promise<RpcTransport> {
    try {
        const { getWsProvider } = await import("polkadot-api/ws-provider/web");
        const { createClient } = await import("polkadot-api");
        const provider = getWsProvider(endpoint);
        const client = createClient(provider);
        log.info("Connected to statement store via direct endpoint", { endpoint });
        return new RpcTransport(client as unknown as RpcClient, true);
    } catch (error) {
        throw new StatementConnectionError(
            `Failed to connect to ${endpoint}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error instanceof Error ? error : undefined },
        );
    }
}

/* @integration */
async function createChainClientTransport(): Promise<RpcTransport> {
    try {
        const { getClient } = await import("@polkadot-apps/chain-client");
        const { bulletin } = await import("@polkadot-apps/descriptors/bulletin");
        const client = getClient(bulletin);
        log.info("Connected to statement store via chain-client bulletin");
        return new RpcTransport(client as unknown as RpcClient, false);
    } catch (error) {
        throw new StatementConnectionError(
            `Chain-client bulletin not available: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error instanceof Error ? error : undefined },
        );
    }
}

if (import.meta.vitest) {
    const { describe, test, expect, vi, beforeEach } = import.meta.vitest;
    const { configure } = await import("@polkadot-apps/logger");

    beforeEach(() => {
        configure({ handler: () => {} });
    });

    function createMockClient() {
        const requestCalls: unknown[][] = [];
        const _requestCalls: unknown[][] = [];
        let destroyCalled = false;

        const client: RpcClient = {
            request: async (method: string, params: unknown[]) => {
                requestCalls.push([method, params]);
                return { status: "new" } as unknown;
            },
            _request: (method, params, callbacks) => {
                _requestCalls.push([method, params, callbacks]);
                return () => {};
            },
            destroy: () => {
                destroyCalled = true;
            },
        };

        return {
            client,
            requestCalls,
            _requestCalls,
            get destroyCalled() {
                return destroyCalled;
            },
            /** Replace the request handler for a specific test. */
            setRequest(fn: (method: string, params: unknown[]) => Promise<unknown>) {
                client.request = fn;
            },
            /** Replace the _request handler for a specific test. */
            set_Request(fn: RpcClient["_request"]) {
                client._request = fn;
            },
        };
    }

    describe("RpcTransport", () => {
        describe("subscribe", () => {
            test("calls statement_subscribeStatement with serialized filter", () => {
                const mock = createMockClient();
                const transport = new RpcTransport(mock.client, false);

                transport.subscribe(
                    "any",
                    () => {},
                    () => {},
                );

                expect(mock._requestCalls.length).toBe(1);
                expect(mock._requestCalls[0][0]).toBe("statement_subscribeStatement");
                expect(mock._requestCalls[0][1]).toEqual(["any"]);
            });

            test("returns unsubscribable handle", () => {
                const mock = createMockClient();
                const unsubFn = vi.fn();
                mock.set_Request(() => unsubFn);

                const transport = new RpcTransport(mock.client, false);
                const sub = transport.subscribe(
                    "any",
                    () => {},
                    () => {},
                );

                sub.unsubscribe();
                expect(unsubFn).toHaveBeenCalledOnce();
            });

            test("unsubscribe is idempotent", () => {
                const mock = createMockClient();
                const unsubFn = vi.fn();
                mock.set_Request(() => unsubFn);

                const transport = new RpcTransport(mock.client, false);
                const sub = transport.subscribe(
                    "any",
                    () => {},
                    () => {},
                );

                sub.unsubscribe();
                sub.unsubscribe();
                expect(unsubFn).toHaveBeenCalledOnce();
            });

            test("calls onError when _request throws", () => {
                const mock = createMockClient();
                mock.set_Request(() => {
                    throw new Error("not supported");
                });

                const transport = new RpcTransport(mock.client, false);
                const onError = vi.fn();

                transport.subscribe("any", () => {}, onError);
                expect(onError).toHaveBeenCalledOnce();
                expect(onError.mock.calls[0][0]).toBeInstanceOf(StatementSubscriptionError);
            });
        });

        describe("submit", () => {
            test("calls statement_submit and returns status", async () => {
                const mock = createMockClient();
                const transport = new RpcTransport(mock.client, false);

                const status = await transport.submit("0xdeadbeef");

                expect(mock.requestCalls[0][0]).toBe("statement_submit");
                expect(status).toBe("new");
            });

            test("returns 'rejected' for null response", async () => {
                const mock = createMockClient();
                mock.setRequest(async () => null);
                const transport = new RpcTransport(mock.client, false);

                expect(await transport.submit("0x")).toBe("rejected");
            });

            test("returns 'known' for known status", async () => {
                const mock = createMockClient();
                mock.setRequest(async () => ({ status: "known" }));
                const transport = new RpcTransport(mock.client, false);

                expect(await transport.submit("0x")).toBe("known");
            });

            test("returns 'rejected' for unexpected status", async () => {
                const mock = createMockClient();
                mock.setRequest(async () => "unexpected");
                const transport = new RpcTransport(mock.client, false);

                expect(await transport.submit("0x")).toBe("rejected");
            });
        });

        describe("query", () => {
            test("tries statement_broadcasts when no decryptionKey", async () => {
                const mock = createMockClient();
                mock.setRequest(async (method: string) => {
                    if (method === "statement_broadcasts") return ["0xaaa", "0xbbb"];
                    throw new Error("not supported");
                });

                const transport = new RpcTransport(mock.client, false);
                const result = await transport.query([]);

                expect(result).toEqual(["0xaaa", "0xbbb"]);
            });

            test("tries statement_posted first when decryptionKey provided", async () => {
                const mock = createMockClient();
                mock.setRequest(async (method: string) => {
                    if (method === "statement_posted") return ["0xccc"];
                    throw new Error("not supported");
                });

                const transport = new RpcTransport(mock.client, false);
                const result = await transport.query([], "0xkey");

                expect(result).toEqual(["0xccc"]);
            });

            test("falls back through methods gracefully", async () => {
                const mock = createMockClient();
                const calledMethods: string[] = [];
                mock.setRequest(async (method: string) => {
                    calledMethods.push(method);
                    if (method === "statement_dump") return ["0xfallback"];
                    throw new Error("not supported");
                });

                const transport = new RpcTransport(mock.client, false);
                const result = await transport.query([], "0xkey");

                expect(calledMethods).toEqual([
                    "statement_posted",
                    "statement_broadcasts",
                    "statement_dump",
                ]);
                expect(result).toEqual(["0xfallback"]);
            });

            test("returns empty array when all methods fail", async () => {
                const mock = createMockClient();
                mock.setRequest(async () => {
                    throw new Error("not supported");
                });

                const transport = new RpcTransport(mock.client, false);
                const result = await transport.query([]);

                expect(result).toEqual([]);
            });

            test("filters non-string elements from results", async () => {
                const mock = createMockClient();
                mock.setRequest(async () => ["0xvalid", 42, null, "0xalso"]);

                const transport = new RpcTransport(mock.client, false);
                const result = await transport.query([]);

                expect(result).toEqual(["0xvalid", "0xalso"]);
            });
        });

        describe("destroy", () => {
            test("destroys owned client", () => {
                const mock = createMockClient();
                const transport = new RpcTransport(mock.client, true);
                transport.destroy();
                expect(mock.destroyCalled).toBe(true);
            });

            test("does not destroy shared client", () => {
                const mock = createMockClient();
                const transport = new RpcTransport(mock.client, false);
                transport.destroy();
                expect(mock.destroyCalled).toBe(false);
            });
        });
    });

    describe("extractStatementEvent", () => {
        test("extracts direct format", () => {
            const event = { statements: ["0xaa", "0xbb"], remaining: 0 };
            const result = extractStatementEvent(event);
            expect(result?.statements).toEqual(["0xaa", "0xbb"]);
            expect(result?.remaining).toBe(0);
        });

        test("extracts NewStatements wrapped format", () => {
            const event = {
                NewStatements: { statements: ["0xcc"], remaining: 5 },
            };
            const result = extractStatementEvent(event);
            expect(result?.statements).toEqual(["0xcc"]);
        });

        test("extracts data-wrapped format", () => {
            const event = { data: { statements: ["0xdd"] } };
            const result = extractStatementEvent(event);
            expect(result?.statements).toEqual(["0xdd"]);
        });

        test("returns null for unrecognized format", () => {
            expect(extractStatementEvent({ foo: "bar" })).toBeNull();
            expect(extractStatementEvent(null)).toBeNull();
            expect(extractStatementEvent("string")).toBeNull();
        });
    });

    describe("extractSubmitStatus", () => {
        test("extracts 'new' from string", () => {
            expect(extractSubmitStatus("new")).toBe("new");
        });

        test("extracts 'known' from string", () => {
            expect(extractSubmitStatus("known")).toBe("known");
        });

        test("extracts from nested object", () => {
            expect(extractSubmitStatus({ status: "new" })).toBe("new");
        });

        test("returns 'rejected' for null", () => {
            expect(extractSubmitStatus(null)).toBe("rejected");
        });

        test("returns 'rejected' for unknown string", () => {
            expect(extractSubmitStatus("badvalue")).toBe("rejected");
        });
    });

    // Helper to create a mock _request that invokes callbacks immediately
    type AnyRequestCallbacks = {
        onSuccess: (
            subscriptionId: unknown,
            followSubscription: (
                id: unknown,
                handlers: { next: (event: unknown) => void; error: (e: Error) => void },
            ) => void,
        ) => void;
        onError: (error: Error) => void;
    };

    describe("RpcTransport subscription delivery", () => {
        test("delivers raw hex string events to onStatement", () => {
            const mock = createMockClient();
            const received: string[] = [];

            mock.set_Request(((
                _method: string,
                _params: unknown[],
                callbacks: AnyRequestCallbacks,
            ) => {
                callbacks.onSuccess("sub-id", (_id, handlers) => {
                    handlers.next("0xdeadbeef");
                    handlers.next("0xcafebabe");
                });
                return () => {};
            }) as RpcClient["_request"]);

            const transport = new RpcTransport(mock.client, false);
            transport.subscribe(
                "any",
                (hex) => received.push(hex),
                () => {},
            );

            expect(received).toEqual(["0xdeadbeef", "0xcafebabe"]);
        });

        test("delivers batched statement events to onStatement", () => {
            const mock = createMockClient();
            const received: string[] = [];

            mock.set_Request(((_m: string, _p: unknown[], cb: AnyRequestCallbacks) => {
                cb.onSuccess("sub-id", (_id, handlers) => {
                    handlers.next({ statements: ["0xaa", "0xbb"], remaining: 0 });
                });
                return () => {};
            }) as RpcClient["_request"]);

            const transport = new RpcTransport(mock.client, false);
            transport.subscribe(
                "any",
                (hex) => received.push(hex),
                () => {},
            );

            expect(received).toEqual(["0xaa", "0xbb"]);
        });

        test("delivers data-wrapped events to onStatement", () => {
            const mock = createMockClient();
            const received: string[] = [];

            mock.set_Request(((_m: string, _p: unknown[], cb: AnyRequestCallbacks) => {
                cb.onSuccess("sub-id", (_id, handlers) => {
                    handlers.next({ data: { statements: ["0xcc"] } });
                });
                return () => {};
            }) as RpcClient["_request"]);

            const transport = new RpcTransport(mock.client, false);
            transport.subscribe(
                "any",
                (hex) => received.push(hex),
                () => {},
            );

            expect(received).toEqual(["0xcc"]);
        });

        test("calls onError on subscription stream error", () => {
            const mock = createMockClient();
            const errors: Error[] = [];

            mock.set_Request(((_m: string, _p: unknown[], cb: AnyRequestCallbacks) => {
                cb.onSuccess("sub-id", (_id, handlers) => {
                    handlers.error(new Error("stream died"));
                });
                return () => {};
            }) as RpcClient["_request"]);

            const transport = new RpcTransport(mock.client, false);
            transport.subscribe(
                "any",
                () => {},
                (e) => errors.push(e),
            );

            expect(errors.length).toBe(1);
            expect(errors[0]).toBeInstanceOf(StatementSubscriptionError);
        });

        test("calls onError when onError callback fires", () => {
            const mock = createMockClient();
            const errors: Error[] = [];

            mock.set_Request(((_m: string, _p: unknown[], cb: AnyRequestCallbacks) => {
                cb.onError(new Error("method not found"));
                return () => {};
            }) as RpcClient["_request"]);

            const transport = new RpcTransport(mock.client, false);
            transport.subscribe(
                "any",
                () => {},
                (e) => errors.push(e),
            );

            expect(errors.length).toBe(1);
            expect(errors[0]).toBeInstanceOf(StatementSubscriptionError);
        });

        test("ignores unrecognized event formats silently", () => {
            const mock = createMockClient();
            const received: string[] = [];

            mock.set_Request(((_m: string, _p: unknown[], cb: AnyRequestCallbacks) => {
                cb.onSuccess("sub-id", (_id, handlers) => {
                    handlers.next({ unrecognized: true });
                    handlers.next(42);
                    handlers.next("0xvalid");
                });
                return () => {};
            }) as RpcClient["_request"]);

            const transport = new RpcTransport(mock.client, false);
            transport.subscribe(
                "any",
                (hex) => received.push(hex),
                () => {},
            );

            // Only the raw string event should be delivered
            expect(received).toEqual(["0xvalid"]);
        });
    });

    describe("createTransport", () => {
        test("throws StatementConnectionError when no method available", async () => {
            // No endpoint and chain-client will fail (dynamic import)
            await expect(createTransport({})).rejects.toThrow(StatementConnectionError);
        });
    });
}
