import { getChainAPI, destroyAll } from "@polkadot-apps/chain-client";
import type { ChainAPI } from "@polkadot-apps/chain-client";

let apiPromise: Promise<ChainAPI<"paseo">> | null = null;

export async function getApi(): Promise<ChainAPI<"paseo">> {
    if (!apiPromise) {
        apiPromise = getChainAPI("paseo");
    }
    return apiPromise;
}

export async function getBalance(
    address: string,
): Promise<{ free: bigint; reserved: bigint; frozen: bigint }> {
    const api = await getApi();
    const account = await api.assetHub.query.System.Account.getValue(address);
    return {
        free: account.data.free,
        reserved: account.data.reserved,
        frozen: account.data.frozen,
    };
}

export function cleanup(): void {
    apiPromise = null;
    destroyAll();
}
