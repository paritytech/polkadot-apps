import { createLogger } from "@polkadot-apps/logger";

const log = createLogger("signer:container");

/**
 * Detect if running inside a Host container (Polkadot Desktop / Android).
 *
 * Checks for well-known signals that the host environment injects before
 * the app loads. This is a fast synchronous check — use it as a pre-filter
 * to skip the host provider timeout when clearly outside a container.
 *
 * Does NOT import product-sdk (that would defeat the "fast" purpose).
 */
export function isInsideContainer(): boolean {
    if (typeof globalThis.window === "undefined") return false;

    const win = globalThis.window as unknown as Record<string, unknown>;

    // Webview marker injected by Polkadot Desktop / Android
    if (win.__HOST_WEBVIEW_MARK__ === true) {
        log.debug("container detected via __HOST_WEBVIEW_MARK__");
        return true;
    }

    // MessagePort injected by Polkadot Desktop for host-api transport
    if (win.__HOST_API_PORT__ != null) {
        log.debug("container detected via __HOST_API_PORT__");
        return true;
    }

    // Iframe detection (polkadot.com browser embeds apps in iframes)
    try {
        if (globalThis.window !== globalThis.window.top) {
            log.debug("container detected via iframe");
            return true;
        }
    } catch {
        // Cross-origin iframe — likely inside a container
        log.debug("container detected via cross-origin iframe");
        return true;
    }

    return false;
}

/* v8 ignore start */
if (import.meta.vitest) {
    const { test, expect, describe, beforeEach, afterEach } = import.meta.vitest;

    describe("isInsideContainer", () => {
        let savedWindow: typeof globalThis.window | undefined;

        beforeEach(() => {
            savedWindow = globalThis.window;
        });

        afterEach(() => {
            if (savedWindow === undefined) {
                // biome-ignore lint/performance/noDelete: need to fully remove window to restore Node env
                delete (globalThis as Record<string, unknown>).window;
            } else {
                globalThis.window = savedWindow;
            }
        });

        test("returns false in Node environment (no window)", () => {
            // biome-ignore lint/performance/noDelete: need to fully remove window to restore Node env
            delete (globalThis as Record<string, unknown>).window;
            expect(isInsideContainer()).toBe(false);
        });

        test("returns true when __HOST_WEBVIEW_MARK__ is set", () => {
            const fakeWindow = { __HOST_WEBVIEW_MARK__: true } as unknown as Window &
                typeof globalThis;
            fakeWindow.top = fakeWindow;
            globalThis.window = fakeWindow;
            expect(isInsideContainer()).toBe(true);
        });

        test("returns true when __HOST_API_PORT__ is set", () => {
            const fakeWindow = { __HOST_API_PORT__: 12345 } as unknown as Window &
                typeof globalThis;
            fakeWindow.top = fakeWindow;
            globalThis.window = fakeWindow;
            expect(isInsideContainer()).toBe(true);
        });

        test("returns true when inside an iframe (window !== window.top)", () => {
            const fakeTop = {} as Window;
            const fakeWindow = { top: fakeTop } as unknown as Window & typeof globalThis;
            globalThis.window = fakeWindow;
            expect(isInsideContainer()).toBe(true);
        });

        test("returns true when cross-origin iframe (accessing top throws)", () => {
            const fakeWindow = {} as unknown as Window & typeof globalThis;
            Object.defineProperty(fakeWindow, "top", {
                get() {
                    throw new DOMException("Blocked a frame with origin");
                },
                configurable: true,
            });
            globalThis.window = fakeWindow;
            expect(isInsideContainer()).toBe(true);
        });

        test("returns false in standard browser window (no markers, same top)", () => {
            const fakeWindow = {} as unknown as Window & typeof globalThis;
            fakeWindow.top = fakeWindow;
            globalThis.window = fakeWindow;
            expect(isInsideContainer()).toBe(false);
        });
    });
}
