import type { InjectedExtension, InjectedPolkadotAccount } from "polkadot-api/pjs-signer";

import { deriveH160 } from "@polkadot-apps/address";
import { createLogger } from "@polkadot-apps/logger";
import { sleep } from "../sleep.js";

import { extensionNotFound, extensionRejected } from "../errors.js";
import type { SignerError } from "../errors.js";
import type { ConnectionStatus, ProviderType, Result, SignerAccount } from "../types.js";
import { err, ok } from "../types.js";
import type { SignerProvider, Unsubscribe } from "./types.js";

const log = createLogger("signer:extension");

const DEFAULT_INJECTION_WAIT = 500;

/** Subset of the polkadot-api/pjs-signer API we use. Injected for testability. */
export interface ExtensionApi {
    getInjectedExtensions: () => string[];
    connectInjectedExtension: (name: string, dappName?: string) => Promise<InjectedExtension>;
}

/** Options for the browser extension provider. */
export interface ExtensionProviderOptions {
    /** Target a specific extension by name (e.g., "talisman", "polkadot-js"). */
    extensionName?: string;
    /** App name shown when requesting permission from the extension. Default: "Polkadot App" */
    dappName?: string;
    /** Time in ms to wait for extension injection. Default: 500 */
    injectionWait?: number;
    /**
     * Custom extension API. Defaults to polkadot-api/pjs-signer functions.
     * @internal
     */
    api?: ExtensionApi;
}

async function defaultApi(): Promise<ExtensionApi> {
    const { getInjectedExtensions, connectInjectedExtension } = await import(
        "polkadot-api/pjs-signer"
    );
    return { getInjectedExtensions, connectInjectedExtension };
}

/**
 * Provider for browser-injected wallet extensions.
 *
 * Discovers available extensions via `window.injectedWeb3`, connects to the
 * first available (or a specific named) extension, and maps accounts to
 * `SignerAccount` instances.
 */
export class ExtensionProvider implements SignerProvider {
    readonly type: ProviderType = "extension";
    private readonly extensionName: string | undefined;
    private readonly dappName: string;
    private readonly injectionWait: number;
    private readonly apiOverride: ExtensionApi | undefined;

    private extension: InjectedExtension | null = null;
    private accountUnsubscribe: (() => void) | null = null;
    private accountListeners = new Set<(accounts: SignerAccount[]) => void>();

    constructor(options?: ExtensionProviderOptions) {
        this.extensionName = options?.extensionName;
        this.dappName = options?.dappName ?? "Polkadot App";
        this.injectionWait = options?.injectionWait ?? DEFAULT_INJECTION_WAIT;
        this.apiOverride = options?.api;
    }

    async connect(signal?: AbortSignal): Promise<Result<SignerAccount[], SignerError>> {
        log.debug("waiting for extension injection", { wait: this.injectionWait });

        // Wait for extensions to inject into the page
        await sleep(this.injectionWait, signal);

        if (signal?.aborted) {
            return err(extensionNotFound(this.extensionName ?? "*", "Connection aborted"));
        }

        // Load the API (dynamic import or injected override)
        let api: ExtensionApi;
        try {
            api = this.apiOverride ?? (await defaultApi());
        } catch (cause) {
            log.warn("polkadot-api/pjs-signer not available", { cause });
            return err(
                extensionNotFound(
                    this.extensionName ?? "*",
                    "polkadot-api/pjs-signer not available",
                ),
            );
        }

        const available = api.getInjectedExtensions();
        log.debug("detected extensions", { available });

        if (available.length === 0) {
            log.warn("no browser extensions detected");
            return err(
                extensionNotFound(this.extensionName ?? "*", "No browser extensions detected"),
            );
        }

        // Pick target extension
        const targetName = this.extensionName ?? available[0];
        if (!available.includes(targetName)) {
            log.warn("requested extension not found", { targetName, available });
            return err(extensionNotFound(targetName));
        }

        // Connect
        let ext: InjectedExtension;
        try {
            ext = await api.connectInjectedExtension(targetName, this.dappName);
        } catch (cause) {
            log.error("extension rejected connection", { targetName, cause });
            return err(
                extensionRejected(
                    targetName,
                    cause instanceof Error
                        ? cause.message
                        : `Extension "${targetName}" rejected connection`,
                ),
            );
        }

        this.extension = ext;

        const accounts = mapAccounts(ext);
        log.info("extension connected", { name: targetName, accounts: accounts.length });

        // Subscribe to account changes from the extension
        this.accountUnsubscribe = ext.subscribe((rawAccounts) => {
            const updated = mapInjectedAccounts(rawAccounts);
            for (const listener of this.accountListeners) {
                listener(updated);
            }
        });

        return ok(accounts);
    }

    disconnect(): void {
        if (this.accountUnsubscribe) {
            this.accountUnsubscribe();
            this.accountUnsubscribe = null;
        }
        if (this.extension) {
            this.extension.disconnect();
            this.extension = null;
        }
        this.accountListeners.clear();
        log.debug("extension disconnected");
    }

    onStatusChange(_callback: (status: ConnectionStatus) => void): Unsubscribe {
        // Browser extensions don't emit status changes.
        return () => {};
    }

    onAccountsChange(callback: (accounts: SignerAccount[]) => void): Unsubscribe {
        this.accountListeners.add(callback);
        return () => {
            this.accountListeners.delete(callback);
        };
    }
}

function mapAccounts(ext: InjectedExtension): SignerAccount[] {
    return mapInjectedAccounts(ext.getAccounts());
}

function mapInjectedAccounts(accounts: InjectedPolkadotAccount[]): SignerAccount[] {
    return accounts.map((acct) => ({
        address: acct.address,
        h160Address: deriveH160(acct.polkadotSigner.publicKey),
        publicKey: acct.polkadotSigner.publicKey,
        name: acct.name ?? null,
        source: "extension" as const,
        getSigner: () => acct.polkadotSigner,
    }));
}

if (import.meta.vitest) {
    const { test, expect, describe, vi } = import.meta.vitest;

    const mockPubKey = new Uint8Array(32).fill(0xaa);
    type Signer = import("polkadot-api").PolkadotSigner;
    const mockSigner = { publicKey: mockPubKey } as unknown as Signer;

    function makeMockApi(options: {
        extensions?: string[];
        accounts?: Array<{ address: string; name?: string }>;
        connectError?: Error;
    }): ExtensionApi {
        const polkadotAccounts = (options.accounts ?? []).map((a) => ({
            address: a.address,
            name: a.name,
            polkadotSigner: mockSigner,
        }));

        const mockExtension: InjectedExtension = {
            name: "mock-extension",
            getAccounts: () => polkadotAccounts,
            subscribe: (_cb) => () => {},
            disconnect: vi.fn(),
        };

        return {
            getInjectedExtensions: () => options.extensions ?? [],
            connectInjectedExtension: options.connectError
                ? () => Promise.reject(options.connectError)
                : () => Promise.resolve(mockExtension),
        };
    }

    describe("ExtensionProvider", () => {
        test("returns EXTENSION_NOT_FOUND when no extensions detected", async () => {
            const api = makeMockApi({ extensions: [] });
            const provider = new ExtensionProvider({ injectionWait: 0, api });
            const result = await provider.connect();

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.type).toBe("EXTENSION_NOT_FOUND");
            }
        });

        test("returns EXTENSION_NOT_FOUND for specific missing extension", async () => {
            const api = makeMockApi({ extensions: ["talisman"] });
            const provider = new ExtensionProvider({
                extensionName: "polkadot-js",
                injectionWait: 0,
                api,
            });
            const result = await provider.connect();

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.type).toBe("EXTENSION_NOT_FOUND");
                if (result.error.type === "EXTENSION_NOT_FOUND") {
                    expect(result.error.extensionName).toBe("polkadot-js");
                }
            }
        });

        test("returns EXTENSION_REJECTED when enable fails", async () => {
            const api = makeMockApi({
                extensions: ["talisman"],
                connectError: new Error("User rejected"),
            });
            const provider = new ExtensionProvider({
                extensionName: "talisman",
                injectionWait: 0,
                api,
            });
            const result = await provider.connect();

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.type).toBe("EXTENSION_REJECTED");
            }
        });

        test("maps accounts correctly on success", async () => {
            const api = makeMockApi({
                extensions: ["talisman"],
                accounts: [
                    { address: "5GrwvaEF...", name: "My Account" },
                    { address: "5FHneW46...", name: "Second" },
                ],
            });
            const provider = new ExtensionProvider({ injectionWait: 0, api });
            const result = await provider.connect();

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toHaveLength(2);
                expect(result.value[0].address).toBe("5GrwvaEF...");
                expect(result.value[0].name).toBe("My Account");
                expect(result.value[0].source).toBe("extension");
                expect(result.value[1].address).toBe("5FHneW46...");
            }
        });

        test("accounts without names have null name", async () => {
            const api = makeMockApi({
                extensions: ["test-ext"],
                accounts: [{ address: "5GrwvaEF..." }],
            });
            const provider = new ExtensionProvider({ injectionWait: 0, api });
            const result = await provider.connect();

            if (result.ok) {
                expect(result.value[0].name).toBeNull();
            }
        });

        test("disconnect cleans up extension", async () => {
            const api = makeMockApi({
                extensions: ["test-ext"],
                accounts: [{ address: "5GrwvaEF..." }],
            });
            const provider = new ExtensionProvider({ injectionWait: 0, api });
            await provider.connect();

            provider.disconnect();
            // No error thrown = success
        });

        test("disconnect is idempotent", () => {
            const provider = new ExtensionProvider({ injectionWait: 0 });
            provider.disconnect();
            provider.disconnect();
        });

        test("AbortSignal cancels during injection wait", async () => {
            const controller = new AbortController();
            controller.abort();

            const api = makeMockApi({ extensions: ["talisman"] });
            const provider = new ExtensionProvider({ injectionWait: 5000, api });
            const result = await provider.connect(controller.signal);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.type).toBe("EXTENSION_NOT_FOUND");
            }
        });

        test("connects to first available when no extensionName specified", async () => {
            let connectedName: string | undefined;
            const api: ExtensionApi = {
                getInjectedExtensions: () => ["first-ext", "second-ext"],
                connectInjectedExtension: async (name) => {
                    connectedName = name;
                    return {
                        name,
                        getAccounts: () => [],
                        subscribe: () => () => {},
                        disconnect: () => {},
                    };
                },
            };
            const provider = new ExtensionProvider({ injectionWait: 0, api });
            await provider.connect();

            expect(connectedName).toBe("first-ext");
        });

        test("onStatusChange returns no-op unsubscribe", () => {
            const provider = new ExtensionProvider();
            const unsub = provider.onStatusChange(() => {});
            expect(typeof unsub).toBe("function");
            unsub();
        });

        test("onAccountsChange adds and removes listener", () => {
            const provider = new ExtensionProvider();
            const cb = () => {};
            const unsub = provider.onAccountsChange(cb);
            expect(typeof unsub).toBe("function");
            unsub();
        });

        test("type is 'extension'", () => {
            const provider = new ExtensionProvider();
            expect(provider.type).toBe("extension");
        });

        test("uses custom dappName", async () => {
            let usedDappName: string | undefined;
            const api: ExtensionApi = {
                getInjectedExtensions: () => ["ext"],
                connectInjectedExtension: async (_name, dappName) => {
                    usedDappName = dappName;
                    return {
                        name: "ext",
                        getAccounts: () => [],
                        subscribe: () => () => {},
                        disconnect: () => {},
                    };
                },
            };
            const provider = new ExtensionProvider({
                dappName: "MyApp",
                injectionWait: 0,
                api,
            });
            await provider.connect();

            expect(usedDappName).toBe("MyApp");
        });

        test("getSigner returns signer from injected account", async () => {
            const api = makeMockApi({
                extensions: ["ext"],
                accounts: [{ address: "5GrwvaEF..." }],
            });
            const provider = new ExtensionProvider({ injectionWait: 0, api });
            const result = await provider.connect();

            if (result.ok) {
                const signer = result.value[0].getSigner();
                expect(signer.publicKey).toEqual(mockPubKey);
            }
        });

        test("subscription callback fires onAccountsChange listeners", async () => {
            let subscribeCb: ((accounts: InjectedPolkadotAccount[]) => void) | undefined;
            const api: ExtensionApi = {
                getInjectedExtensions: () => ["test-ext"],
                connectInjectedExtension: async () => ({
                    name: "test-ext",
                    getAccounts: () => [
                        { address: "5Initial", name: "Initial", polkadotSigner: mockSigner },
                    ],
                    subscribe: (cb) => {
                        subscribeCb = cb;
                        return () => {};
                    },
                    disconnect: () => {},
                }),
            };
            const provider = new ExtensionProvider({ injectionWait: 0, api });

            const receivedAccounts: SignerAccount[][] = [];
            provider.onAccountsChange((accounts) => receivedAccounts.push(accounts));

            await provider.connect();

            // Simulate account change from extension
            subscribeCb!([
                { address: "5NewAddr1", name: "New1", polkadotSigner: mockSigner },
                { address: "5NewAddr2", name: "New2", polkadotSigner: mockSigner },
            ]);

            expect(receivedAccounts).toHaveLength(1);
            expect(receivedAccounts[0]).toHaveLength(2);
            expect(receivedAccounts[0][0].address).toBe("5NewAddr1");
            expect(receivedAccounts[0][1].address).toBe("5NewAddr2");
        });
    });
}
