import { deriveH160, ss58Encode } from "@polkadot-apps/address";
import { createLogger } from "@polkadot-apps/logger";

import {
    HostRejectedError,
    HostUnavailableError,
    NoAccountsError,
    type SignerError,
} from "../errors.js";
import { withRetry } from "../retry.js";
import type { ConnectionStatus, ProviderType, Result, SignerAccount } from "../types.js";
import { err, ok } from "../types.js";
import type { SignerProvider, Unsubscribe } from "./types.js";

const log = createLogger("signer:host");

/** Options for the Host API provider. */
export interface HostProviderOptions {
    /** SS58 prefix for address encoding. Default: 42 */
    ss58Prefix?: number;
    /** Max retry attempts for initial connection. Default: 3 */
    maxRetries?: number;
    /** Initial retry delay in ms. Default: 500 */
    retryDelay?: number;
    /**
     * Custom SDK loader. Defaults to `import("@novasamatech/product-sdk")`.
     * Override this for testing or custom SDK setups.
     * @internal
     */
    loadSdk?: () => Promise<ProductSdkModule>;
}

/**
 * A product account — an app-scoped derived account managed by the host wallet.
 *
 * The host derives a unique keypair for each app (identified by `dotNsIdentifier`)
 * so apps get their own account that the user controls but is scoped to the app.
 */
export interface ProductAccount {
    /** App identifier (e.g., "mark3t.dot"). */
    dotNsIdentifier: string;
    /** Derivation index within the app scope. Default: 0 */
    derivationIndex: number;
    /** Raw public key (32 bytes). */
    publicKey: Uint8Array;
}

/**
 * A contextual alias obtained from Ring VRF.
 *
 * Proves account membership in a ring without revealing which account.
 */
export interface ContextualAlias {
    /** Ring context (32 bytes). */
    context: Uint8Array;
    /** The Ring VRF alias bytes. */
    alias: Uint8Array;
}

/**
 * Location of a Ring VRF ring on-chain.
 *
 * Matches the product-sdk's `RingLocation` codec shape.
 */
export interface RingLocation {
    genesisHash: string;
    ringRootHash: string;
    hints?: { palletInstance?: number } | undefined;
}

// Minimal types matching product-sdk's actual API shape.
// We define these locally so the SDK remains an optional peer dep.
interface RawAccount {
    publicKey: Uint8Array;
    name?: string | undefined;
}

// Minimal neverthrow ResultAsync shape (product-sdk uses neverthrow internally)
interface NeverthrowResultAsync<T, E> {
    match: <A, B = A>(ok: (t: T) => A, err: (e: E) => B) => Promise<A | B>;
}

/** @internal */
export interface AccountsProvider {
    getNonProductAccounts: () => NeverthrowResultAsync<RawAccount[], unknown>;
    getNonProductAccountSigner: (account: ProductAccount) => import("polkadot-api").PolkadotSigner;
    getProductAccount: (
        dotNsIdentifier: string,
        derivationIndex?: number,
    ) => NeverthrowResultAsync<RawAccount, unknown>;
    getProductAccountSigner: (account: ProductAccount) => import("polkadot-api").PolkadotSigner;
    getProductAccountAlias: (
        dotNsIdentifier: string,
        derivationIndex?: number,
    ) => NeverthrowResultAsync<ContextualAlias, unknown>;
    createRingVRFProof: (
        dotNsIdentifier: string,
        derivationIndex: number,
        location: unknown,
        message: Uint8Array,
    ) => NeverthrowResultAsync<Uint8Array, unknown>;
    subscribeAccountConnectionStatus: (
        callback: (status: string) => void,
    ) => { unsubscribe: () => void } | (() => void);
}

/** @internal */
export interface ProductSdkModule {
    createAccountsProvider: () => AccountsProvider;
    injectSpektrExtension?: () => Promise<boolean>;
}

/* @integration */
async function defaultLoadSdk(): Promise<ProductSdkModule> {
    return (await import("@novasamatech/product-sdk")) as unknown as ProductSdkModule;
}

/**
 * Provider for the Host API (Polkadot Desktop / Android).
 *
 * Dynamically imports `@novasamatech/product-sdk` at runtime so it remains
 * an optional peer dependency. Apps running outside a host container will
 * gracefully get a `HOST_UNAVAILABLE` error.
 *
 * Supports both non-product accounts (user's external wallets) and product
 * accounts (app-scoped derived accounts managed by the host).
 */
export class HostProvider implements SignerProvider {
    readonly type: ProviderType = "host";
    private readonly ss58Prefix: number;
    private readonly maxRetries: number;
    private readonly retryDelay: number;
    private readonly loadSdk: () => Promise<ProductSdkModule>;

    private accountsProvider: AccountsProvider | null = null;
    private statusCleanup: (() => void) | null = null;
    private statusListeners = new Set<(status: ConnectionStatus) => void>();
    private accountListeners = new Set<(accounts: SignerAccount[]) => void>();

    constructor(options?: HostProviderOptions) {
        this.ss58Prefix = options?.ss58Prefix ?? 42;
        this.maxRetries = options?.maxRetries ?? 3;
        this.retryDelay = options?.retryDelay ?? 500;
        this.loadSdk = options?.loadSdk ?? defaultLoadSdk;
    }

    /**
     * Inject the host wallet as a Spektr extension into `window.injectedWeb3`.
     *
     * This is a compatibility fallback for container environments where the
     * direct Host API connection fails. After injection, the host wallet
     * appears as a standard browser extension and can be used via
     * `ExtensionProvider`.
     *
     * The direct Host API path (via `HostProvider.connect()`) is preferred
     * because it supports the full Host API surface (product accounts, Ring VRF,
     * etc.). Spektr injection only provides non-product account access.
     *
     * @param loadSdk - Custom SDK loader for testing. Defaults to dynamic import.
     * @returns `true` if injection succeeded, `false` otherwise.
     */
    static async injectSpektr(loadSdk?: () => Promise<ProductSdkModule>): Promise<boolean> {
        try {
            const sdk = await (loadSdk ?? defaultLoadSdk)();
            if (!sdk.injectSpektrExtension) {
                log.warn("product-sdk does not export injectSpektrExtension");
                return false;
            }
            const result = await sdk.injectSpektrExtension();
            log.debug("Spektr injection result", { result });
            return result;
        } catch (cause) {
            log.warn("Spektr injection failed", { cause });
            return false;
        }
    }

    async connect(signal?: AbortSignal): Promise<Result<SignerAccount[], SignerError>> {
        log.debug("attempting Host API connection");

        return withRetry(
            async () => {
                if (signal?.aborted) {
                    return err(new HostUnavailableError("Connection aborted"));
                }
                return this.tryConnect();
            },
            {
                maxAttempts: this.maxRetries,
                initialDelay: this.retryDelay,
                signal,
            },
        );
    }

    disconnect(): void {
        if (this.statusCleanup) {
            this.statusCleanup();
            this.statusCleanup = null;
        }
        this.accountsProvider = null;
        this.statusListeners.clear();
        this.accountListeners.clear();
        log.debug("host provider disconnected");
    }

    onStatusChange(callback: (status: ConnectionStatus) => void): Unsubscribe {
        this.statusListeners.add(callback);
        return () => {
            this.statusListeners.delete(callback);
        };
    }

    onAccountsChange(callback: (accounts: SignerAccount[]) => void): Unsubscribe {
        this.accountListeners.add(callback);
        return () => {
            this.accountListeners.delete(callback);
        };
    }

    // ── Product Account API ──────────────────────────────────────────

    /**
     * Get an app-scoped product account from the host.
     *
     * Product accounts are derived by the host wallet for each app, identified
     * by `dotNsIdentifier` (e.g., "mark3t.dot"). The user controls these accounts
     * but they are scoped to the requesting app.
     *
     * Requires a prior successful `connect()` call.
     */
    async getProductAccount(
        dotNsIdentifier: string,
        derivationIndex = 0,
    ): Promise<Result<SignerAccount, SignerError>> {
        if (!this.accountsProvider) {
            return err(new HostUnavailableError("Host provider is not connected"));
        }

        try {
            const raw = (await this.accountsProvider
                .getProductAccount(dotNsIdentifier, derivationIndex)
                .match(
                    (account) => account,
                    (error) => {
                        throw new Error(
                            `Host rejected product account request: ${formatError(error)}`,
                        );
                    },
                )) as RawAccount;

            const address = ss58Encode(raw.publicKey, this.ss58Prefix);
            const productAccount: ProductAccount = {
                dotNsIdentifier,
                derivationIndex,
                publicKey: raw.publicKey,
            };

            return ok({
                address,
                h160Address: deriveH160(raw.publicKey),
                publicKey: raw.publicKey,
                name: raw.name ?? null,
                source: "host" as const,
                getSigner: () => {
                    if (!this.accountsProvider) {
                        throw new Error("Host provider is disconnected");
                    }
                    return this.accountsProvider.getProductAccountSigner(productAccount);
                },
            });
        } catch (cause) {
            log.error("failed to get product account", { cause });
            return err(
                new HostRejectedError(
                    cause instanceof Error ? cause.message : "Failed to get product account",
                ),
            );
        }
    }

    /**
     * Get a PolkadotSigner for a product account.
     *
     * Convenience method for when you already have the product account details.
     * Requires a prior successful `connect()` call.
     */
    getProductAccountSigner(account: ProductAccount): import("polkadot-api").PolkadotSigner {
        if (!this.accountsProvider) {
            throw new Error("Host provider is not connected");
        }
        return this.accountsProvider.getProductAccountSigner(account);
    }

    /**
     * Get a contextual alias for a product account via Ring VRF.
     *
     * Aliases prove account membership in a ring without revealing which
     * account produced the alias.
     *
     * Requires a prior successful `connect()` call.
     */
    async getProductAccountAlias(
        dotNsIdentifier: string,
        derivationIndex = 0,
    ): Promise<Result<ContextualAlias, SignerError>> {
        if (!this.accountsProvider) {
            return err(new HostUnavailableError("Host provider is not connected"));
        }

        try {
            const alias = (await this.accountsProvider
                .getProductAccountAlias(dotNsIdentifier, derivationIndex)
                .match(
                    (result) => result,
                    (error) => {
                        throw new Error(`Host rejected alias request: ${formatError(error)}`);
                    },
                )) as ContextualAlias;

            return ok(alias);
        } catch (cause) {
            log.error("failed to get product account alias", { cause });
            return err(
                new HostRejectedError(
                    cause instanceof Error ? cause.message : "Failed to get product account alias",
                ),
            );
        }
    }

    /**
     * Create a Ring VRF proof for anonymous operations.
     *
     * Proves that the signer is a member of the ring at the given location
     * without revealing which member. Used for privacy-preserving protocols.
     *
     * Requires a prior successful `connect()` call.
     */
    async createRingVRFProof(
        dotNsIdentifier: string,
        derivationIndex: number,
        location: RingLocation,
        message: Uint8Array,
    ): Promise<Result<Uint8Array, SignerError>> {
        if (!this.accountsProvider) {
            return err(new HostUnavailableError("Host provider is not connected"));
        }

        try {
            const proof = (await this.accountsProvider
                .createRingVRFProof(dotNsIdentifier, derivationIndex, location, message)
                .match(
                    (result) => result,
                    (error) => {
                        throw new Error(
                            `Host rejected Ring VRF proof request: ${formatError(error)}`,
                        );
                    },
                )) as Uint8Array;

            return ok(proof);
        } catch (cause) {
            log.error("failed to create Ring VRF proof", { cause });
            return err(
                new HostRejectedError(
                    cause instanceof Error ? cause.message : "Failed to create Ring VRF proof",
                ),
            );
        }
    }

    // ── Private ──────────────────────────────────────────────────────

    private async tryConnect(): Promise<Result<SignerAccount[], SignerError>> {
        // Step 1: Load product-sdk
        let sdk: ProductSdkModule;
        try {
            sdk = await this.loadSdk();
        } catch (cause) {
            log.warn("product-sdk not available", { cause });
            return err(
                new HostUnavailableError(
                    cause instanceof Error
                        ? `product-sdk import failed: ${cause.message}`
                        : "product-sdk is not installed",
                ),
            );
        }

        // Step 2: Create accounts provider
        const provider = sdk.createAccountsProvider();
        this.accountsProvider = provider;

        // Step 3: Fetch non-product accounts
        let rawAccounts: RawAccount[];
        try {
            rawAccounts = (await provider.getNonProductAccounts().match(
                (accounts) => accounts,
                (error) => {
                    throw new Error(`Host rejected account request: ${formatError(error)}`);
                },
            )) as RawAccount[];
        } catch (cause) {
            log.error("failed to get accounts from host", { cause });
            return err(
                new HostRejectedError(
                    cause instanceof Error ? cause.message : "Failed to get accounts from host",
                ),
            );
        }

        if (rawAccounts.length === 0) {
            log.warn("host returned no accounts");
            return err(new NoAccountsError("host"));
        }

        // Step 4: Map to SignerAccount[]
        const accounts = this.mapAccounts(rawAccounts);
        log.info("host connected", { accounts: accounts.length });

        // Step 5: Subscribe to connection status
        const sub = provider.subscribeAccountConnectionStatus((status) => {
            const mapped: ConnectionStatus = status === "connected" ? "connected" : "disconnected";
            log.debug("host status changed", { status: mapped });
            for (const listener of this.statusListeners) {
                listener(mapped);
            }
        });
        this.statusCleanup = typeof sub === "function" ? sub : () => sub.unsubscribe();

        return ok(accounts);
    }

    private mapAccounts(rawAccounts: ReadonlyArray<RawAccount>): SignerAccount[] {
        return rawAccounts.map((raw) => {
            const address = ss58Encode(raw.publicKey, this.ss58Prefix);
            const h160Address = deriveH160(raw.publicKey);
            return {
                address,
                h160Address,
                publicKey: raw.publicKey,
                name: raw.name ?? null,
                source: "host" as const,
                getSigner: () => {
                    if (!this.accountsProvider) {
                        throw new Error("Host provider is disconnected");
                    }
                    return this.accountsProvider.getNonProductAccountSigner({
                        dotNsIdentifier: "",
                        derivationIndex: 0,
                        publicKey: raw.publicKey,
                    });
                },
            };
        });
    }
}

function formatError(error: unknown): string {
    if (error && typeof error === "object" && "tag" in (error as Record<string, unknown>)) {
        return (error as Record<string, string>).tag;
    }
    return String(error);
}

if (import.meta.vitest) {
    const { test, expect, describe, vi, beforeEach } = import.meta.vitest;

    interface RawAccountTest {
        publicKey: Uint8Array;
        name?: string | undefined;
    }

    function createMockProvider(
        options: {
            accounts?: RawAccountTest[];
            shouldReject?: boolean;
            error?: unknown;
        } = {},
    ) {
        const accounts = options.accounts ?? [];
        const shouldReject = options.shouldReject ?? false;
        const mockSigner = {
            publicKey: new Uint8Array(32).fill(0xbb),
        } as unknown as import("polkadot-api").PolkadotSigner;

        return {
            getNonProductAccounts: vi.fn().mockReturnValue({
                match: async (
                    onOk: (v: RawAccountTest[]) => unknown,
                    onErr: (e: unknown) => unknown,
                ) => {
                    if (shouldReject) {
                        return onErr(options.error ?? "Unknown");
                    }
                    return onOk(accounts);
                },
            }),
            getNonProductAccountSigner: vi.fn().mockReturnValue(mockSigner),
            getProductAccount: vi.fn().mockReturnValue({
                match: async (
                    onOk: (v: RawAccountTest) => unknown,
                    onErr: (e: unknown) => unknown,
                ) => {
                    if (shouldReject) {
                        return onErr(options.error ?? "Unknown");
                    }
                    return onOk(accounts[0] ?? { publicKey: new Uint8Array(32), name: undefined });
                },
            }),
            getProductAccountSigner: vi.fn().mockReturnValue(mockSigner),
            getProductAccountAlias: vi.fn().mockReturnValue({
                match: async (onOk: (v: unknown) => unknown, onErr: (e: unknown) => unknown) => {
                    if (shouldReject) {
                        return onErr(options.error ?? "Unknown");
                    }
                    return onOk({
                        context: new Uint8Array(32).fill(0x01),
                        alias: new Uint8Array(64).fill(0x02),
                    });
                },
            }),
            createRingVRFProof: vi.fn().mockReturnValue({
                match: async (onOk: (v: unknown) => unknown, onErr: (e: unknown) => unknown) => {
                    if (shouldReject) {
                        return onErr(options.error ?? "Unknown");
                    }
                    return onOk(new Uint8Array(128).fill(0x03));
                },
            }),
            subscribeAccountConnectionStatus: vi.fn().mockReturnValue(() => {}),
        };
    }

    function createMockSdk(mockProvider: ReturnType<typeof createMockProvider>): ProductSdkModule {
        return { createAccountsProvider: () => mockProvider as unknown as AccountsProvider };
    }

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe("HostProvider", () => {
        test("returns HOST_UNAVAILABLE when SDK load fails", async () => {
            const provider = new HostProvider({
                maxRetries: 1,
                loadSdk: () => Promise.reject(new Error("Cannot find module")),
            });
            const result = await provider.connect();

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(HostUnavailableError);
                expect(result.error.message).toContain("Cannot find module");
            }
        });

        test("returns HOST_REJECTED when getNonProductAccounts fails", async () => {
            const mockProvider = createMockProvider({ shouldReject: true, error: "Rejected" });
            const provider = new HostProvider({
                maxRetries: 1,
                loadSdk: () => Promise.resolve(createMockSdk(mockProvider)),
            });
            const result = await provider.connect();

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(HostRejectedError);
            }
        });

        test("returns NO_ACCOUNTS when host returns empty list", async () => {
            const mockProvider = createMockProvider({ accounts: [] });
            const provider = new HostProvider({
                maxRetries: 1,
                loadSdk: () => Promise.resolve(createMockSdk(mockProvider)),
            });
            const result = await provider.connect();

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(NoAccountsError);
            }
        });

        test("maps accounts correctly on success", async () => {
            const rawAccounts: RawAccountTest[] = [
                { publicKey: new Uint8Array(32).fill(0xaa), name: "Alice" },
                { publicKey: new Uint8Array(32).fill(0xbb), name: undefined },
            ];
            const mockProvider = createMockProvider({ accounts: rawAccounts });
            const provider = new HostProvider({
                maxRetries: 1,
                loadSdk: () => Promise.resolve(createMockSdk(mockProvider)),
            });
            const result = await provider.connect();

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toHaveLength(2);
                expect(result.value[0].name).toBe("Alice");
                expect(result.value[0].source).toBe("host");
                expect(result.value[0].publicKey).toEqual(rawAccounts[0].publicKey);
                expect(result.value[1].name).toBeNull();
            }
        });

        test("getSigner delegates to getNonProductAccountSigner", async () => {
            const rawAccounts: RawAccountTest[] = [
                { publicKey: new Uint8Array(32).fill(0xcc), name: "Test" },
            ];
            const mockProvider = createMockProvider({ accounts: rawAccounts });
            const provider = new HostProvider({
                maxRetries: 1,
                loadSdk: () => Promise.resolve(createMockSdk(mockProvider)),
            });
            const result = await provider.connect();

            if (result.ok) {
                const signer = result.value[0].getSigner();
                expect(mockProvider.getNonProductAccountSigner).toHaveBeenCalled();
                expect(signer.publicKey).toEqual(new Uint8Array(32).fill(0xbb));
            }
        });

        test("subscribeAccountConnectionStatus is wired on connect", async () => {
            const rawAccounts: RawAccountTest[] = [{ publicKey: new Uint8Array(32).fill(0xdd) }];
            const mockProvider = createMockProvider({ accounts: rawAccounts });
            const provider = new HostProvider({
                maxRetries: 1,
                loadSdk: () => Promise.resolve(createMockSdk(mockProvider)),
            });
            await provider.connect();

            expect(mockProvider.subscribeAccountConnectionStatus).toHaveBeenCalled();
        });

        test("onStatusChange emits when host status changes", async () => {
            let statusCallback: ((status: string) => void) | undefined;
            const rawAccounts: RawAccountTest[] = [{ publicKey: new Uint8Array(32).fill(0xee) }];
            const mockProvider = createMockProvider({ accounts: rawAccounts });
            mockProvider.subscribeAccountConnectionStatus.mockImplementation(
                (cb: (status: string) => void) => {
                    statusCallback = cb;
                    return () => {};
                },
            );
            const provider = new HostProvider({
                maxRetries: 1,
                loadSdk: () => Promise.resolve(createMockSdk(mockProvider)),
            });
            const statuses: ConnectionStatus[] = [];
            const unsub = provider.onStatusChange((s) => statuses.push(s));
            await provider.connect();

            statusCallback!("disconnected");
            expect(statuses).toEqual(["disconnected"]);

            statusCallback!("connected");
            expect(statuses).toEqual(["disconnected", "connected"]);

            // Unsubscribe and verify no more events
            unsub();
            statusCallback!("disconnected");
            expect(statuses).toEqual(["disconnected", "connected"]); // no change
        });

        test("disconnect cleans up subscriptions", async () => {
            const unsubFn = vi.fn();
            const rawAccounts: RawAccountTest[] = [{ publicKey: new Uint8Array(32).fill(0xff) }];
            const mockProvider = createMockProvider({ accounts: rawAccounts });
            mockProvider.subscribeAccountConnectionStatus.mockReturnValue(unsubFn);
            const provider = new HostProvider({
                maxRetries: 1,
                loadSdk: () => Promise.resolve(createMockSdk(mockProvider)),
            });
            await provider.connect();

            provider.disconnect();
            expect(unsubFn).toHaveBeenCalled();
        });

        test("disconnect is idempotent", () => {
            const provider = new HostProvider();
            provider.disconnect();
            provider.disconnect();
        });

        test("getSigner throws after disconnect", async () => {
            const rawAccounts: RawAccountTest[] = [{ publicKey: new Uint8Array(32).fill(0xaa) }];
            const mockProvider = createMockProvider({ accounts: rawAccounts });
            const provider = new HostProvider({
                maxRetries: 1,
                loadSdk: () => Promise.resolve(createMockSdk(mockProvider)),
            });
            const result = await provider.connect();

            provider.disconnect();

            if (result.ok) {
                expect(() => result.value[0].getSigner()).toThrow("disconnected");
            }
        });

        test("type is 'host'", () => {
            const provider = new HostProvider();
            expect(provider.type).toBe("host");
        });

        test("AbortSignal cancels connection", async () => {
            const controller = new AbortController();
            controller.abort();

            const provider = new HostProvider({
                maxRetries: 1,
                loadSdk: () => Promise.reject(new Error("Should not reach")),
            });
            const result = await provider.connect(controller.signal);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(HostUnavailableError);
            }
        });

        test("onAccountsChange adds and removes listener", () => {
            const provider = new HostProvider();
            const cb = () => {};
            const unsub = provider.onAccountsChange(cb);
            expect(typeof unsub).toBe("function");
            unsub();
        });
    });

    describe("HostProvider.injectSpektr", () => {
        test("returns true when injection succeeds", async () => {
            const mockSdk: ProductSdkModule = {
                createAccountsProvider: () => ({}) as AccountsProvider,
                injectSpektrExtension: () => Promise.resolve(true),
            };
            const result = await HostProvider.injectSpektr(() => Promise.resolve(mockSdk));
            expect(result).toBe(true);
        });

        test("returns false when injection fails", async () => {
            const mockSdk: ProductSdkModule = {
                createAccountsProvider: () => ({}) as AccountsProvider,
                injectSpektrExtension: () => Promise.resolve(false),
            };
            const result = await HostProvider.injectSpektr(() => Promise.resolve(mockSdk));
            expect(result).toBe(false);
        });

        test("returns false when SDK load fails", async () => {
            const result = await HostProvider.injectSpektr(() =>
                Promise.reject(new Error("not installed")),
            );
            expect(result).toBe(false);
        });

        test("returns false when injectSpektrExtension not exported", async () => {
            const mockSdk: ProductSdkModule = {
                createAccountsProvider: () => ({}) as AccountsProvider,
            };
            const result = await HostProvider.injectSpektr(() => Promise.resolve(mockSdk));
            expect(result).toBe(false);
        });
    });

    describe("HostProvider product accounts", () => {
        test("getProductAccount returns account on success", async () => {
            const rawAccounts: RawAccountTest[] = [
                { publicKey: new Uint8Array(32).fill(0xaa), name: "AppAccount" },
            ];
            const mockProvider = createMockProvider({ accounts: rawAccounts });
            const provider = new HostProvider({
                maxRetries: 1,
                loadSdk: () => Promise.resolve(createMockSdk(mockProvider)),
            });
            await provider.connect();

            const result = await provider.getProductAccount("myapp.dot", 0);
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.source).toBe("host");
                expect(mockProvider.getProductAccount).toHaveBeenCalledWith("myapp.dot", 0);
            }
        });

        test("getProductAccount result has working getSigner", async () => {
            const rawAccounts: RawAccountTest[] = [
                { publicKey: new Uint8Array(32).fill(0xaa), name: "AppAccount" },
            ];
            const mockProvider = createMockProvider({ accounts: rawAccounts });
            const provider = new HostProvider({
                maxRetries: 1,
                loadSdk: () => Promise.resolve(createMockSdk(mockProvider)),
            });
            await provider.connect();

            const result = await provider.getProductAccount("myapp.dot", 0);
            if (result.ok) {
                const signer = result.value.getSigner();
                expect(mockProvider.getProductAccountSigner).toHaveBeenCalled();
                expect(signer.publicKey).toEqual(new Uint8Array(32).fill(0xbb));
            }
        });

        test("getProductAccount result getSigner throws after disconnect", async () => {
            const rawAccounts: RawAccountTest[] = [{ publicKey: new Uint8Array(32).fill(0xaa) }];
            const mockProvider = createMockProvider({ accounts: rawAccounts });
            const provider = new HostProvider({
                maxRetries: 1,
                loadSdk: () => Promise.resolve(createMockSdk(mockProvider)),
            });
            await provider.connect();

            const result = await provider.getProductAccount("myapp.dot", 0);
            provider.disconnect();

            if (result.ok) {
                expect(() => result.value.getSigner()).toThrow("disconnected");
            }
        });

        test("getProductAccount returns error when not connected", async () => {
            const provider = new HostProvider({ maxRetries: 1 });
            const result = await provider.getProductAccount("myapp.dot");
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(HostUnavailableError);
            }
        });

        test("getProductAccount returns error when host rejects", async () => {
            const rawAccounts: RawAccountTest[] = [{ publicKey: new Uint8Array(32).fill(0xaa) }];
            const mockProvider = createMockProvider({ accounts: rawAccounts });
            mockProvider.getProductAccount.mockReturnValue({
                match: async (_onOk: (v: unknown) => unknown, onErr: (e: unknown) => unknown) =>
                    onErr({ tag: "Rejected" }),
            });
            const provider = new HostProvider({
                maxRetries: 1,
                loadSdk: () => Promise.resolve(createMockSdk(mockProvider)),
            });
            await provider.connect();

            const result = await provider.getProductAccount("myapp.dot");
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(HostRejectedError);
            }
        });

        test("getProductAccountSigner delegates to SDK", async () => {
            const rawAccounts: RawAccountTest[] = [{ publicKey: new Uint8Array(32).fill(0xaa) }];
            const mockProvider = createMockProvider({ accounts: rawAccounts });
            const provider = new HostProvider({
                maxRetries: 1,
                loadSdk: () => Promise.resolve(createMockSdk(mockProvider)),
            });
            await provider.connect();

            const account: ProductAccount = {
                dotNsIdentifier: "test.dot",
                derivationIndex: 0,
                publicKey: new Uint8Array(32).fill(0xaa),
            };
            const signer = provider.getProductAccountSigner(account);
            expect(mockProvider.getProductAccountSigner).toHaveBeenCalledWith(account);
            expect(signer.publicKey).toEqual(new Uint8Array(32).fill(0xbb));
        });

        test("getProductAccountSigner throws when not connected", () => {
            const provider = new HostProvider({ maxRetries: 1 });
            expect(() =>
                provider.getProductAccountSigner({
                    dotNsIdentifier: "test.dot",
                    derivationIndex: 0,
                    publicKey: new Uint8Array(32),
                }),
            ).toThrow("not connected");
        });
    });

    describe("HostProvider product account alias", () => {
        test("getProductAccountAlias returns alias on success", async () => {
            const rawAccounts: RawAccountTest[] = [{ publicKey: new Uint8Array(32).fill(0xaa) }];
            const mockProvider = createMockProvider({ accounts: rawAccounts });
            const provider = new HostProvider({
                maxRetries: 1,
                loadSdk: () => Promise.resolve(createMockSdk(mockProvider)),
            });
            await provider.connect();

            const result = await provider.getProductAccountAlias("myapp.dot", 0);
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.context).toEqual(new Uint8Array(32).fill(0x01));
                expect(result.value.alias).toEqual(new Uint8Array(64).fill(0x02));
            }
        });

        test("getProductAccountAlias returns error when not connected", async () => {
            const provider = new HostProvider({ maxRetries: 1 });
            const result = await provider.getProductAccountAlias("myapp.dot");
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(HostUnavailableError);
            }
        });

        test("getProductAccountAlias returns error when host rejects", async () => {
            const rawAccounts: RawAccountTest[] = [{ publicKey: new Uint8Array(32).fill(0xaa) }];
            const mockProvider = createMockProvider({ accounts: rawAccounts });
            mockProvider.getProductAccountAlias.mockReturnValue({
                match: async (_onOk: (v: unknown) => unknown, onErr: (e: unknown) => unknown) =>
                    onErr({ tag: "Rejected" }),
            });
            const provider = new HostProvider({
                maxRetries: 1,
                loadSdk: () => Promise.resolve(createMockSdk(mockProvider)),
            });
            await provider.connect();

            const result = await provider.getProductAccountAlias("myapp.dot");
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(HostRejectedError);
            }
        });
    });

    describe("HostProvider Ring VRF proof", () => {
        test("createRingVRFProof returns proof on success", async () => {
            const rawAccounts: RawAccountTest[] = [{ publicKey: new Uint8Array(32).fill(0xaa) }];
            const mockProvider = createMockProvider({ accounts: rawAccounts });
            const provider = new HostProvider({
                maxRetries: 1,
                loadSdk: () => Promise.resolve(createMockSdk(mockProvider)),
            });
            await provider.connect();

            const location: RingLocation = {
                genesisHash: "0x00",
                ringRootHash: "0x01",
            };
            const result = await provider.createRingVRFProof(
                "myapp.dot",
                0,
                location,
                new Uint8Array([1, 2, 3]),
            );
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toEqual(new Uint8Array(128).fill(0x03));
            }
        });

        test("createRingVRFProof returns error when not connected", async () => {
            const provider = new HostProvider({ maxRetries: 1 });
            const location: RingLocation = {
                genesisHash: "0x00",
                ringRootHash: "0x01",
            };
            const result = await provider.createRingVRFProof(
                "myapp.dot",
                0,
                location,
                new Uint8Array([1]),
            );
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(HostUnavailableError);
            }
        });

        test("createRingVRFProof returns error when host rejects", async () => {
            const rawAccounts: RawAccountTest[] = [{ publicKey: new Uint8Array(32).fill(0xaa) }];
            const mockProvider = createMockProvider({ accounts: rawAccounts });
            mockProvider.createRingVRFProof.mockReturnValue({
                match: async (_onOk: (v: unknown) => unknown, onErr: (e: unknown) => unknown) =>
                    onErr({ tag: "Rejected" }),
            });
            const provider = new HostProvider({
                maxRetries: 1,
                loadSdk: () => Promise.resolve(createMockSdk(mockProvider)),
            });
            await provider.connect();

            const result = await provider.createRingVRFProof(
                "myapp.dot",
                0,
                { genesisHash: "0x00", ringRootHash: "0x01" },
                new Uint8Array([1]),
            );
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(HostRejectedError);
            }
        });
    });
}
