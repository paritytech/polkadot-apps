/** Base class for all transaction errors. Use `instanceof TxError` to catch any tx-related error. */
export class TxError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "TxError";
    }
}

/** The transaction did not finalize within the configured timeout. It may still be processing on-chain. */
export class TxTimeoutError extends TxError {
    readonly timeoutMs: number;

    constructor(timeoutMs: number) {
        super(
            `Transaction timed out after ${timeoutMs / 1000}s. ` +
                "The transaction may still be processing on-chain.",
        );
        this.name = "TxTimeoutError";
        this.timeoutMs = timeoutMs;
    }
}

/** The transaction was included on-chain but the dispatch failed. */
export class TxDispatchError extends TxError {
    /** Raw dispatch error from polkadot-api. */
    readonly dispatchError: unknown;
    /** Human-readable error string (e.g., "Revive.ContractReverted"). */
    readonly formatted: string;

    constructor(dispatchError: unknown, formatted: string) {
        super(`Transaction dispatch failed: ${formatted}`);
        this.name = "TxDispatchError";
        this.dispatchError = dispatchError;
        this.formatted = formatted;
    }
}

/** The user rejected the signing request in their wallet. */
export class TxSigningRejectedError extends TxError {
    constructor() {
        super("Transaction signing was rejected.");
        this.name = "TxSigningRejectedError";
    }
}

/**
 * Extract a human-readable error from a transaction result's dispatch error.
 *
 * PAPI dispatch errors for pallet modules are nested:
 *   `{ type: "Module", value: { type: "Revive", value: { type: "ContractReverted" } } }`
 *
 * This walks the chain to build a string like `"Revive.ContractReverted"`.
 *
 * @param result - A transaction result with `ok` and optional `dispatchError`.
 * @returns A human-readable error string, or `""` if the result is ok, or `"unknown error"` if
 *   the dispatch error cannot be decoded.
 */
export function formatDispatchError(result: { ok: boolean; dispatchError?: unknown }): string {
    if (result.ok) return "";

    try {
        const err = result.dispatchError as { type?: string; value?: unknown } | undefined;
        if (!err) return "unknown error";

        if (err.type === "Module" && err.value && typeof err.value === "object") {
            const palletErr = err.value as { type?: string; value?: unknown };
            const palletName = palletErr.type ?? "Unknown";

            if (palletErr.value && typeof palletErr.value === "object") {
                const innerErr = palletErr.value as { type?: string };
                if (innerErr.type) {
                    return `${palletName}.${innerErr.type}`;
                }
            }
            return palletName;
        }

        return err.type ?? "unknown error";
    } catch {
        return "unknown error";
    }
}

/**
 * Check if an error looks like a user-rejected signing request.
 *
 * Different wallets use different error messages when the user rejects signing:
 * "Cancelled", "Rejected", "User rejected", "denied". This checks for common
 * patterns as a best-effort heuristic. Non-Error values always return false.
 *
 * @param error - The error to check.
 * @returns `true` if the error message matches a known rejection pattern.
 */
export function isSigningRejection(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const msg = error.message.toLowerCase();
    return (
        msg.includes("cancelled") ||
        msg.includes("rejected") ||
        msg.includes("denied") ||
        msg.includes("user refused")
    );
}

if (import.meta.vitest) {
    const { describe, test, expect } = import.meta.vitest;

    describe("TxError hierarchy", () => {
        test("TxTimeoutError", () => {
            const err = new TxTimeoutError(300_000);
            expect(err).toBeInstanceOf(TxError);
            expect(err).toBeInstanceOf(Error);
            expect(err.name).toBe("TxTimeoutError");
            expect(err.timeoutMs).toBe(300_000);
            expect(err.message).toContain("300s");
        });

        test("TxDispatchError", () => {
            const raw = {
                type: "Module",
                value: { type: "Balances", value: { type: "InsufficientBalance" } },
            };
            const err = new TxDispatchError(raw, "Balances.InsufficientBalance");
            expect(err).toBeInstanceOf(TxError);
            expect(err.name).toBe("TxDispatchError");
            expect(err.dispatchError).toBe(raw);
            expect(err.formatted).toBe("Balances.InsufficientBalance");
            expect(err.message).toContain("Balances.InsufficientBalance");
        });

        test("TxSigningRejectedError", () => {
            const err = new TxSigningRejectedError();
            expect(err).toBeInstanceOf(TxError);
            expect(err.name).toBe("TxSigningRejectedError");
        });
    });

    describe("formatDispatchError", () => {
        test("returns empty string for ok result", () => {
            expect(formatDispatchError({ ok: true })).toBe("");
        });

        test("walks Module.Pallet.Error chain", () => {
            const result = {
                ok: false,
                dispatchError: {
                    type: "Module",
                    value: { type: "Revive", value: { type: "ContractReverted" } },
                },
            };
            expect(formatDispatchError(result)).toBe("Revive.ContractReverted");
        });

        test("returns pallet name when inner error has no type", () => {
            const result = {
                ok: false,
                dispatchError: {
                    type: "Module",
                    value: { type: "Balances", value: {} },
                },
            };
            expect(formatDispatchError(result)).toBe("Balances");
        });

        test("returns error type for non-Module errors", () => {
            const result = {
                ok: false,
                dispatchError: { type: "BadOrigin" },
            };
            expect(formatDispatchError(result)).toBe("BadOrigin");
        });

        test("returns unknown error when dispatchError is missing", () => {
            expect(formatDispatchError({ ok: false })).toBe("unknown error");
        });

        test("returns unknown error when dispatchError has no type", () => {
            expect(formatDispatchError({ ok: false, dispatchError: {} })).toBe("unknown error");
        });
    });

    describe("isSigningRejection", () => {
        test("detects common rejection messages", () => {
            expect(isSigningRejection(new Error("Cancelled"))).toBe(true);
            expect(isSigningRejection(new Error("User rejected the request"))).toBe(true);
            expect(isSigningRejection(new Error("Transaction was rejected by user"))).toBe(true);
            expect(isSigningRejection(new Error("User denied"))).toBe(true);
            expect(isSigningRejection(new Error("Signing was denied by user"))).toBe(true);
            expect(isSigningRejection(new Error("User refused to sign"))).toBe(true);
        });

        test("returns false for non-rejection errors", () => {
            expect(isSigningRejection(new Error("Network timeout"))).toBe(false);
            expect(isSigningRejection(new Error("Insufficient balance"))).toBe(false);
        });

        test("returns false for non-Error values", () => {
            expect(isSigningRejection("cancelled")).toBe(false);
            expect(isSigningRejection(null)).toBe(false);
        });
    });
}
