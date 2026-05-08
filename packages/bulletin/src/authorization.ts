import { createLogger } from "@polkadot-apps/logger";
import { Enum } from "polkadot-api";

import type { AuthorizationStatus, BulletinApi } from "./types.js";

const log = createLogger("bulletin");

const NOT_AUTHORIZED: AuthorizationStatus = Object.freeze({
    authorized: false,
    remainingTransactions: 0,
    remainingBytes: 0n,
    expiration: 0,
});

/**
 * Check whether an account is authorized to store data on the Bulletin Chain.
 *
 * Queries `TransactionStorage.Authorizations` for the given address and returns
 * the raw authorization quota. Use this as a pre-flight check before calling
 * {@link upload} to provide clear UX ("not authorized" / "insufficient quota")
 * instead of letting the transaction fail mid-execution.
 *
 * The expiration block number is returned as-is — the chain enforces expiration
 * at submission time, so callers can optionally compare against the current
 * block for display purposes.
 *
 * @param api     - Typed Bulletin Chain API instance.
 * @param address - SS58-encoded account address to check.
 * @returns Authorization status with remaining quota.
 *
 * @example
 * ```ts
 * import { checkAuthorization } from "@polkadot-apps/bulletin";
 *
 * const auth = await checkAuthorization(api, address);
 * if (!auth.authorized) {
 *     console.error("Account is not authorized for bulletin storage");
 * } else if (auth.remainingBytes < BigInt(fileBytes.length)) {
 *     console.error(`Insufficient quota: ${auth.remainingBytes} bytes remaining`);
 * }
 * ```
 *
 * @see {@link BulletinClient.checkAuthorization} for the client method equivalent.
 */
export async function checkAuthorization(
    api: BulletinApi,
    address: string,
): Promise<AuthorizationStatus> {
    let auth;
    try {
        auth = await api.query.TransactionStorage.Authorizations.getValue(Enum("Account", address));
    } catch (error) {
        log.error("checkAuthorization: query failed", { address, error });
        throw new Error(`Failed to check authorization for ${address}`, { cause: error });
    }

    if (!auth) {
        log.debug("checkAuthorization: no authorization found", { address });
        return NOT_AUTHORIZED;
    }

    // After polkadot-bulletin-chain PR #448 (e543696, 2026-04-30), AuthorizationExtent's
    // `transactions` and `bytes` fields are *consumed counters*; the granted allowance moved
    // to `transactions_allowance` / `bytes_allowance`. Compute remaining = allowance − consumed
    // so the public `remainingTransactions` / `remainingBytes` contract stays semantically
    // honest.
    const status: AuthorizationStatus = {
        authorized: true,
        remainingTransactions: auth.extent.transactions_allowance - auth.extent.transactions,
        remainingBytes: auth.extent.bytes_allowance - auth.extent.bytes,
        expiration: auth.expiration,
    };

    log.debug("checkAuthorization", {
        address,
        remainingTransactions: status.remainingTransactions,
        remainingBytes: status.remainingBytes.toString(),
        expiration: status.expiration,
    });

    return status;
}

if (import.meta.vitest) {
    const { describe, test, expect, vi } = import.meta.vitest;

    function createMockApi(authResult: unknown) {
        return {
            query: {
                TransactionStorage: {
                    Authorizations: {
                        getValue: vi.fn().mockResolvedValue(authResult),
                    },
                },
            },
        } as unknown as BulletinApi;
    }

    describe("checkAuthorization", () => {
        test("returns not authorized when no authorization exists", async () => {
            const api = createMockApi(undefined);
            const status = await checkAuthorization(api, "5GrwvaEF...");

            expect(status.authorized).toBe(false);
            expect(status.remainingTransactions).toBe(0);
            expect(status.remainingBytes).toBe(0n);
            expect(status.expiration).toBe(0);
        });

        test("returns authorization with full quota (fresh authorize, nothing consumed)", async () => {
            const api = createMockApi({
                extent: {
                    transactions: 0,
                    transactions_allowance: 10,
                    bytes: 0n,
                    bytes_permanent: 0n,
                    bytes_allowance: 1_000_000n,
                },
                expiration: 999,
            });
            const status = await checkAuthorization(api, "5GrwvaEF...");

            expect(status.authorized).toBe(true);
            expect(status.remainingTransactions).toBe(10);
            expect(status.remainingBytes).toBe(1_000_000n);
            expect(status.expiration).toBe(999);
        });

        test("returns authorization with zero transactions remaining (fully consumed)", async () => {
            const api = createMockApi({
                extent: {
                    transactions: 5,
                    transactions_allowance: 5,
                    bytes: 0n,
                    bytes_permanent: 0n,
                    bytes_allowance: 1_000_000n,
                },
                expiration: 999,
            });
            const status = await checkAuthorization(api, "5GrwvaEF...");

            expect(status.authorized).toBe(true);
            expect(status.remainingTransactions).toBe(0);
        });

        test("returns authorization with zero bytes remaining (fully consumed)", async () => {
            const api = createMockApi({
                extent: {
                    transactions: 0,
                    transactions_allowance: 5,
                    bytes: 1_000n,
                    bytes_permanent: 0n,
                    bytes_allowance: 1_000n,
                },
                expiration: 999,
            });
            const status = await checkAuthorization(api, "5GrwvaEF...");

            expect(status.authorized).toBe(true);
            expect(status.remainingBytes).toBe(0n);
        });

        test("returns remaining = allowance − consumed when partially used", async () => {
            const api = createMockApi({
                extent: {
                    transactions: 3,
                    transactions_allowance: 10,
                    bytes: 250_000n,
                    bytes_permanent: 0n,
                    bytes_allowance: 1_000_000n,
                },
                expiration: 999,
            });
            const status = await checkAuthorization(api, "5GrwvaEF...");

            expect(status.authorized).toBe(true);
            expect(status.remainingTransactions).toBe(7); // 10 − 3
            expect(status.remainingBytes).toBe(750_000n); // 1M − 250K
        });

        test("preserves expiration block number", async () => {
            const api = createMockApi({
                extent: {
                    transactions: 0,
                    transactions_allowance: 1,
                    bytes: 0n,
                    bytes_permanent: 0n,
                    bytes_allowance: 500n,
                },
                expiration: 12345,
            });
            const status = await checkAuthorization(api, "5GrwvaEF...");

            expect(status.expiration).toBe(12345);
        });

        test("throws with contextual error when query fails", async () => {
            const api = {
                query: {
                    TransactionStorage: {
                        Authorizations: {
                            getValue: vi.fn().mockRejectedValue(new Error("RPC connection lost")),
                        },
                    },
                },
            } as unknown as BulletinApi;

            const err = await checkAuthorization(api, "5GrwvaEF...").catch((e: unknown) => e);
            expect(err).toBeInstanceOf(Error);
            const error = err as Error;
            expect(error.message).toBe("Failed to check authorization for 5GrwvaEF...");
            expect(error.cause).toBeInstanceOf(Error);
            expect((error.cause as Error).message).toBe("RPC connection lost");
        });

        test("passes correct Enum key to the query", async () => {
            const getValue = vi.fn().mockResolvedValue(undefined);
            const api = {
                query: {
                    TransactionStorage: {
                        Authorizations: { getValue },
                    },
                },
            } as unknown as BulletinApi;

            await checkAuthorization(api, "5GrwvaEF...");

            expect(getValue).toHaveBeenCalledTimes(1);
            const arg = getValue.mock.calls[0][0];
            expect(arg.type).toBe("Account");
            expect(arg.value).toBe("5GrwvaEF...");
        });
    });
}
