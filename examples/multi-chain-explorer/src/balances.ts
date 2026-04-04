import type { getChainAPI } from "@polkadot-apps/chain-client";
import { ss58Encode, truncateAddress } from "@polkadot-apps/address";
import { getDevPublicKey } from "@polkadot-apps/tx";

type ChainAPI = Awaited<ReturnType<typeof getChainAPI>>;

export async function queryBalance(api: ChainAPI) {
  console.log("\n--- Alice's Balance ---");

  const alicePubKey = getDevPublicKey("Alice");
  const aliceAddress = ss58Encode(alicePubKey, 42);
  console.log(`Alice address: ${truncateAddress(aliceAddress)}`);

  const account = await api.assetHub.query.System.Account.getValue(
    aliceAddress,
  );
  console.log(`Free balance: ${account.data.free}`);
  console.log(`Reserved balance: ${account.data.reserved}`);
  console.log(`Nonce: ${account.nonce}`);
}
