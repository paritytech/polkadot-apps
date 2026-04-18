import { createLogger } from "@polkadot-apps/logger";

import { EventSubscriptionError } from "./errors.js";
import type { EventDescriptor, EventOccurrence, Unsubscribable, WatchOptions } from "./types.js";

const log = createLogger("events");

const DEFAULT_RETRY_DELAY_MS = 2000;
const DEFAULT_MAX_RETRIES = 5;

/**
 * Subscribe to a papi event descriptor with automatic resubscription
 * on transient errors (e.g. `BlockNotPinnedError`).
 *
 * The consecutive error counter resets on any successful event delivery,
 * so intermittent hiccups don't accumulate toward the retry limit.
 *
 * @internal — used by {@link EventClient}, not part of public API.
 */
export function resilientSubscribe<T>(
    descriptor: EventDescriptor<T>,
    callback: (event: EventOccurrence<T>) => void,
    options?: WatchOptions & { filter?: (payload: T) => boolean },
): Unsubscribable {
    const retryDelay = options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;

    let stopped = false;
    let currentSub: { unsubscribe: () => void } | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let consecutiveErrors = 0;

    function subscribe() {
        if (stopped) return;

        const observable = options?.filter ? descriptor.watch(options.filter) : descriptor.watch();

        currentSub = observable.subscribe({
            next: (event: EventOccurrence<T>) => {
                consecutiveErrors = 0;
                callback(event);
            },
            error: (error: Error) => {
                consecutiveErrors++;
                log.warn(`Subscription error (attempt ${consecutiveErrors}): ${error.message}`);

                if (maxRetries > 0 && consecutiveErrors >= maxRetries) {
                    stopped = true;
                    const fatal = new EventSubscriptionError(error.message, consecutiveErrors, {
                        cause: error,
                    });
                    options?.onFatalError?.(fatal);
                    return;
                }

                options?.onRetry?.(error, consecutiveErrors);
                retryTimeout = setTimeout(subscribe, retryDelay);
            },
        });
    }

    subscribe();

    return {
        unsubscribe() {
            stopped = true;
            if (retryTimeout) clearTimeout(retryTimeout);
            currentSub?.unsubscribe();
        },
    };
}

// ============================================================================
// Tests
// ============================================================================

if (import.meta.vitest) {
    const { describe, test, expect, vi, beforeEach, afterEach } = import.meta.vitest;

    /** Create a mock EventDescriptor where the test controls next/error delivery. */
    function createMockDescriptor<T>() {
        let handlers: {
            next: (event: EventOccurrence<T>) => void;
            error: (error: Error) => void;
        } | null = null;
        const unsubscribeFn = vi.fn();
        let filterFn: ((value: T) => boolean) | undefined;

        const descriptor: EventDescriptor<T> = {
            watch: (filter) => {
                filterFn = filter;
                return {
                    subscribe: (h) => {
                        handlers = h;
                        return { unsubscribe: unsubscribeFn };
                    },
                };
            },
            filter: () => [],
        };

        return {
            descriptor,
            emit: (payload: T, block = { hash: "0x00", number: 1 }) => {
                handlers?.next({
                    payload,
                    meta: { phase: { type: "ApplyExtrinsic", value: 0 }, block },
                });
            },
            emitError: (error: Error) => handlers?.error(error),
            unsubscribeFn,
            getFilter: () => filterFn,
            isSubscribed: () => handlers !== null,
        };
    }

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe("resilientSubscribe", () => {
        test("calls callback on event delivery", () => {
            const mock = createMockDescriptor<string>();
            const callback = vi.fn();

            resilientSubscribe(mock.descriptor, callback);
            mock.emit("hello");

            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback.mock.calls[0][0].payload).toBe("hello");
        });

        test("passes filter to descriptor.watch()", () => {
            const mock = createMockDescriptor<number>();
            const filter = (n: number) => n > 10;

            resilientSubscribe(mock.descriptor, vi.fn(), { filter });

            expect(mock.getFilter()).toBe(filter);
        });

        test("resubscribes on error after delay", () => {
            const mock = createMockDescriptor<string>();
            const onRetry = vi.fn();

            resilientSubscribe(mock.descriptor, vi.fn(), {
                retryDelayMs: 1000,
                onRetry,
            });

            mock.emitError(new Error("transient"));
            expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);

            // Not yet resubscribed
            expect(mock.isSubscribed()).toBe(true);

            // After delay, resubscribes
            vi.advanceTimersByTime(1000);
            expect(mock.isSubscribed()).toBe(true);
        });

        test("calls onFatalError after maxRetries", () => {
            const mock = createMockDescriptor<string>();
            const onFatalError = vi.fn();

            resilientSubscribe(mock.descriptor, vi.fn(), {
                maxRetries: 2,
                retryDelayMs: 100,
                onFatalError,
            });

            // First error → retry
            mock.emitError(new Error("fail1"));
            vi.advanceTimersByTime(100);

            // Second error → fatal
            mock.emitError(new Error("fail2"));
            expect(onFatalError).toHaveBeenCalledTimes(1);
            expect(onFatalError.mock.calls[0][0]).toBeInstanceOf(EventSubscriptionError);
            expect(onFatalError.mock.calls[0][0].attempts).toBe(2);
        });

        test("resets consecutive error count on successful event", () => {
            const mock = createMockDescriptor<string>();
            const onFatalError = vi.fn();

            resilientSubscribe(mock.descriptor, vi.fn(), {
                maxRetries: 3,
                retryDelayMs: 100,
                onFatalError,
            });

            // Two errors
            mock.emitError(new Error("e1"));
            vi.advanceTimersByTime(100);
            mock.emitError(new Error("e2"));
            vi.advanceTimersByTime(100);

            // Success resets counter
            mock.emit("ok");

            // Two more errors should not trigger fatal (counter was reset)
            mock.emitError(new Error("e3"));
            vi.advanceTimersByTime(100);
            mock.emitError(new Error("e4"));
            vi.advanceTimersByTime(100);

            expect(onFatalError).not.toHaveBeenCalled();
        });

        test("unsubscribe stops retries", () => {
            const mock = createMockDescriptor<string>();
            const onRetry = vi.fn();

            const sub = resilientSubscribe(mock.descriptor, vi.fn(), {
                retryDelayMs: 1000,
                onRetry,
            });

            mock.emitError(new Error("err"));
            sub.unsubscribe();

            // Advancing time should not trigger another subscribe
            vi.advanceTimersByTime(2000);
            expect(onRetry).toHaveBeenCalledTimes(1);
        });

        test("unsubscribe calls underlying unsubscribe", () => {
            const mock = createMockDescriptor<string>();
            const sub = resilientSubscribe(mock.descriptor, vi.fn());

            sub.unsubscribe();
            expect(mock.unsubscribeFn).toHaveBeenCalledTimes(1);
        });

        test("unlimited retries when maxRetries is 0", () => {
            const mock = createMockDescriptor<string>();
            const onRetry = vi.fn();
            const onFatalError = vi.fn();

            resilientSubscribe(mock.descriptor, vi.fn(), {
                maxRetries: 0,
                retryDelayMs: 100,
                onRetry,
                onFatalError,
            });

            for (let i = 0; i < 20; i++) {
                mock.emitError(new Error(`e${i}`));
                vi.advanceTimersByTime(100);
            }

            expect(onRetry).toHaveBeenCalledTimes(20);
            expect(onFatalError).not.toHaveBeenCalled();
        });
    });
}
