/** Base error for terminal package. */
export class QrLoginError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "QrLoginError";
    }
}

/** Login attempt exceeded the configured timeout. */
export class QrLoginTimeoutError extends QrLoginError {
    constructor(timeoutMs: number) {
        super(`QR login timed out after ${timeoutMs}ms`);
        this.name = "QrLoginTimeoutError";
    }
}

/** Login attempt was cancelled by the caller. */
export class QrLoginCancelledError extends QrLoginError {
    constructor() {
        super("QR login was cancelled");
        this.name = "QrLoginCancelledError";
    }
}

if (import.meta.vitest) {
    const { test, expect } = import.meta.vitest;

    test("QrLoginTimeoutError includes timeout value", () => {
        const err = new QrLoginTimeoutError(5000);
        expect(err.message).toContain("5000");
        expect(err.name).toBe("QrLoginTimeoutError");
        expect(err).toBeInstanceOf(QrLoginError);
    });

    test("QrLoginCancelledError has correct name", () => {
        const err = new QrLoginCancelledError();
        expect(err.name).toBe("QrLoginCancelledError");
        expect(err).toBeInstanceOf(QrLoginError);
    });
}
