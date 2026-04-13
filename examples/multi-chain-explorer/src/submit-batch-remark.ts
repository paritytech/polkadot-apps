import type { connect } from "./connect.js";
import { batchSubmitAndWatch, createDevSigner } from "@polkadot-apps/tx";
import { Binary } from "polkadot-api";

type Client = Awaited<ReturnType<typeof connect>>;

export async function submitBatchRemark(api: Client) {
    console.log("\n--- Submit Batched System.remarks ---");

    const alice = createDevSigner("Alice");

    // Build three remark transactions
    const tx1 = api.assetHub.tx.System.remark({
        remark: Binary.fromText("Batch remark 1"),
    });
    const tx2 = api.assetHub.tx.System.remark({
        remark: Binary.fromText("Batch remark 2"),
    });
    const tx3 = api.assetHub.tx.System.remark({
        remark: Binary.fromText("Batch remark 3"),
    });

    console.log("Submitting 3 remarks as atomic batch...");
    const result = await batchSubmitAndWatch([tx1, tx2, tx3], api.assetHub, alice, {
        onStatus: (status) => console.log(`  Status: ${status}`),
    });

    if (result.ok) {
        console.log(`Batch included in block #${result.block.number}`);
        console.log(`Block hash: ${result.block.hash}`);
        console.log(`Transaction hash: ${result.txHash}`);
    } else {
        console.error("Batch failed:", result.dispatchError);
    }
}
