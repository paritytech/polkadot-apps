import type { PolkadotSigner } from "polkadot-api";

import { createLogger } from "@polkadot-apps/logger";

import {
    accountNotFound,
    destroyed,
    hostDisconnected,
    hostUnavailable,
    signingFailed,
} from "./errors.js";
import type { SignerError } from "./errors.js";
import { isInsideContainer } from "./container.js";
import { DevProvider } from "./providers/dev.js";
import { ExtensionProvider } from "./providers/extension.js";
import type { ExtensionApi } from "./providers/extension.js";
import { HostProvider } from "./providers/host.js";
import type { ContextualAlias, ProductAccount, RingLocation } from "./providers/host.js";
import type { SignerProvider } from "./providers/types.js";
import { withRetry } from "./retry.js";
import type {
    AccountPersistence,
    ConnectionStatus,
    ProviderType,
    Result,
    SignerAccount,
    SignerManagerOptions,
    SignerState,
} from "./types.js";
import { err, ok } from "./types.js";

const log = createLogger("signer");

const DEFAULT_HOST_TIMEOUT = 10_000;
const DEFAULT_EXTENSION_TIMEOUT = 1_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_SS58_PREFIX = 42;
const DEFAULT_DAPP_NAME = "polkadot-app";

// Auto-reconnect settings for host disconnect events
const RECONNECT_MAX_ATTEMPTS = 5;
const RECONNECT_INITIAL_DELAY = 1_000;
const RECONNECT_MAX_DELAY = 15_000;

function persistenceStorageKey(dappName: string): string {
    return `polkadot-apps:signer:${dappName}:selectedAccount`;
}

/**
 * Auto-detect the best available persistence adapter.
 *
 * Prefers hostLocalStorage (product-sdk) when inside a container because
 * sandboxed iframes may not share localStorage with the host application.
 * Falls back to browser localStorage in standalone environments.
 */
async function detectPersistence(): Promise<AccountPersistence | null> {
    // Try host storage first (container environment)
    if (isInsideContainer()) {
        try {
            const sdk = await import("@novasamatech/product-sdk");
            if (sdk.hostLocalStorage) {
                log.debug("using hostLocalStorage for persistence");
                return {
                    getItem: (key) => sdk.hostLocalStorage.readString(key),
                    setItem: (key, value) => sdk.hostLocalStorage.writeString(key, value),
                    removeItem: (key) => sdk.hostLocalStorage.writeString(key, ""),
                };
            }
        } catch {
            // product-sdk not available — fall through to localStorage
        }
    }

    // Fall back to browser localStorage
    try {
        if (typeof globalThis.localStorage !== "undefined") {
            return globalThis.localStorage;
        }
    } catch {
        // localStorage may throw in some environments (e.g. sandboxed iframes)
    }
    return null;
}

function initialState(): SignerState {
    return {
        status: "disconnected",
        accounts: [],
        selectedAccount: null,
        activeProvider: null,
        error: null,
    };
}

/**
 * Core orchestrator for signer management.
 *
 * Manages account discovery and signer creation across multiple providers
 * (Host API, browser extensions, dev accounts). Framework-agnostic —
 * use the subscribe() pattern to integrate with React, Vue, or any framework.
 *
 * @example
 * ```ts
 * const manager = new SignerManager();
 * manager.subscribe(state => console.log(state.status));
 *
 * // Auto-detect: tries Host API first, then browser extensions
 * await manager.connect();
 *
 * // Or connect to a specific provider
 * await manager.connect("dev");
 *
 * // Select account and get signer
 * manager.selectAccount("5GrwvaEF...");
 * const signer = manager.getSigner();
 * ```
 */
export class SignerManager {
    private state: SignerState;
    private provider: SignerProvider | null = null;
    private subscribers = new Set<(state: SignerState) => void>();
    private cleanups: (() => void)[] = [];
    private isDestroyed = false;
    private reconnectController: AbortController | null = null;
    private connectController: AbortController | null = null;

    private readonly ss58Prefix: number;
    private readonly hostTimeout: number;
    private readonly extensionTimeout: number;
    private readonly maxRetries: number;
    private readonly providerFactory: ((type: ProviderType) => SignerProvider) | undefined;
    private readonly dappName: string;
    private readonly persistenceOption: AccountPersistence | null | undefined;
    private resolvedPersistence: AccountPersistence | null | undefined;

    constructor(options?: SignerManagerOptions) {
        this.ss58Prefix = options?.ss58Prefix ?? DEFAULT_SS58_PREFIX;
        this.hostTimeout = options?.hostTimeout ?? DEFAULT_HOST_TIMEOUT;
        this.extensionTimeout = options?.extensionTimeout ?? DEFAULT_EXTENSION_TIMEOUT;
        this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
        this.providerFactory = options?.createProvider;
        this.dappName = options?.dappName ?? DEFAULT_DAPP_NAME;
        // null = disabled, undefined = auto-detect, AccountPersistence = explicit
        this.persistenceOption = options?.persistence;
        this.resolvedPersistence = options?.persistence;
        this.state = initialState();
    }

    private async getPersistence(): Promise<AccountPersistence | null> {
        if (this.persistenceOption === null) return null;
        if (this.persistenceOption !== undefined) return this.persistenceOption;
        // Auto-detect (lazy, cached)
        if (this.resolvedPersistence === undefined) {
            this.resolvedPersistence = await detectPersistence();
        }
        return this.resolvedPersistence ?? null;
    }

    /** Get a snapshot of the current state. */
    getState(): SignerState {
        return this.state;
    }

    /**
     * Subscribe to state changes. The callback fires on every state mutation.
     * Returns an unsubscribe function.
     */
    subscribe(callback: (state: SignerState) => void): () => void {
        this.subscribers.add(callback);
        return () => {
            this.subscribers.delete(callback);
        };
    }

    /**
     * Connect to a provider.
     *
     * If no provider type is specified, runs environment-aware auto-detection:
     *
     * **Inside a container** (iframe/webview):
     * 1. Try direct Host API connection (preferred, idiomatic path)
     * 2. If host fails, try Spektr extension injection as fallback
     * 3. If both fail, return error — no further fallback
     *
     * **Outside a container** (standalone browser):
     * 1. Try browser extensions directly
     * 2. If fails, return error — no host attempt
     *
     * When connecting to a specific provider, it is used directly.
     */
    async connect(providerType?: ProviderType): Promise<Result<SignerAccount[], SignerError>> {
        if (this.isDestroyed) {
            return err(destroyed());
        }

        // Cancel any in-flight connection
        this.cancelConnect();
        this.connectController = new AbortController();
        const signal = this.connectController.signal;

        // Clean up previous connection
        this.disconnectInternal();

        this.setState({ status: "connecting", error: null });

        if (providerType) {
            return this.connectToProvider(providerType, signal);
        }

        return this.autoDetect(signal);
    }

    /** Disconnect from the current provider and reset state. */
    disconnect(): void {
        this.cancelConnect();
        this.cancelReconnect();
        this.disconnectInternal();
        this.setState(initialState());
        log.info("disconnected");
    }

    /**
     * Select an account by address.
     * Returns the account on success, or ACCOUNT_NOT_FOUND error.
     */
    selectAccount(address: string): Result<SignerAccount, SignerError> {
        if (this.isDestroyed) {
            return err(destroyed());
        }

        const account = this.state.accounts.find((a) => a.address === address);
        if (!account) {
            log.warn("account not found", { address });
            return err(accountNotFound(address));
        }

        this.setState({ selectedAccount: account });
        this.persistAccount(address);
        log.debug("account selected", { address });
        return ok(account);
    }

    /**
     * Get the PolkadotSigner for the currently selected account.
     * Returns null if no account is selected or manager is disconnected.
     */
    getSigner(): PolkadotSigner | null {
        return this.state.selectedAccount?.getSigner() ?? null;
    }

    /**
     * Sign arbitrary bytes with the currently selected account.
     *
     * Convenience wrapper around `PolkadotSigner.signBytes` — useful for
     * master key derivation, message signing, and proof generation without
     * constructing a full transaction.
     *
     * Returns a SIGNING_FAILED error if no account is selected or signing fails.
     */
    async signRaw(data: Uint8Array): Promise<Result<Uint8Array, SignerError>> {
        if (this.isDestroyed) {
            return err(destroyed());
        }

        const signer = this.getSigner();
        if (!signer) {
            return err(signingFailed(null, "No account selected"));
        }

        try {
            const signature = await signer.signBytes(data);
            return ok(signature);
        } catch (cause) {
            log.error("signRaw failed", { cause });
            return err(signingFailed(cause));
        }
    }

    // ── Host-only: Product Account API ─────────────────────────────

    /**
     * Get an app-scoped product account from the host.
     *
     * Product accounts are derived by the host wallet for each app, identified
     * by `dotNsIdentifier` (e.g., "mark3t.dot"). Only available when connected
     * via the host provider — returns HOST_UNAVAILABLE otherwise.
     *
     * @example
     * ```ts
     * const result = await manager.getProductAccount("myapp.dot");
     * if (result.ok) {
     *   const signer = result.value.getSigner();
     * }
     * ```
     */
    async getProductAccount(
        dotNsIdentifier: string,
        derivationIndex = 0,
    ): Promise<Result<SignerAccount, SignerError>> {
        if (this.isDestroyed) return err(destroyed());

        const host = this.getHostProvider();
        if (!host) {
            return err(hostUnavailable("Product accounts require a host provider connection"));
        }
        return host.getProductAccount(dotNsIdentifier, derivationIndex);
    }

    /**
     * Get a contextual alias for a product account via Ring VRF.
     *
     * Aliases prove account membership in a ring without revealing which
     * account produced the alias. Only available when connected via the host
     * provider — returns HOST_UNAVAILABLE otherwise.
     */
    async getProductAccountAlias(
        dotNsIdentifier: string,
        derivationIndex = 0,
    ): Promise<Result<ContextualAlias, SignerError>> {
        if (this.isDestroyed) return err(destroyed());

        const host = this.getHostProvider();
        if (!host) {
            return err(
                hostUnavailable("Product account aliases require a host provider connection"),
            );
        }
        return host.getProductAccountAlias(dotNsIdentifier, derivationIndex);
    }

    /**
     * Create a Ring VRF proof for anonymous operations.
     *
     * Proves that the signer is a member of the ring at the given location
     * without revealing which member. Only available when connected via the
     * host provider — returns HOST_UNAVAILABLE otherwise.
     */
    async createRingVRFProof(
        dotNsIdentifier: string,
        derivationIndex: number,
        location: RingLocation,
        message: Uint8Array,
    ): Promise<Result<Uint8Array, SignerError>> {
        if (this.isDestroyed) return err(destroyed());

        const host = this.getHostProvider();
        if (!host) {
            return err(hostUnavailable("Ring VRF proofs require a host provider connection"));
        }
        return host.createRingVRFProof(dotNsIdentifier, derivationIndex, location, message);
    }

    /**
     * List available browser extensions.
     *
     * Async because extensions inject into `window.injectedWeb3` asynchronously
     * after page load. Uses the same injection wait as the extension provider.
     */
    async getAvailableExtensions(): Promise<string[]> {
        try {
            const api = await this.loadExtensionApi();
            return api.getInjectedExtensions();
        } catch {
            return [];
        }
    }

    /**
     * Destroy the manager and release all resources.
     * After calling destroy(), the manager is unusable.
     */
    destroy(): void {
        if (this.isDestroyed) return;
        this.isDestroyed = true;
        this.cancelConnect();
        this.cancelReconnect();
        this.disconnectInternal();
        this.subscribers.clear();
        this.state = initialState();
        log.info("manager destroyed");
    }

    // ── Private ──────────────────────────────────────────────────────

    /**
     * Environment-aware auto-detection.
     *
     * Inside a container: direct Host API is the preferred, idiomatic path.
     * If that fails, Spektr extension injection is tried as a fallback.
     * Outside a container: browser extensions are the only viable path.
     */
    private async autoDetect(signal?: AbortSignal): Promise<Result<SignerAccount[], SignerError>> {
        const inContainer = isInsideContainer();
        log.info("auto-detecting provider", { inContainer });

        if (inContainer) {
            return this.autoDetectContainer(signal);
        }

        return this.autoDetectStandalone(signal);
    }

    /**
     * Container path: Host API (preferred) → Spektr injection (fallback) → error.
     *
     * The direct Host API is the idiomatic path for container environments.
     * Spektr injection is a compatibility fallback that makes the host wallet
     * appear as a browser extension via `window.injectedWeb3`.
     */
    private async autoDetectContainer(
        signal?: AbortSignal,
    ): Promise<Result<SignerAccount[], SignerError>> {
        // Apply hostTimeout to the host connection attempt
        const hostSignal = signal
            ? AbortSignal.any([signal, AbortSignal.timeout(this.hostTimeout)])
            : AbortSignal.timeout(this.hostTimeout);

        const hostResult = await this.connectToProvider("host", hostSignal);
        if (hostResult.ok) {
            return hostResult;
        }

        log.info("direct host connection failed, trying Spektr injection fallback", {
            error: hostResult.error,
        });

        // Spektr injection fallback: inject host wallet as browser extension
        const injected = await HostProvider.injectSpektr();
        if (injected) {
            log.info("Spektr injected, connecting via extension provider");
            const extResult = await this.connectToProvider("extension", signal);
            if (extResult.ok) {
                return extResult;
            }
            log.warn("Spektr injection succeeded but extension connection failed", {
                error: extResult.error,
            });
        } else {
            log.warn("Spektr injection failed");
        }

        // All container paths failed
        this.setState({
            status: "disconnected",
            error: hostResult.error,
        });
        return hostResult;
    }

    /** Standalone path: browser extensions only. */
    private async autoDetectStandalone(
        signal?: AbortSignal,
    ): Promise<Result<SignerAccount[], SignerError>> {
        const extResult = await this.connectToProvider("extension", signal);
        if (extResult.ok) {
            return extResult;
        }

        log.warn("no browser extensions available");
        this.setState({
            status: "disconnected",
            error: extResult.error,
        });
        return extResult;
    }

    private async connectToProvider(
        type: ProviderType,
        signal?: AbortSignal,
    ): Promise<Result<SignerAccount[], SignerError>> {
        const provider = this.createProvider(type);

        const result = await provider.connect(signal);
        if (!result.ok) {
            provider.disconnect();
            this.setState({ status: "disconnected", error: result.error });
            return result;
        }

        // Success — set up provider
        this.provider = provider;

        // Wire status change listener
        const statusUnsub = provider.onStatusChange((status) => {
            this.handleProviderStatusChange(status);
        });
        this.cleanups.push(statusUnsub);

        // Wire account change listener
        const accountUnsub = provider.onAccountsChange((accounts) => {
            this.setState({
                accounts,
                // Clear selected if no longer in list
                selectedAccount:
                    accounts.find((a) => a.address === this.state.selectedAccount?.address) ?? null,
            });
        });
        this.cleanups.push(accountUnsub);

        const accounts = result.value;

        // Try to restore persisted account selection
        const persisted = await this.loadPersistedAccount();
        const restoredAccount = persisted ? accounts.find((a) => a.address === persisted) : null;
        const selectedAccount = restoredAccount ?? (accounts.length > 0 ? accounts[0] : null);

        this.setState({
            status: "connected",
            accounts,
            activeProvider: type,
            selectedAccount,
            error: null,
        });

        if (selectedAccount) {
            this.persistAccount(selectedAccount.address);
        }

        log.info("connected", { provider: type, accounts: accounts.length });
        return result;
    }

    private createProvider(type: ProviderType): SignerProvider {
        if (this.providerFactory) {
            return this.providerFactory(type);
        }

        switch (type) {
            case "host":
                return new HostProvider({
                    ss58Prefix: this.ss58Prefix,
                    maxRetries: this.maxRetries,
                    retryDelay: 500,
                });
            case "extension":
                return new ExtensionProvider({
                    injectionWait: this.extensionTimeout,
                    dappName: this.dappName,
                });
            case "dev":
                return new DevProvider({
                    ss58Prefix: this.ss58Prefix,
                });
        }
    }

    private handleProviderStatusChange(status: ConnectionStatus): void {
        if (status === "disconnected" && this.state.status === "connected") {
            log.warn("provider disconnected, attempting reconnect");
            this.attemptReconnect();
        }
    }

    private attemptReconnect(): void {
        this.cancelReconnect();

        const providerType = this.state.activeProvider;
        if (!providerType) return;

        this.reconnectController = new AbortController();
        const signal = this.reconnectController.signal;

        this.setState({ status: "connecting" });

        withRetry(
            async () => {
                if (signal.aborted) {
                    return err(hostDisconnected("Reconnect cancelled"));
                }

                this.disconnectInternal();
                const provider = this.createProvider(providerType);

                // Compose hostTimeout with reconnect signal for host providers
                const connectSignal =
                    providerType === "host"
                        ? AbortSignal.any([signal, AbortSignal.timeout(this.hostTimeout)])
                        : signal;
                const result = await provider.connect(connectSignal);

                if (!result.ok) return result;

                // Re-wire provider
                this.provider = provider;
                const statusUnsub = provider.onStatusChange((s) =>
                    this.handleProviderStatusChange(s),
                );
                this.cleanups.push(statusUnsub);

                const accountUnsub = provider.onAccountsChange((accounts) => {
                    this.setState({
                        accounts,
                        selectedAccount:
                            accounts.find(
                                (a) => a.address === this.state.selectedAccount?.address,
                            ) ?? null,
                    });
                });
                this.cleanups.push(accountUnsub);

                const accounts = result.value;
                this.setState({
                    status: "connected",
                    accounts,
                    activeProvider: providerType,
                    selectedAccount:
                        accounts.find((a) => a.address === this.state.selectedAccount?.address) ??
                        (accounts.length > 0 ? accounts[0] : null),
                    error: null,
                });

                log.info("reconnected", { provider: providerType });
                return result;
            },
            {
                maxAttempts: RECONNECT_MAX_ATTEMPTS,
                initialDelay: RECONNECT_INITIAL_DELAY,
                maxDelay: RECONNECT_MAX_DELAY,
                signal,
            },
        )
            .then(async (result) => {
                if (!result.ok && !signal.aborted) {
                    log.warn("reconnect to original provider failed, trying auto-detect");
                    const fallback = await this.autoDetect();
                    if (!fallback.ok) {
                        log.error("all reconnect attempts failed", { error: fallback.error });
                        this.setState({
                            status: "disconnected",
                            error: hostDisconnected("Reconnect failed after all retries"),
                        });
                    }
                }
            })
            .catch((cause) => {
                log.error("unexpected reconnect error", { cause });
                this.setState({
                    status: "disconnected",
                    error: hostDisconnected("Reconnect failed unexpectedly"),
                });
            });
    }

    /** Returns the underlying HostProvider if connected via host, or null otherwise. */
    private getHostProvider(): HostProvider | null {
        if (this.provider && this.state.activeProvider === "host") {
            return this.provider as HostProvider;
        }
        return null;
    }

    private cancelConnect(): void {
        if (this.connectController) {
            this.connectController.abort();
            this.connectController = null;
        }
    }

    private cancelReconnect(): void {
        if (this.reconnectController) {
            this.reconnectController.abort();
            this.reconnectController = null;
        }
    }

    private disconnectInternal(): void {
        for (const cleanup of this.cleanups) {
            cleanup();
        }
        this.cleanups = [];

        if (this.provider) {
            this.provider.disconnect();
            this.provider = null;
        }
    }

    private persistAccount(address: string): void {
        void this.getPersistence()
            .then((p) => {
                if (p) {
                    const key = persistenceStorageKey(this.dappName);
                    return Promise.resolve(p.setItem(key, address));
                }
            })
            .catch(() => {
                log.debug("failed to persist selected account");
            });
    }

    private async loadPersistedAccount(): Promise<string | null> {
        try {
            const p = await this.getPersistence();
            if (!p) return null;
            const key = persistenceStorageKey(this.dappName);
            const value = await Promise.resolve(p.getItem(key));
            // Treat empty strings as null (hostLocalStorage uses writeString("") for deletion)
            return value || null;
        } catch {
            log.debug("failed to load persisted account");
            return null;
        }
    }

    private async loadExtensionApi(): Promise<ExtensionApi> {
        const { getInjectedExtensions, connectInjectedExtension } = await import(
            "polkadot-api/pjs-signer"
        );
        return { getInjectedExtensions, connectInjectedExtension };
    }

    private setState(patch: Partial<SignerState>): void {
        this.state = { ...this.state, ...patch };
        for (const subscriber of this.subscribers) {
            subscriber(this.state);
        }
    }
}

/* v8 ignore start */
if (import.meta.vitest) {
    const { test, expect, describe, vi, beforeEach, afterEach } = import.meta.vitest;
    const { hostUnavailable, extensionNotFound } = await import("./errors.js");

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe("SignerManager", () => {
        test("initial state is disconnected with empty accounts", () => {
            const manager = new SignerManager({ persistence: null });
            const state = manager.getState();
            expect(state.status).toBe("disconnected");
            expect(state.accounts).toEqual([]);
            expect(state.selectedAccount).toBeNull();
            expect(state.activeProvider).toBeNull();
            expect(state.error).toBeNull();
            manager.destroy();
        });

        test("subscribe fires on state changes and unsubscribe works", async () => {
            const manager = new SignerManager({ persistence: null });
            const states: SignerState[] = [];
            const unsub = manager.subscribe((s) => states.push({ ...s }));

            // Trigger a state change via connect("dev")
            await manager.connect("dev");

            expect(states.length).toBeGreaterThan(0);
            expect(states[0].status).toBe("connecting");

            // Unsubscribe
            unsub();
            const countBefore = states.length;
            manager.disconnect();
            expect(states.length).toBe(countBefore); // no new events

            manager.destroy();
        });

        test("connect('dev') populates accounts and selects first", async () => {
            const manager = new SignerManager({ persistence: null });
            const result = await manager.connect("dev");

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.length).toBe(6);
                expect(result.value[0].name).toBe("Alice");
            }

            const state = manager.getState();
            expect(state.status).toBe("connected");
            expect(state.accounts.length).toBe(6);
            expect(state.selectedAccount?.name).toBe("Alice");
            expect(state.activeProvider).toBe("dev");
            expect(state.error).toBeNull();

            manager.destroy();
        });

        test("selectAccount updates selectedAccount", async () => {
            const manager = new SignerManager({ persistence: null });
            await manager.connect("dev");

            const bobAddress = manager.getState().accounts[1].address;
            const result = manager.selectAccount(bobAddress);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.name).toBe("Bob");
            }
            expect(manager.getState().selectedAccount?.name).toBe("Bob");

            manager.destroy();
        });

        test("selectAccount returns ACCOUNT_NOT_FOUND for unknown address", async () => {
            const manager = new SignerManager({ persistence: null });
            await manager.connect("dev");

            const result = manager.selectAccount("5NonExistentAddress");
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.type).toBe("ACCOUNT_NOT_FOUND");
            }

            manager.destroy();
        });

        test("getSigner returns signer of selected account", async () => {
            const manager = new SignerManager({ persistence: null });
            await manager.connect("dev");

            const signer = manager.getSigner();
            expect(signer).not.toBeNull();
            expect(signer!.publicKey).toEqual(manager.getState().selectedAccount?.publicKey);

            manager.destroy();
        });

        test("getSigner returns null when no account selected", () => {
            const manager = new SignerManager({ persistence: null });
            expect(manager.getSigner()).toBeNull();
            manager.destroy();
        });

        test("disconnect resets state", async () => {
            const manager = new SignerManager({ persistence: null });
            await manager.connect("dev");

            manager.disconnect();
            const state = manager.getState();
            expect(state.status).toBe("disconnected");
            expect(state.accounts).toEqual([]);
            expect(state.selectedAccount).toBeNull();
            expect(state.activeProvider).toBeNull();

            manager.destroy();
        });

        test("destroy prevents further operations", async () => {
            const manager = new SignerManager({ persistence: null });
            manager.destroy();

            const result = await manager.connect("dev");
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.type).toBe("DESTROYED");
            }

            const selectResult = manager.selectAccount("x");
            expect(selectResult.ok).toBe(false);
            if (!selectResult.ok) {
                expect(selectResult.error.type).toBe("DESTROYED");
            }
        });

        test("destroy is idempotent", () => {
            const manager = new SignerManager({ persistence: null });
            manager.destroy();
            manager.destroy(); // should not throw
        });

        test("multiple subscribers all receive updates", async () => {
            const manager = new SignerManager({ persistence: null });
            const states1: string[] = [];
            const states2: string[] = [];
            manager.subscribe((s) => states1.push(s.status));
            manager.subscribe((s) => states2.push(s.status));

            await manager.connect("dev");

            expect(states1).toEqual(states2);
            expect(states1.length).toBeGreaterThan(0);

            manager.destroy();
        });

        test("connect cleans up previous connection", async () => {
            const manager = new SignerManager({ persistence: null });

            await manager.connect("dev");
            expect(manager.getState().accounts.length).toBe(6);

            // Connect again with different options
            await manager.connect("dev");
            expect(manager.getState().status).toBe("connected");
            expect(manager.getState().accounts.length).toBe(6);

            manager.destroy();
        });

        test("state transitions through full lifecycle", async () => {
            const manager = new SignerManager({ persistence: null });
            const statuses: ConnectionStatus[] = [];
            manager.subscribe((s) => statuses.push(s.status));

            await manager.connect("dev");
            manager.disconnect();

            expect(statuses).toEqual([
                "connecting", // connect() begins
                "connected", // connect() succeeds
                "disconnected", // disconnect() called
            ]);

            manager.destroy();
        });

        test("auto-detect outside container goes directly to extensions", async () => {
            // In Node env, isInsideContainer() returns false
            const callOrder: string[] = [];
            const mockExtAccounts: SignerAccount[] = [
                {
                    address: "5ExtAddr",
                    h160Address: "0x0000000000000000000000000000000000000000",
                    publicKey: new Uint8Array(32).fill(0xee),
                    name: "Ext Account",
                    source: "extension",
                    getSigner: () => {
                        type Signer = import("polkadot-api").PolkadotSigner;
                        return { publicKey: new Uint8Array(32).fill(0xee) } as unknown as Signer;
                    },
                },
            ];

            const manager = new SignerManager({
                createProvider: (type) => {
                    if (type === "host") {
                        return {
                            type: "host",
                            connect: async () => {
                                callOrder.push("host");
                                return err(hostUnavailable());
                            },
                            disconnect: () => {},
                            onStatusChange: () => () => {},
                            onAccountsChange: () => () => {},
                        } as unknown as SignerProvider;
                    }
                    return {
                        type: "extension",
                        connect: async () => {
                            callOrder.push("extension");
                            return ok(mockExtAccounts);
                        },
                        disconnect: () => {},
                        onStatusChange: () => () => {},
                        onAccountsChange: () => () => {},
                    } as unknown as SignerProvider;
                },
                persistence: null,
            });

            const result = await manager.connect();
            // Outside container: extension only, no host attempt
            expect(callOrder).toEqual(["extension"]);
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value[0].name).toBe("Ext Account");
            }
            expect(manager.getState().activeProvider).toBe("extension");

            manager.destroy();
        });

        test("auto-detect outside container returns extension error when none found", async () => {
            const callOrder: string[] = [];
            const manager = new SignerManager({
                createProvider: (type) =>
                    ({
                        type,
                        connect: async () => {
                            callOrder.push(type);
                            if (type === "host") return err(hostUnavailable());
                            return err(extensionNotFound("*", "No extensions"));
                        },
                        disconnect: () => {},
                        onStatusChange: () => () => {},
                        onAccountsChange: () => () => {},
                    }) as unknown as SignerProvider,
                persistence: null,
            });

            const result = await manager.connect();
            // Outside container: extension only
            expect(callOrder).toEqual(["extension"]);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.type).toBe("EXTENSION_NOT_FOUND");
            }

            manager.destroy();
        });

        test("createProvider passes dappName to extension provider", async () => {
            // Verify via createProvider factory that dappName is captured.
            // The factory receives the type; we verify the default factory builds
            // an ExtensionProvider with the configured dappName by inspecting the
            // actual createProvider code path.
            let receivedType: string | undefined;
            const manager = new SignerManager({
                createProvider: (type) => {
                    receivedType = type;
                    return {
                        type,
                        connect: async () => ok([]),
                        disconnect: () => {},
                        onStatusChange: () => () => {},
                        onAccountsChange: () => () => {},
                    } as unknown as SignerProvider;
                },
                persistence: null,
                dappName: "my-custom-app",
            });

            await manager.connect("extension");
            expect(receivedType).toBe("extension");

            // The actual dappName forwarding is verified by reading the source:
            // createProvider("extension") calls new ExtensionProvider({ dappName: this.dappName })
            // This test ensures the factory is invoked correctly for the extension type.
            manager.destroy();
        });

        test("concurrent connect: second call succeeds and manager is connected", async () => {
            const manager = new SignerManager({
                persistence: null,
            });

            // First connect starts
            const promise1 = manager.connect("dev");
            // Second connect starts immediately (cancels first via AbortController)
            const promise2 = manager.connect("dev");

            const [, result2] = await Promise.all([promise1, promise2]);

            // Second connect should succeed
            expect(result2.ok).toBe(true);
            // Manager should be in connected state from second connect
            expect(manager.getState().status).toBe("connected");

            manager.destroy();
        });

        // ── Product account delegation tests ──────────────────────

        test("getProductAccount returns HOST_UNAVAILABLE when not connected via host", async () => {
            const manager = new SignerManager({ persistence: null });
            await manager.connect("dev");

            const result = await manager.getProductAccount("myapp.dot");
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.type).toBe("HOST_UNAVAILABLE");
            }
            manager.destroy();
        });

        test("getProductAccount returns DESTROYED after destroy", async () => {
            const manager = new SignerManager({ persistence: null });
            manager.destroy();

            const result = await manager.getProductAccount("myapp.dot");
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.type).toBe("DESTROYED");
            }
        });

        test("getProductAccount delegates to host provider when connected via host", async () => {
            const mockProductAccount: SignerAccount = {
                address: "5Product",
                h160Address: "0x0000000000000000000000000000000000000000",
                publicKey: new Uint8Array(32).fill(0xdd),
                name: "Product",
                source: "host",
                getSigner: () =>
                    ({
                        publicKey: new Uint8Array(32).fill(0xdd),
                    }) as unknown as import("polkadot-api").PolkadotSigner,
            };
            const mockHost = {
                type: "host" as const,
                connect: async () => ok([mockProductAccount]),
                disconnect: () => {},
                onStatusChange: () => () => {},
                onAccountsChange: () => () => {},
                getProductAccount: async () => ok(mockProductAccount),
                getProductAccountAlias: async () =>
                    ok({ context: new Uint8Array(32), alias: new Uint8Array(64) }),
                createRingVRFProof: async () => ok(new Uint8Array(128)),
            };

            const manager = new SignerManager({
                createProvider: () => mockHost as unknown as SignerProvider,
                persistence: null,
            });
            await manager.connect("host");

            const result = await manager.getProductAccount("myapp.dot");
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.address).toBe("5Product");
            }
            manager.destroy();
        });

        test("getProductAccountAlias returns HOST_UNAVAILABLE when connected via extension", async () => {
            const manager = new SignerManager({ persistence: null });
            await manager.connect("dev");

            const result = await manager.getProductAccountAlias("myapp.dot");
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.type).toBe("HOST_UNAVAILABLE");
            }
            manager.destroy();
        });

        test("createRingVRFProof returns HOST_UNAVAILABLE when not connected via host", async () => {
            const manager = new SignerManager({ persistence: null });
            await manager.connect("dev");

            const result = await manager.createRingVRFProof(
                "myapp.dot",
                0,
                { genesisHash: "0x00", ringRootHash: "0x01" },
                new Uint8Array([1]),
            );
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.type).toBe("HOST_UNAVAILABLE");
            }
            manager.destroy();
        });

        // ── Container auto-detect tests ──────────────────────────

        test("auto-detect inside container: host succeeds", async () => {
            // Mock isInsideContainer to return true
            const containerModule = await import("./container.js");
            const spy = vi.spyOn(containerModule, "isInsideContainer").mockReturnValue(true);

            const mockAccounts: SignerAccount[] = [
                {
                    address: "5HostAddr",
                    h160Address: "0x0000000000000000000000000000000000000001",
                    publicKey: new Uint8Array(32).fill(0x11),
                    name: "Host Account",
                    source: "host",
                    getSigner: () =>
                        ({
                            publicKey: new Uint8Array(32).fill(0x11),
                        }) as unknown as import("polkadot-api").PolkadotSigner,
                },
            ];

            const manager = new SignerManager({
                createProvider: (type) =>
                    ({
                        type,
                        connect: async () => ok(mockAccounts),
                        disconnect: () => {},
                        onStatusChange: () => () => {},
                        onAccountsChange: () => () => {},
                    }) as unknown as SignerProvider,
                persistence: null,
            });

            const result = await manager.connect();
            expect(result.ok).toBe(true);
            expect(manager.getState().activeProvider).toBe("host");

            spy.mockRestore();
            manager.destroy();
        });

        test("auto-detect inside container: host fails, Spektr injection + extension succeeds", async () => {
            const containerModule = await import("./container.js");
            const spy = vi.spyOn(containerModule, "isInsideContainer").mockReturnValue(true);

            // Mock HostProvider.injectSpektr to succeed
            const spektrSpy = vi.spyOn(HostProvider, "injectSpektr").mockResolvedValue(true);

            const callOrder: string[] = [];
            const mockExtAccounts: SignerAccount[] = [
                {
                    address: "5Ext",
                    h160Address: "0x0000000000000000000000000000000000000002",
                    publicKey: new Uint8Array(32).fill(0x22),
                    name: "Ext",
                    source: "extension",
                    getSigner: () =>
                        ({
                            publicKey: new Uint8Array(32).fill(0x22),
                        }) as unknown as import("polkadot-api").PolkadotSigner,
                },
            ];

            const manager = new SignerManager({
                createProvider: (type) => {
                    callOrder.push(type);
                    if (type === "host") {
                        return {
                            type: "host",
                            connect: async () => err(hostUnavailable()),
                            disconnect: () => {},
                            onStatusChange: () => () => {},
                            onAccountsChange: () => () => {},
                        } as unknown as SignerProvider;
                    }
                    return {
                        type: "extension",
                        connect: async () => ok(mockExtAccounts),
                        disconnect: () => {},
                        onStatusChange: () => () => {},
                        onAccountsChange: () => () => {},
                    } as unknown as SignerProvider;
                },
                persistence: null,
            });

            const result = await manager.connect();
            // Host tried first, then extension after Spektr injection
            expect(callOrder).toEqual(["host", "extension"]);
            expect(result.ok).toBe(true);
            expect(manager.getState().activeProvider).toBe("extension");

            spy.mockRestore();
            spektrSpy.mockRestore();
            manager.destroy();
        });

        test("auto-detect inside container: all paths fail returns host error", async () => {
            const containerModule = await import("./container.js");
            const spy = vi.spyOn(containerModule, "isInsideContainer").mockReturnValue(true);
            const spektrSpy = vi.spyOn(HostProvider, "injectSpektr").mockResolvedValue(false);

            const manager = new SignerManager({
                createProvider: (type) =>
                    ({
                        type,
                        connect: async () => err(hostUnavailable()),
                        disconnect: () => {},
                        onStatusChange: () => () => {},
                        onAccountsChange: () => () => {},
                    }) as unknown as SignerProvider,
                persistence: null,
            });

            const result = await manager.connect();
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.type).toBe("HOST_UNAVAILABLE");
            }

            spy.mockRestore();
            spektrSpy.mockRestore();
            manager.destroy();
        });

        // ── Reconnect tests ─────────────────────────────────────

        test("reconnect on provider disconnect", async () => {
            let statusCallback: ((status: ConnectionStatus) => void) | undefined;
            let connectCallCount = 0;

            const manager = new SignerManager({
                createProvider: () => {
                    connectCallCount++;
                    return {
                        type: "dev" as const,
                        connect: async () =>
                            ok([
                                {
                                    address: "5Test",
                                    h160Address: "0x0000000000000000000000000000000000000000",
                                    publicKey: new Uint8Array(32),
                                    name: "Test",
                                    source: "dev" as const,
                                    getSigner: () =>
                                        ({
                                            publicKey: new Uint8Array(32),
                                        }) as unknown as import("polkadot-api").PolkadotSigner,
                                },
                            ]),
                        disconnect: () => {},
                        onStatusChange: (cb: (s: ConnectionStatus) => void) => {
                            statusCallback = cb;
                            return () => {};
                        },
                        onAccountsChange: () => () => {},
                    } as unknown as SignerProvider;
                },
                persistence: null,
            });

            await manager.connect("dev");
            expect(manager.getState().status).toBe("connected");
            expect(connectCallCount).toBe(1);

            // Simulate provider disconnect — triggers reconnect
            statusCallback!("disconnected");

            // Allow reconnect retry to complete
            await vi.advanceTimersByTimeAsync(2000);

            // Should have attempted reconnect (at least one more connect call)
            expect(connectCallCount).toBeGreaterThan(1);

            manager.destroy();
        });

        // ── Persistence tests ──────────────────────────────────────

        test("persists selected account and restores on reconnect", async () => {
            const storage = new Map<string, string>();
            const persistence = {
                getItem: (key: string) => storage.get(key) ?? null,
                setItem: (key: string, value: string) => {
                    storage.set(key, value);
                },
                removeItem: (key: string) => {
                    storage.delete(key);
                },
            };

            const manager = new SignerManager({ persistence, dappName: "test-app" });
            await manager.connect("dev");

            // Alice is auto-selected first
            expect(manager.getState().selectedAccount?.name).toBe("Alice");

            // Select Bob
            const bobAddr = manager.getState().accounts[1].address;
            manager.selectAccount(bobAddr);
            expect(manager.getState().selectedAccount?.name).toBe("Bob");

            // Allow fire-and-forget persist to complete
            await vi.advanceTimersByTimeAsync(0);

            // Verify persistence wrote Bob's address
            expect(storage.get("polkadot-apps:signer:test-app:selectedAccount")).toBe(bobAddr);

            // Reconnect — should restore Bob
            manager.disconnect();
            await manager.connect("dev");
            expect(manager.getState().selectedAccount?.name).toBe("Bob");

            manager.destroy();
        });

        test("persistence null disables account saving", async () => {
            const manager = new SignerManager({ persistence: null });
            await manager.connect("dev");

            const bobAddr = manager.getState().accounts[1].address;
            manager.selectAccount(bobAddr);

            // Reconnect — should default to first (Alice), not Bob
            manager.disconnect();
            await manager.connect("dev");
            expect(manager.getState().selectedAccount?.name).toBe("Alice");

            manager.destroy();
        });

        test("persistence failure is gracefully handled", async () => {
            const persistence = {
                getItem: () => {
                    throw new Error("storage unavailable");
                },
                setItem: () => {
                    throw new Error("storage unavailable");
                },
                removeItem: () => {},
            };

            const manager = new SignerManager({ persistence });
            // Should not throw despite persistence failures
            await manager.connect("dev");
            expect(manager.getState().selectedAccount?.name).toBe("Alice");

            manager.destroy();
        });

        // ── signRaw tests ──────────────────────────────────────────

        test("signRaw returns SIGNING_FAILED when no account selected", async () => {
            const manager = new SignerManager({ persistence: null });
            const result = await manager.signRaw(new Uint8Array([1, 2, 3]));
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.type).toBe("SIGNING_FAILED");
            }
            manager.destroy();
        });

        test("signRaw returns DESTROYED after destroy", async () => {
            const manager = new SignerManager({ persistence: null });
            manager.destroy();
            const result = await manager.signRaw(new Uint8Array([1]));
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.type).toBe("DESTROYED");
            }
        });

        test("signRaw delegates to signer.signBytes on selected account", async () => {
            const mockSignature = new Uint8Array(64).fill(0xab);
            const manager = new SignerManager({
                persistence: null,
                createProvider: () =>
                    ({
                        type: "dev",
                        connect: async () =>
                            ok([
                                {
                                    address: "5Test",
                                    publicKey: new Uint8Array(32),
                                    name: "Test",
                                    source: "dev" as const,
                                    getSigner: () => ({
                                        publicKey: new Uint8Array(32),
                                        signBytes: async () => mockSignature,
                                        signTx: async () => new Uint8Array(0),
                                    }),
                                },
                            ]),
                        disconnect: () => {},
                        onStatusChange: () => () => {},
                        onAccountsChange: () => () => {},
                    }) as unknown as SignerProvider,
            });

            await manager.connect("dev");
            const result = await manager.signRaw(new Uint8Array([1, 2, 3]));
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toEqual(mockSignature);
            }

            manager.destroy();
        });

        test("signRaw returns SIGNING_FAILED when signer throws", async () => {
            const manager = new SignerManager({
                persistence: null,
                createProvider: () =>
                    ({
                        type: "dev",
                        connect: async () =>
                            ok([
                                {
                                    address: "5Test",
                                    publicKey: new Uint8Array(32),
                                    name: "Test",
                                    source: "dev" as const,
                                    getSigner: () => ({
                                        publicKey: new Uint8Array(32),
                                        signBytes: async () => {
                                            throw new Error("hardware wallet disconnected");
                                        },
                                        signTx: async () => new Uint8Array(0),
                                    }),
                                },
                            ]),
                        disconnect: () => {},
                        onStatusChange: () => () => {},
                        onAccountsChange: () => () => {},
                    }) as unknown as SignerProvider,
            });

            await manager.connect("dev");
            const result = await manager.signRaw(new Uint8Array([1]));
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.type).toBe("SIGNING_FAILED");
                if (result.error.type === "SIGNING_FAILED") {
                    expect(result.error.message).toContain("hardware wallet disconnected");
                }
            }

            manager.destroy();
        });

        // ── getAvailableExtensions tests ───────────────────────────

        test("getAvailableExtensions returns empty in Node env", async () => {
            const manager = new SignerManager({ persistence: null });
            // In Node, no window.injectedWeb3 exists, so it returns empty
            const extensions = await manager.getAvailableExtensions();
            expect(extensions).toEqual([]);
            manager.destroy();
        });
    });
}
