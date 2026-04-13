import { getChainAPI, destroyAll } from "@polkadot-apps/chain-client";
import type { ChainClient, PresetChains } from "@polkadot-apps/chain-client";

// Preset path — zero-config, built-in descriptors + RPCs.
// For BYOD, use createChainClient({ chains, rpcs }) instead.

let clientPromise: Promise<ChainClient<PresetChains<"paseo">>> | null = null;

export async function getApi(): Promise<ChainClient<PresetChains<"paseo">>> {
    if (!clientPromise) {
        clientPromise = getChainAPI("paseo");
    }
    return clientPromise;
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
    clientPromise = null;
    destroyAll();
}
