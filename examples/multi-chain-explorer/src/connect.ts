import { getChainAPI, destroyAll } from "@polkadot-apps/chain-client";

export async function connect() {
  console.log("Connecting to Paseo testnet...");
  const api = await getChainAPI("paseo");
  console.log("Connected to Paseo testnet.");
  return api;
}

export { destroyAll };
