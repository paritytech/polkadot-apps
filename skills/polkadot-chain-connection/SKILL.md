---
name: polkadot-chain-connection
description: Connect to Polkadot chains (Asset Hub, Bulletin, Individuality) using typed APIs from @polkadot-apps/chain-client and @polkadot-apps/descriptors.
---

# Polkadot Chain Connection

Connect to Polkadot ecosystem chains with fully typed APIs powered by polkadot-api (papi) descriptors.

> **WARNING: Only the "paseo" environment is currently available.** Calling `getChainAPI("polkadot")` or `getChainAPI("kusama")` will throw.

> **WARNING: Descriptors use subpath imports only.** Import `@polkadot-apps/descriptors/bulletin`, never `@polkadot-apps/descriptors`.

## Quick Start

```ts
import { getChainAPI, destroyAll } from "@polkadot-apps/chain-client";

const api = await getChainAPI("paseo");
const account = await api.assetHub.query.System.Account.getValue("5G...");
console.log("Free balance:", account.data.free);
destroyAll();
```

## Packages

| Package | Purpose |
|---|---|
| `@polkadot-apps/chain-client` | High-level connection manager. Creates typed APIs for all chains in an environment. |
| `@polkadot-apps/descriptors` | Pre-generated papi descriptors. Subpath imports per chain. |
| `@polkadot-apps/host` | Container detection (Polkadot Browser / Polkadot Desktop). Re-exported by chain-client. |

## Environments

```ts
type Environment = "polkadot" | "kusama" | "paseo";
```

Each environment connects to three chains:
- **Asset Hub** -- parachain for assets, balances, and smart contracts (environment-specific: polkadot-asset-hub, kusama-asset-hub, or paseo-asset-hub)
- **Bulletin** -- chain for transaction storage (shared genesis across environments)
- **Individuality** -- chain for identity/people (shared genesis across environments)

**Currently available:** Only `"paseo"` has live RPCs for all three chains.

## How ChainAPI Works

`getChainAPI(env)` returns a `ChainAPI<E>` object with four fields:

```ts
type ChainAPI<E extends Environment> = {
  assetHub: TypedApi<AssetHubDescriptors[E]>;  // environment-specific asset hub
  bulletin: TypedApi<typeof BulletinDef>;        // Bulletin chain
  individuality: TypedApi<typeof IndividualityDef>; // Individuality chain
  contracts: ContractSdk;                         // Ink! contract SDK on asset hub
  destroy: () => void;                            // Tear down this environment's connections
};
```

Each typed API provides fully typed access to storage queries, transactions, constants, and events for that chain.

### Using Typed APIs

```ts
const api = await getChainAPI("paseo");

// Storage queries
const account = await api.assetHub.query.System.Account.getValue(address);
const blockNumber = await api.assetHub.query.System.Number.getValue();

// Bulletin chain queries
const byteFee = await api.bulletin.query.TransactionStorage.ByteFee.getValue();

// Individuality chain queries
const identity = await api.individuality.query.Identity.IdentityOf.getValue(address);

// Constants (synchronous access to on-chain constants)
const version = await api.assetHub.constants.System.Version();
console.log(`Runtime: ${version.spec_name} v${version.spec_version}`);

// Transactions (build but don't submit — see polkadot-transactions skill)
const tx = api.assetHub.tx.System.remark({ remark: Binary.fromText("hello") });

// Transfers require MultiAddress enum for dest parameter
const transfer = api.assetHub.tx.Balances.transfer_keep_alive({
  dest: { type: "Id", value: recipientSs58 },  // MultiAddress.Id
  value: 1_000_000_000n,
});
```

### Using the Contracts SDK

The `contracts` field is an Ink! SDK (`@polkadot-api/sdk-ink`) bound to the asset hub client:

```ts
const api = await getChainAPI("paseo");
const contract = api.contracts.getContract(contractDescriptor, contractAddress);
```

## Connection Lifecycle

### Initialize

```ts
import { getChainAPI } from "@polkadot-apps/chain-client";

// First call creates connections; subsequent calls return cached instance
const api = await getChainAPI("paseo");
```

`getChainAPI` is idempotent -- calling it multiple times with the same environment returns the same cached promise. Concurrent calls are deduplicated.

### Use

Access chains via `api.assetHub`, `api.bulletin`, `api.individuality`, or `api.contracts`.

### Destroy

```ts
import { destroyAll } from "@polkadot-apps/chain-client";

// Destroy a single environment
api.destroy();

// Or destroy all environments at once
destroyAll();
```

`destroyAll()` disconnects all clients, clears the cache, and terminates the smoldot light client if running.

### Utility Functions

```ts
import { getClient, isConnected, isInsideContainer } from "@polkadot-apps/chain-client";

// Check if running inside Polkadot Browser / Desktop
const inContainer = await isInsideContainer();

// Check if a chain is connected (sync, no side effects)
import { bulletin } from "@polkadot-apps/descriptors/bulletin";
const connected = isConnected(bulletin);

// Get the raw PolkadotClient for a connected chain
const client = getClient(bulletin);
```

## Connection Strategy

`chain-client` automatically selects the best connection method:

1. **Host routing** -- If running inside a Polkadot container (detected via `@polkadot-apps/host`), connections route through the host's `product-sdk`.
2. **Direct RPC** -- Falls back to WebSocket RPC endpoints when outside a container.
3. **Light client** -- Smoldot-based connections when chain specs are available (not currently used for default chains).

## Descriptors

Descriptors are pre-generated type definitions from live chain metadata. They enable fully typed storage queries, transactions, and events.

**Always use subpath imports:**

```ts
// Correct
import { paseo_asset_hub } from "@polkadot-apps/descriptors/paseo-asset-hub";
import { bulletin } from "@polkadot-apps/descriptors/bulletin";
import { individuality } from "@polkadot-apps/descriptors/individuality";

// WRONG -- there is no barrel export
// import { bulletin } from "@polkadot-apps/descriptors";
```

Available subpaths:
- `@polkadot-apps/descriptors/polkadot-asset-hub`
- `@polkadot-apps/descriptors/kusama-asset-hub`
- `@polkadot-apps/descriptors/paseo-asset-hub`
- `@polkadot-apps/descriptors/bulletin`
- `@polkadot-apps/descriptors/individuality`

See [references/descriptors-guide.md](references/descriptors-guide.md) for details on adding new chains.

## PAPI Enum Parameters

Many chain calls use Rust enum types. In polkadot-api, pass enums as tagged objects:

```ts
// MultiAddress (used in Balances transfers, staking, etc.)
{ type: "Id", value: ss58Address }        // AccountId32 — most common
{ type: "Index", value: accountIndex }     // Compact index
{ type: "Address20", value: h160Address }  // H160/EVM address

// Example: transfer
api.assetHub.tx.Balances.transfer_keep_alive({
  dest: { type: "Id", value: "5GrwvaEF..." },
  value: 1_000_000_000n,
});
```

## Common Mistakes

### Forgetting to await getChainAPI

```ts
// WRONG -- getChainAPI returns a Promise
const api = getChainAPI("paseo");
api.assetHub.query.System.Account.getValue(addr); // TypeError!

// Correct
const api = await getChainAPI("paseo");
```

### Not calling destroyAll

Leaking connections causes WebSocket handles to stay open. Always clean up in app teardown, test afterAll, or process exit handlers.

### Using unavailable environments

```ts
// WRONG -- throws "Chain API for "polkadot" is not yet available"
const api = await getChainAPI("polkadot");

// Correct -- only paseo is available today
const api = await getChainAPI("paseo");
```

### Importing descriptors without subpath

```ts
// WRONG -- no barrel export exists
import { bulletin } from "@polkadot-apps/descriptors";

// Correct
import { bulletin } from "@polkadot-apps/descriptors/bulletin";
```

## Reference Files

- [chain-client-api.md](references/chain-client-api.md) -- Full API surface of `@polkadot-apps/chain-client`
- [descriptors-guide.md](references/descriptors-guide.md) -- How descriptors work, subpath imports, adding new chains
- [examples.md](references/examples.md) -- Real-world usage patterns and code examples
