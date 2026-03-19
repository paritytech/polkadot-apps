/**
 * Detect if running inside a Host container (Polkadot Browser / Polkadot Desktop).
 *
 * Uses product-sdk's sandboxProvider as primary detection.
 * Falls back to manual signal checks when product-sdk is not installed.
 */
export async function isInsideContainer(): Promise<boolean> {
    if (typeof window === "undefined") return false;

    try {
        const sdk = await import("@novasamatech/product-sdk");
        return sdk.sandboxProvider.isCorrectEnvironment();
    } catch {
        return manualDetection();
    }
}

function manualDetection(): boolean {
    if (typeof window === "undefined") return false;

    const win = window;

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

    test("returns false in Node environment (no window)", async () => {
        expect(await isInsideContainer()).toBe(false);
    });
}
