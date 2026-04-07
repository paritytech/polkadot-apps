import { connect, destroyAll } from "./connect.js";
import { queryState } from "./query-state.js";
import { queryBalance } from "./balances.js";
import { submitRemark } from "./submit-remark.js";
import { submitBatchRemark } from "./submit-batch-remark.js";

async function main() {
  console.log("=== Multi-Chain Explorer ===\n");

  const api = await connect();

  try {
    await queryState(api);
    await queryBalance(api);
    await submitRemark(api);
    await submitBatchRemark(api);
  } finally {
    console.log("\nCleaning up connections...");
    destroyAll();
    console.log("Done.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  destroyAll();
  process.exit(1);
});
