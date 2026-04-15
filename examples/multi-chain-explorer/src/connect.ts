import { createChainClient, destroyAll } from "@polkadot-apps/chain-client";
import { paseo_asset_hub } from "@polkadot-apps/descriptors/paseo-asset-hub";
import { bulletin } from "@polkadot-apps/descriptors/bulletin";
import { individuality } from "@polkadot-apps/descriptors/individuality";

// BYOD path — bring your own descriptors and RPC endpoints.
// For zero-config, use getChainAPI("paseo") instead.
export async function connect() {
  console.log("Connecting to Paseo testnet...");
  const client = await createChainClient({
    chains: { assetHub: paseo_asset_hub, bulletin, individuality },
    rpcs: {
      assetHub: [
        "wss://asset-hub-paseo-rpc.n.dwellir.com",
        "wss://sys.ibp.network/asset-hub-paseo",
      ],
      bulletin: ["wss://paseo-bulletin-rpc.polkadot.io"],
      individuality: ["wss://paseo-people-next-rpc.polkadot.io"],
    },
  });
  console.log("Connected to Paseo testnet.");
  return client;
}

export { destroyAll };
