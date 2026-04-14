import type { ChainClient, PresetChains } from "@polkadot-apps/chain-client";
import type { AccountBalance } from "@polkadot-apps/utils";
import type { AuthorizationStatus } from "@polkadot-apps/bulletin";
import { getBalance } from "@polkadot-apps/utils";
import { checkAuthorization } from "@polkadot-apps/bulletin";
import { createInkSdk } from "@polkadot-api/sdk-ink";
import { Enum } from "polkadot-api";
import { DEV_PHRASE } from "@polkadot-labs/hdkd-helpers";
import { submitAndWatch, ensureAccountMapped } from "@polkadot-apps/tx";
import { createTerminalAdapter, createSessionSigner } from "@polkadot-apps/terminal";
import { prepareSigner } from "../project.js";

type PaseoClient = ChainClient<PresetChains<"paseo">>;

const MIN_BALANCE = 10_000_000_000n; // 1 PAS
export const FUND_AMOUNT = 100_000_000_000n; // 10 PAS
export const BULLETIN_TRANSACTIONS = 1000;
export const BULLETIN_BYTES = 100_000_000n; // 100 MB

const METADATA_URL =
    "https://gist.githubusercontent.com/ReinhardHatko/27415c91178d74196d7c1116d39056d5/raw/56e61d719251170828a80f12d34343a8617b9935/metadata.json";

export interface AccountStatus {
    balance: AccountBalance;
    mapped: boolean;
    auth: AuthorizationStatus;
}

/**
 * Fetch the account's on-chain status: Asset Hub balance, Revive mapping, and Bulletin allowance.
 */
export async function fetchAccountStatus(
    client: PaseoClient,
    address: string,
): Promise<AccountStatus> {
    const balance = await getBalance(client.assetHub, address);
    const inkSdk = createInkSdk(client.raw.assetHub, { atBest: true });
    const mapped = await inkSdk.addressIsMapped(address);
    const auth = await checkAuthorization(client.bulletin, address);

    return { balance, mapped, auth };
}

/**
 * Transfer PAS from Alice to the given address on Asset Hub.
 * Returns the new balance after funding.
 */
export async function fundFromAlice(client: PaseoClient, address: string): Promise<bigint> {
    const alice = prepareSigner(DEV_PHRASE, "//Alice");
    await submitAndWatch(
        client.assetHub.tx.Balances.transfer_keep_alive({
            dest: Enum("Id", address),
            value: FUND_AMOUNT,
        }),
        alice.signer,
    );
    const newBalance = await getBalance(client.assetHub, address);
    return newBalance.free;
}

/**
 * Map the account for the Revive pallet using the user's QR session signer.
 */
export async function mapAccount(client: PaseoClient, address: string): Promise<void> {
    const adapter = createTerminalAdapter({
        appId: "dot-cli",
        metadataUrl: METADATA_URL,
        endpoints: ["wss://paseo-people-next-rpc.polkadot.io"],
    });
    const session = await new Promise<any | null>((resolve) => {
        let resolved = false;
        let unsub: (() => void) | null = null;
        unsub = adapter.sessions.sessions.subscribe((sessions: any[]) => {
            if (sessions.length > 0 && !resolved) {
                resolved = true;
                queueMicrotask(() => unsub?.());
                resolve(sessions[0]);
            }
        });
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                unsub?.();
                resolve(null);
            }
        }, 3000);
    });
    if (!session) {
        throw new Error("No session available for signing");
    }
    const userSigner = createSessionSigner(session);
    const inkSdk = createInkSdk(client.raw.assetHub, { atBest: true });
    await ensureAccountMapped(address, userSigner, inkSdk, client.assetHub);
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
