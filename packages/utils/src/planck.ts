import { createLogger } from "@polkadot-apps/logger";

const log = createLogger("utils");

const MAX_REASONABLE_DECIMALS = 30;

/**
 * Validate that `decimals` is a non-negative integer.
 *
 * @param decimals - The token decimal count to validate.
 * @throws {RangeError} If `decimals` is negative, fractional, or not a safe integer.
 */
function validateDecimals(decimals: number): void {
    if (!Number.isInteger(decimals) || decimals < 0) {
        throw new RangeError(`decimals must be a non-negative integer, got ${decimals}`);
    }
    if (decimals > MAX_REASONABLE_DECIMALS) {
        log.warn("Unusually large decimals value — possible bug", { decimals });
    }
}

/**
 * Convert a planck (smallest indivisible token unit) value to a human-readable decimal string.
 *
 * Substrate chains store all token amounts as integer planck values. This function
 * converts them to human-readable form (e.g. `10_000_000_000n` → `"1.0"` for DOT
 * with 10 decimals). Trailing zeros are trimmed but at least one fractional digit
 * is always shown.
 *
 * @param planck - The raw planck value as a bigint. Must be non-negative.
 * @param decimals - Number of decimal places for the token (default: 10 for DOT).
 * @returns A decimal string representation (e.g. `"1.5"`, `"0.0001"`).
 * @throws {RangeError} If `planck` is negative or `decimals` is invalid.
 *
 * @example
 * ```ts
 * import { formatPlanck } from "@polkadot-apps/utils";
 *
 * formatPlanck(10_000_000_000n);       // "1.0"       (10 decimals, DOT default)
 * formatPlanck(15_000_000_000n);       // "1.5"
 * formatPlanck(1_000_000_000_000n, 12); // "1.0"      (12 decimals, e.g. Polkadot relay)
 * formatPlanck(0n);                     // "0.0"
 * ```
 */
export function formatPlanck(planck: bigint, decimals: number = 10): string {
    validateDecimals(decimals);

    if (planck < 0n) {
        throw new RangeError(`planck must be non-negative, got ${planck}`);
    }

    if (decimals === 0) {
        return `${planck}.0`;
    }

    const divisor = 10n ** BigInt(decimals);
    const whole = planck / divisor;
    const remainder = planck % divisor;
    const fractionStr = remainder.toString().padStart(decimals, "0");

    // Trim trailing zeros but keep at least 1 fractional digit
    const trimmed = fractionStr.replace(/0+$/, "") || "0";

    return `${whole}.${trimmed}`;
}

/**
 * Parse a human-readable decimal token amount into its planck (smallest unit) representation.
 *
 * Converts a string like `"1.5"` into the corresponding bigint planck value
 * (e.g. `15_000_000_000n` for 10 decimals). If the input has more fractional
 * digits than `decimals`, excess digits are silently truncated with a warning log.
 *
 * @param amount - A non-negative decimal string (e.g. `"1.5"`, `"100"`, `"0.001"`).
 * @param decimals - Number of decimal places for the token (default: 10 for DOT).
 * @returns The planck value as a bigint.
 * @throws {Error} If `amount` is empty, negative, or contains invalid characters.
 * @throws {RangeError} If `decimals` is invalid.
 *
 * @example
 * ```ts
 * import { parseToPlanck } from "@polkadot-apps/utils";
 *
 * parseToPlanck("1.5");        // 15_000_000_000n   (10 decimals, DOT default)
 * parseToPlanck("100");        // 1_000_000_000_000n
 * parseToPlanck("0.001", 12);  // 1_000_000_000n    (12 decimals)
 * ```
 */
export function parseToPlanck(amount: string, decimals: number = 10): bigint {
    validateDecimals(decimals);

    if (amount === "") {
        throw new Error("amount must not be empty");
    }

    if (amount.startsWith("-")) {
        throw new RangeError(`amount must be non-negative, got "${amount}"`);
    }

    // Validate characters: only digits and at most one dot
    if (!/^\d+\.?\d*$/.test(amount)) {
        throw new Error(`amount contains invalid characters: "${amount}"`);
    }

    const parts = amount.split(".");
    const wholePart = parts[0]!;
    let fractionPart = parts[1] ?? "";

    if (fractionPart.length > decimals) {
        log.warn("Fractional digits exceed token decimals — truncating", {
            amount,
            decimals,
            excessDigits: fractionPart.length - decimals,
        });
        fractionPart = fractionPart.slice(0, decimals);
    }

    const paddedFraction = fractionPart.padEnd(decimals, "0");
    const whole = BigInt(wholePart) * 10n ** BigInt(decimals);
    const fraction = decimals > 0 ? BigInt(paddedFraction) : 0n;

    return whole + fraction;
}

if (import.meta.vitest) {
    const { describe, test, expect } = import.meta.vitest;

    describe("formatPlanck", () => {
        test("formats 1 DOT with default 10 decimals", () => {
            expect(formatPlanck(10_000_000_000n)).toBe("1.0");
        });

        test("formats fractional amounts", () => {
            expect(formatPlanck(15_000_000_000n)).toBe("1.5");
            expect(formatPlanck(12_345_678_900n)).toBe("1.23456789");
        });

        test("formats zero", () => {
            expect(formatPlanck(0n)).toBe("0.0");
        });

        test("formats sub-unit amounts", () => {
            expect(formatPlanck(1n)).toBe("0.0000000001");
            expect(formatPlanck(100n)).toBe("0.00000001");
        });

        test("formats large amounts", () => {
            expect(formatPlanck(1_000_000_000_000_000n)).toBe("100000.0");
        });

        test("trims trailing zeros but keeps at least one", () => {
            expect(formatPlanck(20_000_000_000n)).toBe("2.0");
            expect(formatPlanck(10_100_000_000n)).toBe("1.01");
        });

        test("handles custom decimals", () => {
            expect(formatPlanck(1_000_000_000_000n, 12)).toBe("1.0");
            expect(formatPlanck(1_500_000n, 6)).toBe("1.5");
        });

        test("handles zero decimals", () => {
            expect(formatPlanck(42n, 0)).toBe("42.0");
        });

        test("throws on negative planck", () => {
            expect(() => formatPlanck(-1n)).toThrow(RangeError);
        });

        test("throws on invalid decimals", () => {
            expect(() => formatPlanck(0n, -1)).toThrow(RangeError);
            expect(() => formatPlanck(0n, 1.5)).toThrow(RangeError);
        });
    });

    describe("parseToPlanck", () => {
        test("parses whole number", () => {
            expect(parseToPlanck("1")).toBe(10_000_000_000n);
        });

        test("parses fractional amount", () => {
            expect(parseToPlanck("1.5")).toBe(15_000_000_000n);
        });

        test("parses zero", () => {
            expect(parseToPlanck("0")).toBe(0n);
            expect(parseToPlanck("0.0")).toBe(0n);
        });

        test("parses small fractions", () => {
            expect(parseToPlanck("0.0000000001")).toBe(1n);
        });

        test("handles custom decimals", () => {
            expect(parseToPlanck("1.0", 12)).toBe(1_000_000_000_000n);
            expect(parseToPlanck("1.5", 6)).toBe(1_500_000n);
        });

        test("handles zero decimals", () => {
            expect(parseToPlanck("42", 0)).toBe(42n);
        });

        test("truncates excess fractional digits", () => {
            // 10 decimals, input has 12 fractional digits → truncate last 2
            expect(parseToPlanck("1.123456789012")).toBe(11_234_567_890n);
        });

        test("pads short fractional parts", () => {
            expect(parseToPlanck("1.5")).toBe(15_000_000_000n);
        });

        test("throws on empty string", () => {
            expect(() => parseToPlanck("")).toThrow("must not be empty");
        });

        test("throws on negative amount", () => {
            expect(() => parseToPlanck("-1")).toThrow(RangeError);
        });

        test("throws on invalid characters", () => {
            expect(() => parseToPlanck("abc")).toThrow("invalid characters");
            expect(() => parseToPlanck("1.2.3")).toThrow("invalid characters");
            expect(() => parseToPlanck("1e10")).toThrow("invalid characters");
        });

        test("throws on invalid decimals", () => {
            expect(() => parseToPlanck("1", -1)).toThrow(RangeError);
        });

        test("round-trips with formatPlanck", () => {
            const original = 12_345_678_901n;
            const formatted = formatPlanck(original);
            expect(parseToPlanck(formatted)).toBe(original);
        });
    });
}
