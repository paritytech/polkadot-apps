/**
 * Base class for all events package errors.
 *
 * Use `instanceof EventError` to catch any error originating
 * from the events package.
 */
export class EventError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "EventError";
    }
}

/**
 * The client is not connected.
 *
 * Thrown when a watch method is called before {@link EventClient.connect}.
 */
export class EventConnectionError extends EventError {
    constructor(message: string = "Not connected. Call connect() first.", options?: ErrorOptions) {
        super(message, options);
        this.name = "EventConnectionError";
    }
}

/**
 * A subscription failed and could not be recovered via retry.
 *
 * Carries the number of attempts made and the original error as `cause`.
 */
export class EventSubscriptionError extends EventError {
    /** Number of retry attempts made before giving up. */
    readonly attempts: number;

    constructor(message: string, attempts: number, options?: ErrorOptions) {
        super(`Subscription failed after ${attempts} attempt(s): ${message}`, options);
        this.name = "EventSubscriptionError";
        this.attempts = attempts;
    }
}

// ============================================================================
// Tests
// ============================================================================

if (import.meta.vitest) {
    const { describe, test, expect } = import.meta.vitest;

    describe("EventError hierarchy", () => {
        test("EventError is instanceof Error", () => {
            const err = new EventError("boom");
            expect(err).toBeInstanceOf(Error);
            expect(err).toBeInstanceOf(EventError);
            expect(err.name).toBe("EventError");
            expect(err.message).toBe("boom");
        });

        test("EventConnectionError extends EventError", () => {
            const err = new EventConnectionError();
            expect(err).toBeInstanceOf(EventError);
            expect(err).toBeInstanceOf(EventConnectionError);
            expect(err.name).toBe("EventConnectionError");
            expect(err.message).toBe("Not connected. Call connect() first.");
        });

        test("EventConnectionError accepts custom message", () => {
            const err = new EventConnectionError("custom");
            expect(err.message).toBe("custom");
        });

        test("EventSubscriptionError extends EventError", () => {
            const cause = new Error("network down");
            const err = new EventSubscriptionError("network down", 3, { cause });
            expect(err).toBeInstanceOf(EventError);
            expect(err).toBeInstanceOf(EventSubscriptionError);
            expect(err.name).toBe("EventSubscriptionError");
            expect(err.attempts).toBe(3);
            expect(err.message).toBe("Subscription failed after 3 attempt(s): network down");
            expect(err.cause).toBe(cause);
        });
    });
}
