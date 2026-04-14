import type { ChainClient, PresetChains } from "@polkadot-apps/chain-client";
import type { AccountBalance } from "@polkadot-apps/utils";
import type { AuthorizationStatus } from "@polkadot-apps/bulletin";
import { createInkSdk } from "@polkadot-api/sdk-ink";
import { Enum } from "polkadot-api";
import { DEV_PHRASE } from "@polkadot-labs/hdkd-helpers";
import { submitAndWatch, ensureAccountMapped } from "@polkadot-apps/tx";
import { prepareSigner } from "../project.js";
import { getSessionSigner } from "./session.js";

type PaseoClient = ChainClient<PresetChains<"paseo">>;

const MIN_BALANCE = 10_000_000_000n; // 1 PAS
export const FUND_AMOUNT = 100_000_000_000n; // 10 PAS
export const BULLETIN_TRANSACTIONS = 1000;
export const BULLETIN_BYTES = 100_000_000n; // 100 MB

export interface AccountStatus {
    balance: AccountBalance;
    mapped: boolean;
    auth: AuthorizationStatus;
}

/**
 * Fetch the account's on-chain status: Asset Hub balance, Revive mapping, and Bulletin allowance.
 * All queries use best-block to stay consistent with transactions that resolve at best-block.
 */
export async function fetchAccountStatus(
    client: PaseoClient,
    address: string,
): Promise<AccountStatus> {
    const AT_BEST = { at: "best" as const };

    // Balance at best-block
    const account = await client.assetHub.query.System.Account.getValue(address, AT_BEST);
    const balance: AccountBalance = {
        free: account.data.free,
        reserved: account.data.reserved,
        frozen: account.data.frozen,
    };

    // Mapping check — inkSdk created with atBest: true already queries best-block
    const inkSdk = createInkSdk(client.raw.assetHub, { atBest: true });
    const mapped = await inkSdk.addressIsMapped(address);

    // Bulletin allowance at best-block
    const authRaw = await client.bulletin.query.TransactionStorage.Authorizations.getValue(
        Enum("Account", address),
        AT_BEST,
    );
    const auth: AuthorizationStatus = authRaw
        ? {
              authorized: true,
              remainingTransactions: authRaw.extent.transactions,
              remainingBytes: authRaw.extent.bytes,
              expiration: authRaw.expiration,
          }
        : { authorized: false, remainingTransactions: 0, remainingBytes: 0n, expiration: 0 };

    return { balance, mapped, auth };
}

/**
 * Transfer PAS from Alice to the given address on Asset Hub.
 * Returns the new balance after funding.
 */
export async function fundFromAlice(client: PaseoClient, address: string): Promise<void> {
    const alice = prepareSigner(DEV_PHRASE, "//Alice");
    await submitAndWatch(
        client.assetHub.tx.Balances.transfer_keep_alive({
            dest: Enum("Id", address),
            value: FUND_AMOUNT,
        }),
        alice.signer,
    );
}

/**
 * Map the account for the Revive pallet.
 * Uses the provided signer if given, otherwise falls back to the QR session signer.
 */
export async function mapAccount(client: PaseoClient, address: string): Promise<void> {
    const session = await getSessionSigner();
    if (!session) {
        throw new Error("No session available for signing");
    }
    const inkSdk = createInkSdk(client.raw.assetHub, { atBest: true });
    await ensureAccountMapped(address, session.signer, inkSdk, client.assetHub);
}

/**
 * Grant Bulletin storage allowance from Alice.
 */
export async function grantBulletinAllowance(client: PaseoClient, address: string): Promise<void> {
    const alice = prepareSigner(DEV_PHRASE, "//Alice");
    await submitAndWatch(
        client.bulletin.tx.TransactionStorage.authorize_account({
            who: address,
            transactions: BULLETIN_TRANSACTIONS,
            bytes: BULLETIN_BYTES,
        }),
        alice.signer,
    );
}

/** Whether the account needs funding. */
export function needsFunding(balance: AccountBalance): boolean {
    return balance.free < MIN_BALANCE;
}
