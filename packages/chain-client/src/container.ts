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
    const { test, expect, vi } = import.meta.vitest;

    test("returns false in Node environment (no window)", async () => {
        expect(await isInsideContainer()).toBe(false);
    });

    test("manualDetection returns true for __HOST_WEBVIEW_MARK__", async () => {
        const fakeWindow = {
            top: null,
            __HOST_WEBVIEW_MARK__: true,
        };
        vi.stubGlobal("window", fakeWindow);
        // product-sdk import will fail, falling through to manualDetection
        const result = await isInsideContainer();
        expect(result).toBe(true);
        vi.unstubAllGlobals();
    });

    test("manualDetection returns true for __HOST_API_PORT__", async () => {
        const fakeWindow = {
            top: null,
            __HOST_API_PORT__: 12345,
        };
        vi.stubGlobal("window", fakeWindow);
        const result = await isInsideContainer();
        expect(result).toBe(true);
        vi.unstubAllGlobals();
    });

    test("manualDetection returns false when no signals present", async () => {
        const fakeWindow = { top: null };
        // Make window === window.top to skip iframe detection
        Object.defineProperty(fakeWindow, "top", { get: () => fakeWindow });
        vi.stubGlobal("window", fakeWindow);
        const result = await isInsideContainer();
        expect(result).toBe(false);
        vi.unstubAllGlobals();
    });
}
