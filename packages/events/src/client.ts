import { createLogger } from "@polkadot-apps/logger";

import { EventConnectionError } from "./errors.js";
import { resilientSubscribe } from "./watch.js";
import type { Environment } from "@polkadot-apps/chain-client";
import type {
    EventClientConfig,
    EventOccurrence,
    RawContractEvent,
    Unsubscribable,
    WatchOptions,
} from "./types.js";

const log = createLogger("events");

/** @internal Result of resolving a chain environment. */
interface ResolvedChain {
    api: any;
    /** Unsafe API for asset hub — needed for best-block subscriptions (typed API rejects
     *  `watchValue("best")` when runtime metadata is incompatible with codegen'd descriptors).
     *
     *  TODO: This could be avoided if chain-client exposed `getUnsafeApi()` on its
     *  typed API objects (e.g. `api.assetHub.getUnsafeApi()`), or returned raw
     *  PolkadotClients alongside typed APIs so callers don't need to call
     *  `getClient(descriptor)` themselves. */
    unsafeAssetHubApi: any;
}

/** @internal Resolver function that returns the chain API for a given environment. */
type ApiResolver = (env: Environment) => Promise<ResolvedChain>;

/** Default resolver uses chain-client's getChainAPI + getClient for the unsafe API. */
async function defaultResolver(env: Environment): Promise<ResolvedChain> {
    const { getChainAPI, getClient } = await import("@polkadot-apps/chain-client");
    const [{ paseo_asset_hub }, { polkadot_asset_hub }, { kusama_asset_hub }] = await Promise.all([
        import("@polkadot-apps/descriptors/paseo-asset-hub"),
        import("@polkadot-apps/descriptors/polkadot-asset-hub"),
        import("@polkadot-apps/descriptors/kusama-asset-hub"),
    ]);
    const descriptorMap: Record<string, any> = {
        paseo: paseo_asset_hub,
        polkadot: polkadot_asset_hub,
        kusama: kusama_asset_hub,
    };
    const api = await getChainAPI(env);
    const descriptor = descriptorMap[env];
    const unsafeAssetHubApi = descriptor ? getClient(descriptor).getUnsafeApi() : null;
    return { api, unsafeAssetHubApi };
}

/**
 * High-level client for watching blockchain events.
 *
 * Provides resilient contract event subscriptions with automatic
 * resubscription on transient errors and typed decoding via Ink SDK.
 *
 * @example
 * ```ts
 * import { EventClient } from "@polkadot-apps/events";
 * import { dam } from "./contracts.js";
 *
 * const client = new EventClient();
 * await client.connect();
 *
 * client.watchContractEvent(dam, contractAddress, (event) => {
 *     console.log(event.type, event.value);
 * });
 *
 * client.destroy();
 * ```
 */
export class EventClient {
    private readonly env: Environment;
    private readonly resolve: ApiResolver;

    /** Resolved chain API from chain-client. */
    private api: any = null;
    /** Unsafe API for asset hub best-block queries. */
    private unsafeAssetHubApi: any = null;

    /** Active subscriptions, torn down on destroy(). */
    private subscriptions = new Set<Unsubscribable>();

    private connected = false;
    private destroyed = false;
    private connectPromise: Promise<void> | null = null;

    constructor(config?: EventClientConfig & { _resolve?: ApiResolver }) {
        this.env = config?.env ?? "paseo";
        this.resolve = config?._resolve ?? defaultResolver;
    }

    /**
     * Connect to chains via chain-client.
     *
     * Resolves the typed chain API and Ink SDK contract factory.
     * Must be called before any watch method.
     *
     * @throws {EventConnectionError} If chain-client is not initialized.
     */
    async connect(): Promise<void> {
        if (this.connected) {
            log.warn("Already connected, ignoring duplicate connect()");
            return;
        }
        if (this.connectPromise) {
            return this.connectPromise;
        }
        this.connectPromise = this.doConnect().finally(() => {
            this.connectPromise = null;
        });
        return this.connectPromise;
    }

    private async doConnect(): Promise<void> {
        try {
            const { api, unsafeAssetHubApi } = await this.resolve(this.env);
            // Guard against destroy() called while awaiting
            if (this.destroyed) return;
            this.api = api;
            this.unsafeAssetHubApi = unsafeAssetHubApi;
            this.connected = true;
            log.info("Connected", { env: this.env });
        } catch (error) {
            throw new EventConnectionError(
                `Failed to connect to chain-client: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /**
     * Watch raw `Revive.ContractEmitted` events for a contract address.
     *
     * Unlike {@link watchContractEvent}, this does **not** decode events via
     * the Ink SDK — the callback receives the raw papi `ContractEmitted`
     * payload (with `.contract`, `.data`, `.topics`). Useful when you have
     * your own ABI decoding (e.g. CDM contracts) or just need the raw bytes.
     *
     * @param address - Hex address of the deployed contract.
     * @param callback - Called for each raw ContractEmitted event.
     * @param options - Retry, error handling, and block mode options.
     * @returns A handle to stop watching.
     * @throws {EventConnectionError} If not connected.
     */
    watchRawContractEvent(
        address: string,
        callback: (event: RawContractEvent, meta: EventOccurrence["meta"]) => void,
        options?: WatchOptions,
    ): Unsubscribable {
        this.assertConnected();

        const mode = options?.mode ?? "finalized";
        const normalizedAddress = address.toLowerCase();

        const sub =
            mode === "best"
                ? this.watchAtBest(normalizedAddress, callback, options)
                : this.watchFinalized(normalizedAddress, callback, options);

        this.trackSubscription(sub);
        return sub;
    }

    /**
     * Watch a smart contract's typed events.
     *
     * Internally watches `Revive.ContractEmitted` filtered by the contract
     * address, then decodes each raw event into typed contract events using
     * the Ink SDK.
     *
     * By default watches **finalized** blocks. Pass `{ mode: "best" }` for
     * lower-latency delivery from best (unfinalized) blocks — useful for
     * UI updates where reorg risk is acceptable.
     *
     * @param contractDescriptors - Ink contract descriptors (from codegen).
     * @param address - Hex address of the deployed contract.
     * @param callback - Called for each decoded contract event.
     * @param options - Retry, error handling, and block mode options.
     * @returns A handle to stop watching.
     * @throws {EventConnectionError} If not connected.
     */
    watchContractEvent<D extends { __types: { event: any } }>(
        contractDescriptors: D,
        address: string,
        callback: (event: D["__types"]["event"], meta: EventOccurrence["meta"]) => void,
        options?: WatchOptions,
    ): Unsubscribable {
        this.assertConnected();

        const mode = options?.mode ?? "finalized";

        const contract = this.api.contracts.getContract(contractDescriptors, address);
        const normalizedAddress = address.toLowerCase();

        const decode = (rawEvent: any, meta: EventOccurrence["meta"]) => {
            try {
                const decoded = contract.filterEvents([rawEvent]);
                for (const evt of decoded) {
                    callback(evt, meta);
                }
            } catch (decodeError) {
                log.warn(
                    `Failed to decode contract event: ${decodeError instanceof Error ? decodeError.message : String(decodeError)}`,
                );
            }
        };

        const sub =
            mode === "best"
                ? this.watchAtBest(normalizedAddress, decode, options)
                : this.watchFinalized(normalizedAddress, decode, options);

        this.trackSubscription(sub);
        return sub;
    }

    /**
     * Watch via papi's event descriptor `.watch()` (finalized blocks).
     */
    private watchFinalized(
        normalizedAddress: string,
        decode: (rawEvent: any, meta: EventOccurrence["meta"]) => void,
        options?: WatchOptions,
    ): Unsubscribable {
        return resilientSubscribe(
            this.api.assetHub.event.Revive.ContractEmitted,
            (occurrence) => decode(occurrence.payload, occurrence.meta),
            {
                ...options,
                filter: (payload: any) =>
                    payload.contract.asHex().toLowerCase() === normalizedAddress,
            },
        );
    }

    /**
     * Watch `System.Events` storage at best blocks, filtering for
     * `Revive.ContractEmitted` from the target address.
     *
     * papi's `.watch()` is hardcoded to finalized blocks, adding 12-18s
     * of latency. This bypasses that by using the unsafe API's
     * `watchValue("best")` on storage.
     */
    private watchAtBest(
        normalizedAddress: string,
        decode: (rawEvent: any, meta: EventOccurrence["meta"]) => void,
        options?: WatchOptions,
    ): Unsubscribable {
        const assetHub = this.api.assetHub;
        const unsafeApi = this.unsafeAssetHubApi;
        const eventFilter = assetHub.event.Revive.ContractEmitted;

        if (!unsafeApi) {
            log.warn("Unsafe API not available — falling back to finalized mode");
            return this.watchFinalized(normalizedAddress, decode, options);
        }

        let subscription: { unsubscribe: () => void } | null = null;
        let stopped = false;
        let retryTimeout: ReturnType<typeof setTimeout> | null = null;
        let consecutiveErrors = 0;

        const retryDelay = options?.retryDelayMs ?? 2000;
        const maxRetries = options?.maxRetries ?? 5;

        const subscribe = () => {
            if (stopped) return;

            try {
                const events$ = unsafeApi.query.System.Events.watchValue("best");
                subscription = events$.subscribe({
                    next: (systemEvents: any[]) => {
                        consecutiveErrors = 0;
                        const matched = eventFilter.filter(systemEvents.map((e: any) => e.event));
                        for (const raw of matched) {
                            if (raw.contract.asHex().toLowerCase() !== normalizedAddress) continue;
                            decode(raw, {
                                phase: { type: "ApplyExtrinsic" },
                                block: { hash: "", number: 0 },
                            });
                        }
                    },
                    error: (error: Error) => {
                        consecutiveErrors++;
                        log.warn(
                            `Best-block subscription error (attempt ${consecutiveErrors}): ${error.message}`,
                        );

                        if (maxRetries > 0 && consecutiveErrors >= maxRetries) {
                            stopped = true;
                            options?.onFatalError?.(error);
                            return;
                        }

                        options?.onRetry?.(error, consecutiveErrors);
                        retryTimeout = setTimeout(subscribe, retryDelay);
                    },
                });
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                consecutiveErrors++;
                log.warn(
                    `Best-block subscribe failed (attempt ${consecutiveErrors}): ${err.message}`,
                );

                if (maxRetries > 0 && consecutiveErrors >= maxRetries) {
                    stopped = true;
                    options?.onFatalError?.(err);
                    return;
                }

                options?.onRetry?.(err, consecutiveErrors);
                retryTimeout = setTimeout(subscribe, retryDelay);
            }
        };

        subscribe();

        return {
            unsubscribe() {
                stopped = true;
                if (retryTimeout) clearTimeout(retryTimeout);
                subscription?.unsubscribe();
            },
        };
    }

    /**
     * Tear down all active subscriptions and reset state.
     */
    destroy(): void {
        for (const sub of this.subscriptions) {
            sub.unsubscribe();
        }
        this.subscriptions.clear();
        this.api = null;
        this.unsafeAssetHubApi = null;
        this.connected = false;
        this.destroyed = true;
        this.connectPromise = null;
        log.info("Destroyed");
    }

    private assertConnected(): void {
        if (!this.connected || !this.api) {
            throw new EventConnectionError();
        }
    }

    private trackSubscription(sub: Unsubscribable): Unsubscribable {
        const tracked: Unsubscribable = {
            unsubscribe: () => {
                this.subscriptions.delete(tracked);
                sub.unsubscribe();
            },
        };
        this.subscriptions.add(tracked);
        return tracked;
    }
}

// ============================================================================
// Tests
// ============================================================================

if (import.meta.vitest) {
    const { describe, test, expect, vi, beforeEach } = import.meta.vitest;

    let mockHandlers: any = null;
    let mockFilter: any = null;
    let mockBestHandlers: any = null;

    const mockContract = {
        filterEvents: vi.fn((): unknown[] => []),
    };

    const mockEventFilter = vi.fn((): any[] => []);

    const mockUnsafeAssetHubApi = {
        query: {
            System: {
                Events: {
                    watchValue: (_mode: string) => ({
                        subscribe: (handlers: any) => {
                            mockBestHandlers = handlers;
                            return { unsubscribe: vi.fn() };
                        },
                    }),
                },
            },
        },
    };

    const mockApi = {
        assetHub: {
            event: {
                Revive: {
                    ContractEmitted: {
                        watch: (filter?: (value: any) => boolean) => {
                            mockFilter = filter;
                            return {
                                subscribe: (handlers: any) => {
                                    mockHandlers = handlers;
                                    return { unsubscribe: vi.fn() };
                                },
                            };
                        },
                        filter: mockEventFilter,
                    },
                },
            },
        },
        contracts: {
            getContract: vi.fn(() => mockContract),
        },
    };

    const mockResolver = vi.fn(async () => ({
        api: mockApi,
        unsafeAssetHubApi: mockUnsafeAssetHubApi,
    }));

    function createClient() {
        return new EventClient({ _resolve: mockResolver });
    }

    beforeEach(() => {
        vi.clearAllMocks();
        mockHandlers = null;
        mockFilter = null;
        mockBestHandlers = null;
        mockContract.filterEvents.mockReturnValue([]);
        mockEventFilter.mockReturnValue([]);
    });

    describe("EventClient", () => {
        test("throws EventConnectionError before connect", () => {
            const client = createClient();
            expect(() => client.watchContractEvent({} as any, "0x1234", vi.fn())).toThrow(
                EventConnectionError,
            );
        });

        test("connect resolves chain API", async () => {
            const client = createClient();
            await client.connect();
            expect(mockResolver).toHaveBeenCalledWith("paseo");
            // Should not throw after connect
            expect(() => client.watchContractEvent({} as any, "0x1234", vi.fn())).not.toThrow(
                EventConnectionError,
            );
        });

        test("duplicate connect is ignored", async () => {
            const client = createClient();
            await client.connect();
            await client.connect();
            expect(mockResolver).toHaveBeenCalledTimes(1);
        });

        test("connect wraps resolver errors as EventConnectionError", async () => {
            const failResolver = vi.fn(async () => {
                throw new Error("no chain");
            });
            const client = new EventClient({ _resolve: failResolver });
            await expect(client.connect()).rejects.toThrow(EventConnectionError);
        });

        test("watchContractEvent creates contract and subscribes", async () => {
            const client = createClient();
            await client.connect();

            const descriptors = { __types: { event: {} } } as any;
            client.watchContractEvent(descriptors, "0xABCD", vi.fn());

            expect(mockApi.contracts.getContract).toHaveBeenCalledWith(descriptors, "0xABCD");
            expect(mockHandlers).not.toBeNull();
        });

        test("watchContractEvent filters by address (case-insensitive)", async () => {
            const client = createClient();
            await client.connect();

            client.watchContractEvent({} as any, "0xABCD", vi.fn());

            expect(mockFilter).toBeDefined();
            expect(mockFilter({ contract: { asHex: () => "0xabcd" } })).toBe(true);
            expect(mockFilter({ contract: { asHex: () => "0xABCD" } })).toBe(true);
            expect(mockFilter({ contract: { asHex: () => "0x1234" } })).toBe(false);
        });

        test("watchContractEvent decodes and calls back", async () => {
            const client = createClient();
            await client.connect();

            const callback = vi.fn();
            const decodedEvent = { type: "Transfer", value: { amount: 100n } };
            mockContract.filterEvents.mockReturnValue([decodedEvent]);

            client.watchContractEvent({} as any, "0xABCD", callback);

            mockHandlers.next({
                payload: { contract: { asHex: () => "0xabcd" }, data: "0x", topics: [] },
                meta: { phase: { type: "ApplyExtrinsic" }, block: { hash: "0x", number: 1 } },
            });

            expect(mockContract.filterEvents).toHaveBeenCalled();
            expect(callback).toHaveBeenCalledWith(decodedEvent, {
                phase: { type: "ApplyExtrinsic" },
                block: { hash: "0x", number: 1 },
            });
        });

        test("watchContractEvent survives decode errors", async () => {
            const client = createClient();
            await client.connect();

            const callback = vi.fn();
            mockContract.filterEvents.mockImplementation(() => {
                throw new Error("bad ABI");
            });

            client.watchContractEvent({} as any, "0xABCD", callback);

            // Should not throw — error is logged and swallowed
            expect(() =>
                mockHandlers.next({
                    payload: { contract: { asHex: () => "0xabcd" } },
                    meta: { phase: { type: "ApplyExtrinsic" }, block: { hash: "0x", number: 1 } },
                }),
            ).not.toThrow();
            expect(callback).not.toHaveBeenCalled();
        });

        test("destroy tears down all subscriptions", async () => {
            const client = createClient();
            await client.connect();

            client.watchContractEvent({} as any, "0x1", vi.fn());
            client.watchContractEvent({} as any, "0x2", vi.fn());

            client.destroy();

            expect(() => client.watchContractEvent({} as any, "0x3", vi.fn())).toThrow(
                EventConnectionError,
            );
        });

        test("individual unsubscribe removes from tracked set", async () => {
            const client = createClient();
            await client.connect();

            const sub = client.watchContractEvent({} as any, "0x1", vi.fn());
            sub.unsubscribe();

            // destroy should still work without errors
            client.destroy();
        });

        test("mode best subscribes via unsafe API watchValue", async () => {
            const client = createClient();
            await client.connect();

            client.watchContractEvent({} as any, "0xABCD", vi.fn(), { mode: "best" });

            // Should use best-block path, not finalized
            expect(mockHandlers).toBeNull();
            expect(mockBestHandlers).not.toBeNull();
        });

        test("mode best filters and decodes contract events", async () => {
            const client = createClient();
            await client.connect();

            const callback = vi.fn();
            const decodedEvent = { type: "Transfer", value: { amount: 50n } };
            const rawEvent = { contract: { asHex: () => "0xabcd" }, data: "0x", topics: [] };

            mockEventFilter.mockReturnValue([rawEvent]);
            mockContract.filterEvents.mockReturnValue([decodedEvent]);

            client.watchContractEvent({} as any, "0xABCD", callback, { mode: "best" });

            // Simulate system events arriving at best block
            mockBestHandlers.next([{ event: rawEvent }]);

            expect(mockEventFilter).toHaveBeenCalled();
            expect(mockContract.filterEvents).toHaveBeenCalledWith([rawEvent]);
            expect(callback).toHaveBeenCalledWith(
                decodedEvent,
                expect.objectContaining({
                    phase: { type: "ApplyExtrinsic" },
                }),
            );
        });

        test("mode best filters by address (case-insensitive)", async () => {
            const client = createClient();
            await client.connect();

            const callback = vi.fn();
            const matchEvent = { contract: { asHex: () => "0xabcd" } };
            const otherEvent = { contract: { asHex: () => "0x9999" } };

            mockEventFilter.mockReturnValue([matchEvent, otherEvent]);
            mockContract.filterEvents.mockReturnValue([]);

            client.watchContractEvent({} as any, "0xABCD", callback, { mode: "best" });

            mockBestHandlers.next([{ event: matchEvent }, { event: otherEvent }]);

            // Only the matching address should be decoded
            expect(mockContract.filterEvents).toHaveBeenCalledWith([matchEvent]);
            expect(mockContract.filterEvents).not.toHaveBeenCalledWith([otherEvent]);
        });

        test("mode best unsubscribe stops subscription", async () => {
            const client = createClient();
            await client.connect();

            const sub = client.watchContractEvent({} as any, "0x1", vi.fn(), { mode: "best" });
            sub.unsubscribe();

            client.destroy();
        });
    });

    describe("watchRawContractEvent", () => {
        test("subscribes and filters by address", async () => {
            const client = createClient();
            await client.connect();

            const callback = vi.fn();
            client.watchRawContractEvent("0xABCD", callback);

            expect(mockHandlers).not.toBeNull();
            expect(mockFilter).toBeDefined();
            expect(mockFilter({ contract: { asHex: () => "0xabcd" } })).toBe(true);
            expect(mockFilter({ contract: { asHex: () => "0x1234" } })).toBe(false);
        });

        test("passes raw event without Ink decoding", async () => {
            const client = createClient();
            await client.connect();

            const callback = vi.fn();
            client.watchRawContractEvent("0xABCD", callback);

            const rawPayload = {
                contract: { asHex: () => "0xabcd" },
                data: { asHex: () => "0xdeadbeef" },
                topics: [],
            };
            mockHandlers.next({
                payload: rawPayload,
                meta: { phase: { type: "ApplyExtrinsic" }, block: { hash: "0x01", number: 42 } },
            });

            // Should NOT use Ink SDK decoding
            expect(mockContract.filterEvents).not.toHaveBeenCalled();
            // Should receive the raw event and meta
            expect(callback).toHaveBeenCalledWith(rawPayload, {
                phase: { type: "ApplyExtrinsic" },
                block: { hash: "0x01", number: 42 },
            });
        });

        test("throws before connect", () => {
            const client = createClient();
            expect(() => client.watchRawContractEvent("0x1", vi.fn())).toThrow(
                EventConnectionError,
            );
        });

        test("works with mode best", async () => {
            const client = createClient();
            await client.connect();

            const callback = vi.fn();
            const rawEvent = {
                contract: { asHex: () => "0xabcd" },
                data: { asHex: () => "0xff" },
                topics: [],
            };

            mockEventFilter.mockReturnValue([rawEvent]);

            client.watchRawContractEvent("0xABCD", callback, { mode: "best" });

            mockBestHandlers.next([{ event: rawEvent }]);

            expect(mockContract.filterEvents).not.toHaveBeenCalled();
            expect(callback).toHaveBeenCalledWith(
                rawEvent,
                expect.objectContaining({
                    phase: { type: "ApplyExtrinsic" },
                }),
            );
        });
    });
}
