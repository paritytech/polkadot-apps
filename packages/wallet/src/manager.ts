import type { PolkadotSigner } from "polkadot-api";
import type { Account, Unsubscribe, WalletConfig, WalletState } from "./types.js";
import { createHostConnector } from "./host.js";
import { createExtensionConnector, getAvailableExtensions } from "./extension.js";
import { isInsideContainer } from "./container.js";
import type { WalletConnector } from "./types.js";

const INITIAL_STATE: WalletState = {
    status: "disconnected",
    source: null,
    accounts: [],
    selectedAccount: null,
    error: null,
};

// TODO: Replace inline hostLocalStorage/localStorage logic with @polkadot-apps/storage
// once that package is implemented. It already abstracts container vs browser persistence.

function storageKey(dappName: string): string {
    return `polkadot-apps:wallet:${dappName}:selectedAccount`;
}

/**
 * Persist selected account address.
 * Uses hostLocalStorage inside a container, browser localStorage outside.
 */
async function tryPersistAccount(dappName: string, address: string): Promise<void> {
    try {
        if (isInsideContainer()) {
            const sdk = await import("@novasamatech/product-sdk");
            await sdk.hostLocalStorage.writeString(storageKey(dappName), address);
            return;
        }
    } catch {
        // product-sdk not available — fall through to browser localStorage
    }
    try {
        globalThis.localStorage?.setItem(storageKey(dappName), address);
    } catch {
        // Best-effort — localStorage may be unavailable
    }
}

/**
 * Load persisted account address.
 * Uses hostLocalStorage inside a container, browser localStorage outside.
 */
async function tryLoadPersistedAccount(dappName: string): Promise<string | null> {
    try {
        if (isInsideContainer()) {
            const sdk = await import("@novasamatech/product-sdk");
            const saved = await sdk.hostLocalStorage.readString(storageKey(dappName));
            return saved || null;
        }
    } catch {
        // product-sdk not available — fall through to browser localStorage
    }
    try {
        return globalThis.localStorage?.getItem(storageKey(dappName)) ?? null;
    } catch {
        return null;
    }
}

/**
 * Unified wallet connection manager.
 *
 * Framework-agnostic — state is accessed via `getState()` and observed via
 * `subscribe()`, making it compatible with React `useSyncExternalStore`,
 * Vue `watch`, and plain callbacks.
 *
 * Supports a single active wallet source at a time. Calling `connect()`
 * while already connected disconnects the previous source first.
 */
export class WalletManager {
    private _state: WalletState = { ...INITIAL_STATE };
    private _listeners = new Set<(state: WalletState) => void>();
    private _config: WalletConfig;
    private _connector: WalletConnector | null = null;
    private _accountsSub: Unsubscribe | null = null;
    private _destroyed = false;

    constructor(config: WalletConfig) {
        this._config = config;
    }

    /** Current state snapshot. */
    getState(): WalletState {
        return this._state;
    }

    /** Subscribe to state changes. Returns an unsubscribe function. */
    subscribe(listener: (state: WalletState) => void): Unsubscribe {
        this.assertAlive();
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    /**
     * Connect to a wallet source.
     *
     * `"host"` connects via the Host API (product-sdk).
     * Any other string is treated as a browser extension name
     * (e.g. `"talisman"`, `"subwallet-js"`, `"polkadot-js"`).
     */
    async connect(source: string): Promise<void> {
        this.assertAlive();

        // Disconnect previous source if any
        if (this._state.status !== "disconnected") {
            this.disconnect();
        }

        this.emit({ status: "connecting", source, error: null });

        const connector =
            source === "host" ? createHostConnector() : createExtensionConnector(source);

        try {
            const result = await connector.connect(this._config);
            if (this._destroyed) return;

            this._connector = connector;

            const persisted = await tryLoadPersistedAccount(this._config.dappName);
            const selected =
                (persisted ? result.accounts.find((a) => a.address === persisted) : null) ??
                result.accounts[0] ??
                null;

            this.emit({
                status: result.accounts.length > 0 ? "connected" : "disconnected",
                source,
                accounts: result.accounts,
                selectedAccount: selected,
                error: result.accounts.length === 0 ? "No accounts available" : null,
            });

            if (selected) {
                void tryPersistAccount(this._config.dappName, selected.address);
            }

            // Wire up account change subscription
            if (result.subscribe) {
                this._accountsSub = result.subscribe((newAccounts) => {
                    if (this._destroyed) return;

                    if (newAccounts.length === 0) {
                        this.disconnect();
                        return;
                    }

                    const current = this._state.selectedAccount;
                    const stillExists = current
                        ? newAccounts.find((a) => a.address === current.address)
                        : null;
                    const nextSelected = stillExists ?? newAccounts[0]!;

                    this.emit({
                        accounts: newAccounts,
                        selectedAccount: nextSelected,
                    });
                });
            }
        } catch (err) {
            if (this._destroyed) return;
            this.emit({
                status: "error",
                source,
                accounts: [],
                selectedAccount: null,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    /**
     * Auto-connect: try Host API first (if inside a container), then fall back
     * to the first available browser extension.
     *
     * This is the recommended entry point for most apps — it mirrors the
     * "host first, extension fallback" pattern used by mark3t and task-rabbit.
     */
    async connectAuto(): Promise<void> {
        this.assertAlive();

        // Strategy 1: Host API when inside a container
        if (isInsideContainer()) {
            try {
                await this.connect("host");
                if (this._state.status === "connected") return;
            } catch {
                // Host failed — fall through to extensions
            }
        }

        // Strategy 2: first available browser extension
        const extensions = await getAvailableExtensions();
        for (const ext of extensions) {
            try {
                await this.connect(ext);
                if (this._state.status === "connected") return;
            } catch {
                // This extension failed — try next
            }
        }

        // Nothing worked
        if (this._state.status !== "connected") {
            this.emit({
                status: "error",
                source: null,
                accounts: [],
                selectedAccount: null,
                error: "No wallet available",
            });
        }
    }

    /** Disconnect from the current wallet source. */
    disconnect(): void {
        this._accountsSub?.();
        this._accountsSub = null;
        this._connector?.disconnect();
        this._connector = null;
        this.emit({ ...INITIAL_STATE });
    }

    /** Select an account by address. No-op if the address is not in the current account list. */
    selectAccount(address: string): void {
        this.assertAlive();
        const account = this._state.accounts.find((a) => a.address === address);
        if (!account) return;
        void tryPersistAccount(this._config.dappName, address);
        this.emit({ selectedAccount: account });
    }

    /** Get the PolkadotSigner for the currently selected account. Throws if none selected. */
    getSigner(): PolkadotSigner {
        this.assertAlive();
        if (!this._state.selectedAccount) {
            throw new Error("No account selected");
        }
        return this._state.selectedAccount.polkadotSigner;
    }

    /**
     * Sign arbitrary bytes with the currently selected account.
     *
     * This is a convenience wrapper around `PolkadotSigner.signBytes` — useful
     * for master key derivation (hackm3's `host_sign_raw` pattern), message
     * signing, and proof generation without constructing a full transaction.
     *
     * Throws if no account is selected.
     */
    async signRaw(data: Uint8Array): Promise<Uint8Array> {
        return this.getSigner().signBytes(data);
    }

    /** List available browser extensions. Async because extensions inject asynchronously. */
    getAvailableExtensions(): Promise<string[]> {
        return getAvailableExtensions();
    }

    /** Tear down all subscriptions and state. The instance cannot be used after this. */
    destroy(): void {
        this.disconnect();
        this._listeners.clear();
        this._destroyed = true;
    }

    private emit(patch: Partial<WalletState>): void {
        this._state = { ...this._state, ...patch };
        for (const listener of this._listeners) {
            listener(this._state);
        }
    }

    private assertAlive(): void {
        if (this._destroyed) {
            throw new Error("WalletManager has been destroyed");
        }
    }
}

if (import.meta.vitest) {
    const { describe, test, expect } = import.meta.vitest;

    describe("WalletManager", () => {
        test("initial state is disconnected", () => {
            const wm = new WalletManager({ dappName: "test" });
            const state = wm.getState();
            expect(state.status).toBe("disconnected");
            expect(state.accounts).toEqual([]);
            expect(state.selectedAccount).toBeNull();
            wm.destroy();
        });

        test("subscribe and unsubscribe", () => {
            const wm = new WalletManager({ dappName: "test" });
            const states: WalletState[] = [];
            const unsub = wm.subscribe((s) => states.push(s));

            // Trigger a state change via disconnect (no-op but still emits)
            wm.disconnect();
            expect(states.length).toBe(1);

            unsub();
            wm.disconnect();
            expect(states.length).toBe(1); // No new emission after unsub
            wm.destroy();
        });

        test("getSigner throws when no account selected", () => {
            const wm = new WalletManager({ dappName: "test" });
            expect(() => wm.getSigner()).toThrow("No account selected");
            wm.destroy();
        });

        test("destroy prevents further use", () => {
            const wm = new WalletManager({ dappName: "test" });
            wm.destroy();
            expect(() => wm.getSigner()).toThrow("destroyed");
            expect(() => wm.subscribe(() => {})).toThrow("destroyed");
        });

        test("selectAccount is no-op for unknown address", () => {
            const wm = new WalletManager({ dappName: "test" });
            wm.selectAccount("5Unknown");
            expect(wm.getState().selectedAccount).toBeNull();
            wm.destroy();
        });

        test("signRaw throws when no account selected", async () => {
            const wm = new WalletManager({ dappName: "test" });
            await expect(wm.signRaw(new Uint8Array([1, 2, 3]))).rejects.toThrow(
                "No account selected",
            );
            wm.destroy();
        });

        test("connectAuto emits error when no wallet available (Node env)", async () => {
            const wm = new WalletManager({ dappName: "test" });
            await wm.connectAuto();
            expect(wm.getState().status).toBe("error");
            expect(wm.getState().error).toBe("No wallet available");
            wm.destroy();
        });
    });
}
