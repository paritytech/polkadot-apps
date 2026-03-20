import type { ProviderType } from "./types.js";

/** All possible signer errors as a discriminated union. */
export type SignerError =
    | { type: "HOST_UNAVAILABLE"; message: string }
    | { type: "HOST_REJECTED"; message: string }
    | { type: "HOST_DISCONNECTED"; message: string }
    | { type: "EXTENSION_NOT_FOUND"; extensionName: string; message: string }
    | { type: "EXTENSION_REJECTED"; extensionName: string; message: string }
    | { type: "SIGNING_FAILED"; cause: unknown; message: string }
    | { type: "NO_ACCOUNTS"; provider: ProviderType; message: string }
    | { type: "TIMEOUT"; operation: string; ms: number; message: string }
    | { type: "ACCOUNT_NOT_FOUND"; address: string; message: string }
    | { type: "DESTROYED"; message: string };

// ── Factory functions ────────────────────────────────────────────────

export function hostUnavailable(message = "Host API is not available"): SignerError {
    return { type: "HOST_UNAVAILABLE", message };
}

export function hostRejected(message = "Host rejected the request"): SignerError {
    return { type: "HOST_REJECTED", message };
}

export function hostDisconnected(message = "Host connection lost"): SignerError {
    return { type: "HOST_DISCONNECTED", message };
}

export function extensionNotFound(extensionName: string, message?: string): SignerError {
    return {
        type: "EXTENSION_NOT_FOUND",
        extensionName,
        message: message ?? `Browser extension "${extensionName}" not found`,
    };
}

export function extensionRejected(extensionName: string, message?: string): SignerError {
    return {
        type: "EXTENSION_REJECTED",
        extensionName,
        message: message ?? `Browser extension "${extensionName}" rejected the request`,
    };
}

export function signingFailed(cause: unknown, message?: string): SignerError {
    return {
        type: "SIGNING_FAILED",
        cause,
        message:
            message ?? `Signing failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
}

export function noAccounts(provider: ProviderType, message?: string): SignerError {
    return {
        type: "NO_ACCOUNTS",
        provider,
        message: message ?? `No accounts available from ${provider} provider`,
    };
}

export function timeout(operation: string, ms: number): SignerError {
    return {
        type: "TIMEOUT",
        operation,
        ms,
        message: `Operation "${operation}" timed out after ${ms}ms`,
    };
}

export function accountNotFound(address: string): SignerError {
    return {
        type: "ACCOUNT_NOT_FOUND",
        address,
        message: `Account not found: ${address}`,
    };
}

export function destroyed(): SignerError {
    return {
        type: "DESTROYED",
        message: "SignerManager has been destroyed",
    };
}

// ── Type guards ──────────────────────────────────────────────────────

export function isHostError(
    e: SignerError,
): e is Extract<SignerError, { type: "HOST_UNAVAILABLE" | "HOST_REJECTED" | "HOST_DISCONNECTED" }> {
    return (
        e.type === "HOST_UNAVAILABLE" ||
        e.type === "HOST_REJECTED" ||
        e.type === "HOST_DISCONNECTED"
    );
}

export function isExtensionError(
    e: SignerError,
): e is Extract<SignerError, { type: "EXTENSION_NOT_FOUND" | "EXTENSION_REJECTED" }> {
    return e.type === "EXTENSION_NOT_FOUND" || e.type === "EXTENSION_REJECTED";
}

/* v8 ignore start */
if (import.meta.vitest) {
    const { test, expect, describe } = import.meta.vitest;

    describe("error factories", () => {
        test("hostUnavailable with default message", () => {
            const e = hostUnavailable();
            expect(e.type).toBe("HOST_UNAVAILABLE");
            expect(e.message).toBe("Host API is not available");
        });

        test("hostUnavailable with custom message", () => {
            const e = hostUnavailable("custom");
            expect(e.message).toBe("custom");
        });

        test("hostRejected", () => {
            const e = hostRejected();
            expect(e.type).toBe("HOST_REJECTED");
            expect(e.message).toContain("rejected");
        });

        test("hostDisconnected", () => {
            const e = hostDisconnected();
            expect(e.type).toBe("HOST_DISCONNECTED");
            expect(e.message).toContain("lost");
        });

        test("extensionNotFound with default message", () => {
            const e = extensionNotFound("talisman");
            expect(e.type).toBe("EXTENSION_NOT_FOUND");
            if (e.type === "EXTENSION_NOT_FOUND") {
                expect(e.extensionName).toBe("talisman");
            }
            expect(e.message).toContain("talisman");
        });

        test("extensionNotFound with custom message", () => {
            const e = extensionNotFound("talisman", "custom");
            expect(e.message).toBe("custom");
        });

        test("extensionRejected with default message", () => {
            const e = extensionRejected("polkadot-js");
            expect(e.type).toBe("EXTENSION_REJECTED");
            if (e.type === "EXTENSION_REJECTED") {
                expect(e.extensionName).toBe("polkadot-js");
            }
            expect(e.message).toContain("polkadot-js");
        });

        test("extensionRejected with custom message", () => {
            const e = extensionRejected("polkadot-js", "denied");
            expect(e.message).toBe("denied");
        });

        test("signingFailed with Error cause", () => {
            const cause = new Error("bad signature");
            const e = signingFailed(cause);
            expect(e.type).toBe("SIGNING_FAILED");
            if (e.type === "SIGNING_FAILED") {
                expect(e.cause).toBe(cause);
                expect(e.message).toContain("bad signature");
            }
        });

        test("signingFailed with string cause", () => {
            const e = signingFailed("oops");
            if (e.type === "SIGNING_FAILED") {
                expect(e.message).toContain("oops");
            }
        });

        test("signingFailed with custom message", () => {
            const e = signingFailed("oops", "custom msg");
            expect(e.message).toBe("custom msg");
        });

        test("noAccounts", () => {
            const e = noAccounts("host");
            expect(e.type).toBe("NO_ACCOUNTS");
            if (e.type === "NO_ACCOUNTS") {
                expect(e.provider).toBe("host");
                expect(e.message).toContain("host");
            }
        });

        test("noAccounts with custom message", () => {
            const e = noAccounts("extension", "none found");
            expect(e.message).toBe("none found");
        });

        test("timeout", () => {
            const e = timeout("connect", 5000);
            expect(e.type).toBe("TIMEOUT");
            if (e.type === "TIMEOUT") {
                expect(e.operation).toBe("connect");
                expect(e.ms).toBe(5000);
                expect(e.message).toContain("5000");
            }
        });

        test("accountNotFound", () => {
            const e = accountNotFound("5GrwvaEF...");
            expect(e.type).toBe("ACCOUNT_NOT_FOUND");
            if (e.type === "ACCOUNT_NOT_FOUND") {
                expect(e.address).toBe("5GrwvaEF...");
            }
        });

        test("destroyed", () => {
            const e = destroyed();
            expect(e.type).toBe("DESTROYED");
            expect(e.message).toContain("destroyed");
        });
    });

    describe("type guards", () => {
        test("isHostError returns true for HOST_ errors", () => {
            expect(isHostError(hostUnavailable())).toBe(true);
            expect(isHostError(hostRejected())).toBe(true);
            expect(isHostError(hostDisconnected())).toBe(true);
        });

        test("isHostError returns false for non-host errors", () => {
            expect(isHostError(extensionNotFound("x"))).toBe(false);
            expect(isHostError(extensionRejected("x"))).toBe(false);
            expect(isHostError(signingFailed("x"))).toBe(false);
            expect(isHostError(noAccounts("dev"))).toBe(false);
            expect(isHostError(timeout("op", 100))).toBe(false);
            expect(isHostError(accountNotFound("x"))).toBe(false);
            expect(isHostError(destroyed())).toBe(false);
        });

        test("isExtensionError returns true for EXTENSION_ errors", () => {
            expect(isExtensionError(extensionNotFound("x"))).toBe(true);
            expect(isExtensionError(extensionRejected("x"))).toBe(true);
        });

        test("isExtensionError returns false for non-extension errors", () => {
            expect(isExtensionError(hostUnavailable())).toBe(false);
            expect(isExtensionError(hostRejected())).toBe(false);
            expect(isExtensionError(signingFailed("x"))).toBe(false);
            expect(isExtensionError(noAccounts("dev"))).toBe(false);
            expect(isExtensionError(timeout("op", 100))).toBe(false);
            expect(isExtensionError(accountNotFound("x"))).toBe(false);
            expect(isExtensionError(destroyed())).toBe(false);
        });
    });
}
