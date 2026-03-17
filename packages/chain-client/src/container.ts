/**
 * Detect if running inside a Host container (Polkadot Browser / Polkadot Desktop).
 *
 * Uses product-sdk's sandboxProvider as primary detection.
 * Falls back to manual signal checks when product-sdk is not installed.
 */
export function isInsideContainer(): boolean {
    if (typeof window === "undefined") return false;

    // Try product-sdk first (most reliable)
    try {
        // Dynamic require so it doesn't fail at import time when sdk is absent
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const sdk = require("@novasamatech/product-sdk") as {
            sandboxProvider: { isCorrectEnvironment: () => boolean };
        };
        return sdk.sandboxProvider.isCorrectEnvironment();
    } catch {
        // product-sdk not installed — fall back to manual detection
    }

    return manualDetection();
}

function manualDetection(): boolean {
    if (typeof window === "undefined") return false;

    const win = window as unknown as Record<string, unknown>;

    // Iframe detection (polkadot.com browser)
    try {
        if (window !== window.top) return true;
    } catch {
        // Cross-origin iframe — likely inside a container
        return true;
    }

    // Webview detection (Polkadot Desktop)
    if (win.__HOST_WEBVIEW_MARK__ === true) return true;

    // Desktop message-passing API
    if (win.__HOST_API_PORT__ != null) return true;

    return false;
}

if (import.meta.vitest) {
    const { test, expect } = import.meta.vitest;

    test("returns false in Node environment (no window)", () => {
        expect(isInsideContainer()).toBe(false);
    });
}
