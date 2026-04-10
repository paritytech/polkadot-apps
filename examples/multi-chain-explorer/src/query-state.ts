import type { connect } from "./connect.js";

type Client = Awaited<ReturnType<typeof connect>>;

export async function queryState(api: Client) {
  console.log("\n--- Chain State ---");

  const blockNumber = await api.assetHub.query.System.Number.getValue();
  console.log(`Current block number: ${blockNumber}`);

  const runtimeVersion =
    await api.assetHub.constants.System.Version();
  console.log(`Spec name: ${runtimeVersion.spec_name}`);
  console.log(`Spec version: ${runtimeVersion.spec_version}`);
  console.log(`Impl version: ${runtimeVersion.impl_version}`);
}
