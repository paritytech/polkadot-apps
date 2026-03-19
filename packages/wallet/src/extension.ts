/**
 * Browser extension wallet connector.
 *
 * Uses polkadot-api/pjs-signer to connect to injected browser extensions
 * (Talisman, SubWallet, Polkadot.js, Nova, etc.).
 */
import type {
    Account,
    ConnectorResult,
    Unsubscribe,
    WalletConfig,
    WalletConnector,
} from "./types.js";

/** Delay before checking for extensions — they inject into window.injectedWeb3 async. */
const EXTENSION_INJECT_DELAY_MS = 500;
const EXTENSION_CONNECT_TIMEOUT_MS = 5_000;

/**
 * List available browser extension wallets.
 *
 * Waits briefly for extensions to finish injecting before checking.
 * Returns extension names (e.g. "talisman", "subwallet-js", "polkadot-js").
 */
export async function getAvailableExtensions(): Promise<string[]> {
    if (typeof window === "undefined") return [];
    await new Promise((r) => setTimeout(r, EXTENSION_INJECT_DELAY_MS));
    const { getInjectedExtensions } = await import("polkadot-api/pjs-signer");
    return getInjectedExtensions();
}

export function createExtensionConnector(extensionName: string): WalletConnector {
    let disconnected = false;
    let ext: Awaited<
        ReturnType<typeof import("polkadot-api/pjs-signer").connectInjectedExtension>
    > | null = null;

    return {
        async connect(config: WalletConfig): Promise<ConnectorResult> {
            const { connectInjectedExtension } = await import("polkadot-api/pjs-signer");

            ext = await Promise.race([
                connectInjectedExtension(extensionName),
                new Promise<never>((_, reject) =>
                    setTimeout(
                        () => reject(new Error(`Extension "${extensionName}" timed out`)),
                        config.timeoutMs ?? EXTENSION_CONNECT_TIMEOUT_MS,
                    ),
                ),
            ]);

            const rawAccounts = ext.getAccounts();
            const accounts: Account[] = rawAccounts.map((acct) => ({
                address: acct.address,
                name: acct.name ?? null,
                publicKey: new Uint8Array(0),
                polkadotSigner: acct.polkadotSigner,
                source: extensionName,
            }));

            return {
                accounts,
                subscribe: (cb: (accounts: Account[]) => void): Unsubscribe => {
                    const unsub = ext!.subscribe((rawAccounts) => {
                        if (disconnected) return;
                        cb(
                            rawAccounts.map((acct) => ({
                                address: acct.address,
                                name: acct.name ?? null,
                                publicKey: new Uint8Array(0),
                                polkadotSigner: acct.polkadotSigner,
                                source: extensionName,
                            })),
                        );
                    });
                    return unsub;
                },
            };
        },

        disconnect(): void {
            disconnected = true;
            ext?.disconnect();
            ext = null;
        },
    };
}

if (import.meta.vitest) {
    const { test, expect } = import.meta.vitest;

    test("getAvailableExtensions returns empty in Node", async () => {
        expect(await getAvailableExtensions()).toEqual([]);
    });
}
