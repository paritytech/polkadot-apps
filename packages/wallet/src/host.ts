/**
 * Host API wallet connector.
 *
 * Connects to the Host container via product-sdk's accountsProvider.
 * Does NOT call injectSpektrExtension() — it injects a competing PJS shim
 * that uses hostApi.sign_payload() (underscore) instead of hostApi.signPayload()
 * (camelCase), which interferes with getNonProductAccountSigner signing.
 *
 * @see reference-repos/task-rabbit/apps/frontend/src/lib/host/connection.ts
 */
import { AccountId } from "polkadot-api";
import type { PolkadotSigner } from "polkadot-api";
import type {
    Account,
    ConnectorResult,
    Unsubscribe,
    WalletConfig,
    WalletConnector,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 20_000;
const accountIdCodec = AccountId();

/** Race a promise against a timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Host API timed out after ${ms}ms`)), ms),
        ),
    ]);
}

type ProviderAccount = { publicKey: Uint8Array; name: string | undefined };

// product-sdk's createAccountsProvider() returns a complex type with ResultAsync (neverthrow).
// We use `any` because the SDK is an optional peer dep loaded dynamically.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AccountsProvider = any;

function buildAccounts(
    providerAccounts: ProviderAccount[],
    accountsProvider: AccountsProvider,
): Account[] {
    return providerAccounts.map((acct) => ({
        address: accountIdCodec.dec(acct.publicKey),
        name: acct.name ?? null,
        publicKey: acct.publicKey,
        polkadotSigner: accountsProvider.getNonProductAccountSigner({
            dotNsIdentifier: "",
            derivationIndex: 0,
            publicKey: acct.publicKey,
        }) as PolkadotSigner,
        source: "host" as const,
    }));
}

/** Fetch accounts from provider, returning empty array on failure or timeout. */
async function fetchAccounts(
    accountsProvider: AccountsProvider,
    timeoutMs: number,
): Promise<ProviderAccount[]> {
    const result = await withTimeout(
        Promise.resolve(accountsProvider.getNonProductAccounts()),
        timeoutMs,
    );
    return result.match(
        (a: ProviderAccount[]) => a,
        () => [] as ProviderAccount[],
    );
}

export function createHostConnector(): WalletConnector {
    let accountsSub: { unsubscribe(): void } | null = null;

    return {
        async connect(config: WalletConfig): Promise<ConnectorResult> {
            const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sdk: any = await import("@novasamatech/product-sdk");
            const accountsProvider: AccountsProvider = sdk.createAccountsProvider();

            const providerAccounts = await fetchAccounts(accountsProvider, timeoutMs);
            const accounts = buildAccounts(providerAccounts, accountsProvider);

            return {
                accounts,
                subscribe: (cb: (accounts: Account[]) => void): Unsubscribe => {
                    accountsSub = accountsProvider.subscribeAccountConnectionStatus(
                        (status: string) => {
                            if (status === "connected") {
                                void fetchAccounts(accountsProvider, timeoutMs).then(
                                    (newAccounts) =>
                                        cb(buildAccounts(newAccounts, accountsProvider)),
                                );
                            } else if (status === "disconnected") {
                                cb([]);
                            }
                        },
                    );
                    return () => {
                        accountsSub?.unsubscribe();
                        accountsSub = null;
                    };
                },
            };
        },

        disconnect(): void {
            accountsSub?.unsubscribe();
            accountsSub = null;
        },
    };
}

if (import.meta.vitest) {
    const { test, expect } = import.meta.vitest;

    test("withTimeout rejects after deadline", async () => {
        const slow = new Promise<string>((resolve) => setTimeout(() => resolve("late"), 500));
        await expect(withTimeout(slow, 10)).rejects.toThrow("timed out");
    });

    test("withTimeout resolves before deadline", async () => {
        const fast = Promise.resolve("ok");
        await expect(withTimeout(fast, 1000)).resolves.toBe("ok");
    });
}
