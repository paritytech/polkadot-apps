import type { EventDescriptor } from "./types.js";

/**
 * Filter typed events from a raw events array.
 *
 * Thin wrapper over papi's `.filter()` that returns a typed array,
 * possibly empty.
 *
 * @internal
 */
export function filterEvents<T>(descriptor: EventDescriptor<T>, events: unknown[]): T[] {
    return descriptor.filter(events);
}

/**
 * Extract exactly one typed event, or throw if none found.
 *
 * Replaces the common pattern:
 * ```ts
 * const matches = api.event.X.filter(result.events);
 * if (matches.length === 0) throw new Error("...");
 * const first = matches[0];
 * ```
 *
 * @internal
 */
export function expectEvent<T>(descriptor: EventDescriptor<T>, events: unknown[]): T {
    const matches = descriptor.filter(events);
    if (matches.length === 0) {
        throw new Error("Expected event not found in transaction result");
    }
    return matches[0];
}

/**
 * Extract one or more typed events, or throw if none found.
 *
 * @internal
 */
export function expectEvents<T>(descriptor: EventDescriptor<T>, events: unknown[]): T[] {
    const matches = descriptor.filter(events);
    if (matches.length === 0) {
        throw new Error("Expected event not found in transaction result");
    }
    return matches;
}

// ============================================================================
// Tests
// ============================================================================

if (import.meta.vitest) {
    const { describe, test, expect } = import.meta.vitest;

    function mockDescriptor<T>(results: T[]): EventDescriptor<T> {
        return {
            watch: () => ({
                subscribe: () => ({ unsubscribe: () => {} }),
            }),
            filter: () => results,
        };
    }

    describe("filterEvents", () => {
        test("returns matching events", () => {
            const desc = mockDescriptor(["a", "b"]);
            expect(filterEvents(desc, [])).toEqual(["a", "b"]);
        });

        test("returns empty array when no matches", () => {
            const desc = mockDescriptor([]);
            expect(filterEvents(desc, [])).toEqual([]);
        });
    });

    describe("expectEvent", () => {
        test("returns first match", () => {
            const desc = mockDescriptor([{ id: 1 }, { id: 2 }]);
            expect(expectEvent(desc, [])).toEqual({ id: 1 });
        });

        test("throws when no matches", () => {
            const desc = mockDescriptor([]);
            expect(() => expectEvent(desc, [])).toThrow(
                "Expected event not found in transaction result",
            );
        });
    });

    describe("expectEvents", () => {
        test("returns all matches", () => {
            const desc = mockDescriptor(["a", "b", "c"]);
            expect(expectEvents(desc, [])).toEqual(["a", "b", "c"]);
        });

        test("throws when no matches", () => {
            const desc = mockDescriptor([]);
            expect(() => expectEvents(desc, [])).toThrow(
                "Expected event not found in transaction result",
            );
        });
    });
}
