# Chain Connection Examples

Real-world patterns for connecting to Polkadot chains using `@polkadot-apps/chain-client`.

> **Only the "paseo" environment is currently available.** All examples use `"paseo"`.

## Preset Path (Zero-Config)

### Query Account Balance on Asset Hub

```ts
import { getChainAPI, destroyAll } from "@polkadot-apps/chain-client";

const client = await getChainAPI("paseo");

const address = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
const account = await client.assetHub.query.System.Account.getValue(address);

console.log("Nonce:", account.nonce);
console.log("Free balance:", account.data.free);
console.log("Reserved:", account.data.reserved);
console.log("Frozen:", account.data.frozen);

destroyAll();
```

### Query Block Number

```ts
import { getChainAPI, destroyAll } from "@polkadot-apps/chain-client";

const client = await getChainAPI("paseo");

// Current block number on Asset Hub
const blockNumber = await client.assetHub.query.System.Number.getValue();
console.log("Asset Hub block:", blockNumber);

destroyAll();
```

### Query Runtime Version (Constants)

```ts
import { getChainAPI, destroyAll } from "@polkadot-apps/chain-client";

const client = await getChainAPI("paseo");

// Constants are accessed via client.<chain>.constants.<Pallet>.<Constant>()
const version = await client.assetHub.constants.System.Version();
console.log("Spec name:", version.spec_name);
console.log("Spec version:", version.spec_version);
console.log("Impl version:", version.impl_version);

destroyAll();
```

### Use Typed API for Chain-Specific Calls

Each chain's typed API provides access to that chain's specific pallets:

```ts
import { getChainAPI, destroyAll } from "@polkadot-apps/chain-client";

const client = await getChainAPI("paseo");

// Bulletin chain -- TransactionStorage pallet
const byteFee = await client.bulletin.query.TransactionStorage.ByteFee.getValue();
console.log("Byte fee:", byteFee);

// Individuality chain -- Identity pallet
const address = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
const identity = await client.individuality.query.Identity.IdentityOf.getValue(address);
console.log("Identity:", identity);

destroyAll();
```

### Multi-Chain Query Pattern

`getChainAPI` returns all three chains at once. Use them in parallel:

```ts
import { getChainAPI, destroyAll } from "@polkadot-apps/chain-client";

const client = await getChainAPI("paseo");

const address = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";

// Query multiple chains in parallel
const [account, byteFee, identity] = await Promise.all([
  client.assetHub.query.System.Account.getValue(address),
  client.bulletin.query.TransactionStorage.ByteFee.getValue(),
  client.individuality.query.Identity.IdentityOf.getValue(address),
]);

console.log("Balance:", account.data.free);
console.log("Byte fee:", byteFee);
console.log("Identity:", identity);

destroyAll();
```

## BYOD Path (Bring Your Own Descriptors)

> **Size savings:** BYOD imports only the descriptors you actually use. A single-chain app (e.g., bulletin-only) loads ~900 KB of descriptors vs ~6.3 MB when the full preset pulls in all three chains. For production apps, BYOD is the recommended path.

### Connect to a Subset of Chains

Only connect to the chains you need -- no unnecessary connections:

```ts
import { createChainClient } from "@polkadot-apps/chain-client";
import { paseo_asset_hub } from "@polkadot-apps/descriptors/paseo-asset-hub";

// Only Asset Hub -- no bulletin or individuality connections
const client = await createChainClient({
  chains: { assetHub: paseo_asset_hub },
  rpcs: { assetHub: ["wss://sys.ibp.network/asset-hub-paseo"] },
});

const account = await client.assetHub.query.System.Account.getValue("5G...");
console.log("Free balance:", account.data.free);

client.destroy();
```

### Connect with Custom RPCs

Provide your own RPC endpoints for all chains:

```ts
import { createChainClient } from "@polkadot-apps/chain-client";
import { paseo_asset_hub } from "@polkadot-apps/descriptors/paseo-asset-hub";
import { bulletin } from "@polkadot-apps/descriptors/bulletin";
import { individuality } from "@polkadot-apps/descriptors/individuality";

const client = await createChainClient({
  chains: { assetHub: paseo_asset_hub, bulletin, individuality },
  rpcs: {
    assetHub: ["wss://my-custom-rpc.example.com/asset-hub-paseo"],
    bulletin: ["wss://my-custom-rpc.example.com/bulletin"],
    individuality: ["wss://my-custom-rpc.example.com/individuality"],
  },
});

const blockNumber = await client.assetHub.query.System.Number.getValue();
console.log("Asset Hub block:", blockNumber);

client.destroy();
```

### Connect with Custom Chain Names

You choose the chain names in the config -- they become the typed API keys:

```ts
import { createChainClient } from "@polkadot-apps/chain-client";
import { paseo_asset_hub } from "@polkadot-apps/descriptors/paseo-asset-hub";
import { bulletin } from "@polkadot-apps/descriptors/bulletin";

const client = await createChainClient({
  chains: { hub: paseo_asset_hub, txStore: bulletin },
  rpcs: {
    hub: ["wss://sys.ibp.network/asset-hub-paseo"],
    txStore: ["wss://paseo-bulletin-rpc.polkadot.io"],
  },
});

// Access via your custom names
const account = await client.hub.query.System.Account.getValue("5G...");
const fee = await client.txStore.query.TransactionStorage.ByteFee.getValue();

// Raw clients use the same names
const rawHub = client.raw.hub;
const rawTxStore = client.raw.txStore;

client.destroy();
```

### Provide Connection Metadata

Override connection mode or supply light-client chain specs:

```ts
import { createChainClient } from "@polkadot-apps/chain-client";
import { paseo_asset_hub } from "@polkadot-apps/descriptors/paseo-asset-hub";

const client = await createChainClient({
  chains: { assetHub: paseo_asset_hub },
  rpcs: { assetHub: ["wss://sys.ibp.network/asset-hub-paseo"] },
  meta: {
    assetHub: {
      mode: "rpc",  // force RPC mode (default)
      // relayChainSpec and paraChainSpec for light client mode
    },
  },
});

const account = await client.assetHub.query.System.Account.getValue("5G...");
client.destroy();
```

## Using the Raw PolkadotClient

Both paths expose raw `PolkadotClient` instances via `.raw`:

```ts
import { getChainAPI } from "@polkadot-apps/chain-client";

const client = await getChainAPI("paseo");

// Access raw PolkadotClient for each chain
const rawAssetHub = client.raw.assetHub;
const rawBulletin = client.raw.bulletin;
const rawIndividuality = client.raw.individuality;

// Use for any PolkadotClient API
// (e.g., subscribing to finalized blocks, low-level calls, etc.)
```

## Contract Interactions (via InkSdk)

The `ChainClient` does not have a `.contracts` property. Create an `InkSdk` yourself from the raw client.

### With Preset Path

```ts
import { getChainAPI, destroyAll } from "@polkadot-apps/chain-client";
import { createInkSdk } from "@polkadot-api/sdk-ink";

const client = await getChainAPI("paseo");

// Create InkSdk from the raw asset hub client
const inkSdk = createInkSdk(client.raw.assetHub, { atBest: true });

// Get a contract instance (requires a contract descriptor from @polkadot-api/sdk-ink)
const contract = inkSdk.getContract(myContractDescriptor, contractAddress);

// Call contract methods through the typed contract instance
// (specific methods depend on the contract's ABI)

destroyAll();
```

### With BYOD Path

```ts
import { createChainClient } from "@polkadot-apps/chain-client";
import { createInkSdk } from "@polkadot-api/sdk-ink";
import { paseo_asset_hub } from "@polkadot-apps/descriptors/paseo-asset-hub";

const client = await createChainClient({
  chains: { assetHub: paseo_asset_hub },
  rpcs: { assetHub: ["wss://sys.ibp.network/asset-hub-paseo"] },
});

// Create InkSdk from the raw asset hub client
const inkSdk = createInkSdk(client.raw.assetHub, { atBest: true });

const contract = inkSdk.getContract(myContractDescriptor, contractAddress);

// Pass inkSdk to @polkadot-apps/contracts for higher-level ergonomics:
// const manager = new ContractManager(cdmJson, inkSdk, { signerManager });

client.destroy();
```

## Cleanup Patterns

Always destroy connections when done. For long-lived apps, use `client.destroy()`:

```ts
import { getChainAPI, destroyAll } from "@polkadot-apps/chain-client";

// Option 1: Destroy a single client's connections
const client = await getChainAPI("paseo");
// ... use client ...
client.destroy(); // Only tears down this client's connections

// Option 2: Destroy all connections at once
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

const client = await getChainAPI("paseo");

// After connecting
console.log(isConnected(bulletin)); // true

// Get the raw PolkadotClient if needed (two ways)
const rawFromHelper = getClient(bulletin);         // via descriptor
const rawFromClient = client.raw.bulletin;          // via .raw property
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
const typedApi = client.getTypedApi(paseo_asset_hub);

const account = await typedApi.query.System.Account.getValue("5G...");
console.log("Balance:", account.data.free);

client.destroy();
```

## Idempotent Connection Pattern

Both `getChainAPI` and `createChainClient` cache and deduplicate, so they are safe to call from multiple places:

```ts
import { getChainAPI } from "@polkadot-apps/chain-client";

// In module A
async function getBalance(addr: string) {
  const client = await getChainAPI("paseo"); // creates connection on first call
  return client.assetHub.query.System.Account.getValue(addr);
}

// In module B
async function getBlockNumber() {
  const client = await getChainAPI("paseo"); // returns cached connection
  return client.assetHub.query.System.Number.getValue();
}

// Both modules share the same underlying connections
```
