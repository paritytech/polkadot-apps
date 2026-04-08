import type { connect } from "./connect.js";
import { createDevSigner, submitAndWatch } from "@polkadot-apps/tx";
import { Binary } from "polkadot-api";

type Client = Awaited<ReturnType<typeof connect>>;

export async function submitRemark(api: Client) {
  console.log("\n--- Submit System.remark ---");

  const alice = createDevSigner("Alice");
  const remark = Binary.fromText("Hello from multi-chain explorer!");

  console.log("Building System.remark transaction...");
  const tx = api.assetHub.tx.System.remark({ remark });

  console.log("Submitting transaction...");
  const result = await submitAndWatch(tx, alice, {
    onStatus: (status) => console.log(`  Status: ${status}`),
  });

  if (result.ok) {
    console.log(`Transaction included in block #${result.block.number}`);
    console.log(`Block hash: ${result.block.hash}`);
  } else {
    console.error("Transaction failed:", result);
  }
}
