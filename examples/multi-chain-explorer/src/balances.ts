import type { connect } from "./connect.js";
import { ss58Encode, truncateAddress } from "@polkadot-apps/address";
import { getDevPublicKey } from "@polkadot-apps/tx";
import { getBalance, formatBalance } from "@polkadot-apps/utils";

type Client = Awaited<ReturnType<typeof connect>>;

export async function queryBalance(api: Client) {
  console.log("\n--- Alice's Balance ---");

  const alicePubKey = getDevPublicKey("Alice");
  const aliceAddress = ss58Encode(alicePubKey, 42);
  console.log(`Alice address: ${truncateAddress(aliceAddress)}`);

  const balance = await getBalance(api.assetHub, aliceAddress);
  console.log(`Free balance: ${formatBalance(balance.free, { symbol: "PAS" })}`);
  console.log(`Reserved balance: ${formatBalance(balance.reserved, { symbol: "PAS" })}`);
  console.log(`Frozen balance: ${formatBalance(balance.frozen, { symbol: "PAS" })}`);

  // Nonce is not part of AccountBalance — query System.Account directly when needed
  const account = await api.assetHub.query.System.Account.getValue(aliceAddress);
  console.log(`Nonce: ${account.nonce}`);
}
