import type { HostLocalStorage } from "./types.js";

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

/**
 * Get the Host API localStorage instance when running inside a container.
 * Returns null outside a container or when product-sdk is unavailable.
 */
export async function getHostLocalStorage(): Promise<HostLocalStorage | null> {
    if (!(await isInsideContainer())) return null;

    try {
        const sdk = await import("@novasamatech/product-sdk");
        return sdk.hostLocalStorage;
    } catch {
        return null;
    }
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
        Object.defineProperty(fakeWindow, "top", { get: () => fakeWindow });
        vi.stubGlobal("window", fakeWindow);
        const result = await isInsideContainer();
        expect(result).toBe(false);
        vi.unstubAllGlobals();
    });

    test("manualDetection returns true for cross-origin iframe", async () => {
        const fakeWindow = {};
        Object.defineProperty(fakeWindow, "top", {
            get: () => {
                throw new DOMException("cross-origin");
            },
        });
        vi.stubGlobal("window", fakeWindow);
        const result = await isInsideContainer();
        expect(result).toBe(true);
        vi.unstubAllGlobals();
    });

    test("manualDetection returns true when window !== window.top (iframe)", async () => {
        const fakeWindow = { top: {} }; // top is a different object
        vi.stubGlobal("window", fakeWindow);
        const result = await isInsideContainer();
        expect(result).toBe(true);
        vi.unstubAllGlobals();
    });

    test("getHostLocalStorage returns null outside container", async () => {
        expect(await getHostLocalStorage()).toBeNull();
    });
}
