import type { getChainAPI } from "@polkadot-apps/chain-client";

type ChainAPI = Awaited<ReturnType<typeof getChainAPI>>;

export async function queryState(api: ChainAPI) {
  console.log("\n--- Chain State ---");

  const blockNumber = await api.assetHub.query.System.Number.getValue();
  console.log(`Current block number: ${blockNumber}`);

  const runtimeVersion =
    await api.assetHub.constants.System.Version();
  console.log(`Spec name: ${runtimeVersion.spec_name}`);
  console.log(`Spec version: ${runtimeVersion.spec_version}`);
  console.log(`Impl version: ${runtimeVersion.impl_version}`);
}
