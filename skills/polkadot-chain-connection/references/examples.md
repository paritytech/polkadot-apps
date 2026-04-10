# Chain Connection Examples

Real-world patterns for connecting to Polkadot chains using `@polkadot-apps/chain-client`.

> **Only the "paseo" environment is currently available.** All examples use `"paseo"`.

## Query Account Balance on Asset Hub

```ts
import { getChainAPI, destroyAll } from "@polkadot-apps/chain-client";

const api = await getChainAPI("paseo");

const address = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
const account = await api.assetHub.query.System.Account.getValue(address);

console.log("Nonce:", account.nonce);
console.log("Free balance:", account.data.free);
console.log("Reserved:", account.data.reserved);
console.log("Frozen:", account.data.frozen);

destroyAll();
```

## Query Block Number

```ts
import { getChainAPI, destroyAll } from "@polkadot-apps/chain-client";

const api = await getChainAPI("paseo");

// Current block number on Asset Hub
const blockNumber = await api.assetHub.query.System.Number.getValue();
console.log("Asset Hub block:", blockNumber);

destroyAll();
```

## Query Runtime Version (Constants)

```ts
import { getChainAPI, destroyAll } from "@polkadot-apps/chain-client";

const api = await getChainAPI("paseo");

// Constants are accessed via api.<chain>.constants.<Pallet>.<Constant>()
const version = await api.assetHub.constants.System.Version();
console.log("Spec name:", version.spec_name);
console.log("Spec version:", version.spec_version);
console.log("Impl version:", version.impl_version);

destroyAll();
```

## Use Typed API for Chain-Specific Calls

Each chain's typed API provides access to that chain's specific pallets:

```ts
import { getChainAPI, destroyAll } from "@polkadot-apps/chain-client";

const api = await getChainAPI("paseo");

// Bulletin chain -- TransactionStorage pallet
const byteFee = await api.bulletin.query.TransactionStorage.ByteFee.getValue();
console.log("Byte fee:", byteFee);

// Individuality chain -- Identity pallet
const address = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
const identity = await api.individuality.query.Identity.IdentityOf.getValue(address);
console.log("Identity:", identity);

destroyAll();
```

## Multi-Chain Query Pattern

`getChainAPI` returns all three chains at once. Use them in parallel:

```ts
import { getChainAPI, destroyAll } from "@polkadot-apps/chain-client";

const api = await getChainAPI("paseo");

const address = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";

// Query multiple chains in parallel
const [account, byteFee, identity] = await Promise.all([
  api.assetHub.query.System.Account.getValue(address),
  api.bulletin.query.TransactionStorage.ByteFee.getValue(),
  api.individuality.query.Identity.IdentityOf.getValue(address),
]);

console.log("Balance:", account.data.free);
console.log("Byte fee:", byteFee);
console.log("Identity:", identity);

destroyAll();
```

## Cleanup Pattern

Always destroy connections when done. For long-lived apps, use the environment-specific `destroy()`:

```ts
import { getChainAPI, destroyAll } from "@polkadot-apps/chain-client";

// Option 1: Destroy a single environment
const api = await getChainAPI("paseo");
// ... use api ...
api.destroy(); // Only tears down paseo connections

// Option 2: Destroy all environments at once
destroyAll(); // Tears down everything, terminates smoldot
```

For test suites, use `destroyAll()` in an `afterAll` or `afterEach` hook:

```ts
import { destroyAll } from "@polkadot-apps/chain-client";

afterAll(() => {
  destroyAll();
});
```

## Check Connection Status

```ts
import { getChainAPI, isConnected, getClient } from "@polkadot-apps/chain-client";
import { bulletin } from "@polkadot-apps/descriptors/bulletin";

// Before connecting
console.log(isConnected(bulletin)); // false

const api = await getChainAPI("paseo");

// After connecting
console.log(isConnected(bulletin)); // true

// Get the raw PolkadotClient if needed
const client = getClient(bulletin);
```

## Container Detection

Detect if running inside Polkadot Browser or Polkadot Desktop:

```ts
import { isInsideContainer } from "@polkadot-apps/chain-client";

const inContainer = await isInsideContainer();

if (inContainer) {
  console.log("Running inside Polkadot container -- connections route through host");
} else {
  console.log("Running standalone -- connections use direct RPC");
}
```

## Using Descriptors Directly (Low-Level)

For cases where you need the raw `polkadot-api` client without the `chain-client` wrapper:

```ts
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/web";
import { paseo_asset_hub } from "@polkadot-apps/descriptors/paseo-asset-hub";

const provider = getWsProvider("wss://sys.ibp.network/asset-hub-paseo");
const client = createClient(provider);
const api = client.getTypedApi(paseo_asset_hub);

const account = await api.query.System.Account.getValue("5G...");
console.log("Balance:", account.data.free);

client.destroy();
```

## Using the Contracts SDK

The `contracts` field on `ChainAPI` is an Ink! SDK for interacting with smart contracts deployed on asset hub:

```ts
import { getChainAPI, destroyAll } from "@polkadot-apps/chain-client";

const api = await getChainAPI("paseo");

// Get a contract instance (requires a contract descriptor from @polkadot-api/sdk-ink)
const contract = api.contracts.getContract(myContractDescriptor, contractAddress);

// Call contract methods through the typed contract instance
// (specific methods depend on the contract's ABI)

destroyAll();
```

## Idempotent Connection Pattern

`getChainAPI` caches and deduplicates, so it is safe to call from multiple places:

```ts
import { getChainAPI } from "@polkadot-apps/chain-client";

// In module A
async function getBalance(addr: string) {
  const api = await getChainAPI("paseo"); // creates connection on first call
  return api.assetHub.query.System.Account.getValue(addr);
}

// In module B
async function getBlockNumber() {
  const api = await getChainAPI("paseo"); // returns cached connection
  return api.assetHub.query.System.Number.getValue();
}

// Both modules share the same underlying connections
```
