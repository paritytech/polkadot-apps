---
name: polkadot-chain-connection
description: Connect to Polkadot chains (Asset Hub, Bulletin, Individuality) using typed APIs from @polkadot-apps/chain-client and @polkadot-apps/descriptors.
---

# Polkadot Chain Connection

Connect to Polkadot ecosystem chains with fully typed APIs powered by polkadot-api (papi) descriptors.

> **WARNING: Only the "paseo" environment is currently available.** Calling `getChainAPI("polkadot")` or `getChainAPI("kusama")` will throw.

> **WARNING: Descriptors use subpath imports only.** Import `@polkadot-apps/descriptors/bulletin`, never `@polkadot-apps/descriptors`.

## Two Ways to Connect

`@polkadot-apps/chain-client` offers two connection paths:

| Path | Function | When to Use |
|---|---|---|
| **BYOD** (bring your own descriptors) | `createChainClient(config)` | **Recommended for production.** Import only the chains you need, provide your own RPCs. Space-optimized. |
| **Preset** (zero-config) | `getChainAPI(env)` | Convenience / prototyping. Gives you Asset Hub + Bulletin + Individuality with built-in RPCs. No descriptor imports needed. |

Both return the same `ChainClient<T>` type.

> **Size note:** BYOD imports only the descriptors you need. A bulletin-only app loads ~900 KB vs ~6.3 MB for the full preset.

### BYOD (Bring Your Own Descriptors) -- Recommended

```ts
import { createChainClient } from "@polkadot-apps/chain-client";
import { paseo_asset_hub } from "@polkadot-apps/descriptors/paseo-asset-hub";
import { bulletin } from "@polkadot-apps/descriptors/bulletin";

const client = await createChainClient({
  chains: { assetHub: paseo_asset_hub, bulletin },
  rpcs: {
    assetHub: ["wss://sys.ibp.network/asset-hub-paseo"],
    bulletin: ["wss://paseo-bulletin-rpc.polkadot.io"],
  },
});

const account = await client.assetHub.query.System.Account.getValue("5G...");
const fee = await client.bulletin.query.TransactionStorage.ByteFee.getValue();

client.destroy();
```

### Preset (Zero-Config) -- Convenience / Prototyping

```ts
import { getChainAPI, destroyAll } from "@polkadot-apps/chain-client";

const client = await getChainAPI("paseo");
const account = await client.assetHub.query.System.Account.getValue("5G...");
console.log("Free balance:", account.data.free);

// Raw PolkadotClient access for advanced use
const rawAssetHub = client.raw.assetHub;

client.destroy();
```

## Decision Guide: BYOD vs Preset

Use **BYOD** (`createChainClient`) when:
- You only need a subset of chains (e.g., just Asset Hub) -- smaller bundle
- You want to provide your own RPC endpoints
- You are connecting to chains not in the preset set
- You need fine-grained control over connection metadata
- You are building for production and want to minimize payload size

Use **Preset** (`getChainAPI`) when:
- You want all three chains (Asset Hub, Bulletin, Individuality) for a known environment
- You do not need custom RPC endpoints
- You want zero-config with no descriptor imports
- You are prototyping or exploring quickly

## Packages

| Package | Purpose |
|---|---|
| `@polkadot-apps/chain-client` | High-level connection manager. Two paths: `getChainAPI` (preset) and `createChainClient` (BYOD). |
| `@polkadot-apps/descriptors` | Pre-generated papi descriptors. Subpath imports per chain. |
| `@polkadot-apps/host` | Container detection, host-routed providers, and storage (Polkadot Browser / Polkadot Desktop). Re-exported by chain-client. |

## Environments

```ts
type Environment = "polkadot" | "kusama" | "paseo";
```

Each environment connects to three chains:
- **Asset Hub** -- parachain for assets, balances, and smart contracts (environment-specific: polkadot-asset-hub, kusama-asset-hub, or paseo-asset-hub)
- **Bulletin** -- chain for transaction storage (shared genesis across environments)
- **Individuality** -- chain for identity/people (shared genesis across environments)

**Currently available:** Only `"paseo"` has live RPCs for all three chains.

## How ChainClient Works

Both `getChainAPI(env)` and `createChainClient(config)` return a `ChainClient<T>` object:

```ts
type ChainClient<TChains extends Record<string, ChainDefinition>> = {
  [K in keyof TChains]: TypedApi<TChains[K]>;  // typed API per chain
} & {
  raw: { [K in keyof TChains]: PolkadotClient };  // raw PolkadotClient per chain
  destroy: () => void;                             // tear down connections
};
```

For `getChainAPI("paseo")`, the return type is `ChainClient<PresetChains<"paseo">>` with keys `assetHub`, `bulletin`, and `individuality`.

For `createChainClient(config)`, the return type matches your `chains` config -- you choose the chain names and descriptors.

### Using Typed APIs

```ts
const client = await getChainAPI("paseo");

// Storage queries
const account = await client.assetHub.query.System.Account.getValue(address);
const blockNumber = await client.assetHub.query.System.Number.getValue();

// Bulletin chain queries
const byteFee = await client.bulletin.query.TransactionStorage.ByteFee.getValue();

// Individuality chain queries
const identity = await client.individuality.query.Identity.IdentityOf.getValue(address);

// Constants (synchronous access to on-chain constants)
const version = await client.assetHub.constants.System.Version();
console.log(`Runtime: ${version.spec_name} v${version.spec_version}`);

// Transactions (build but don't submit -- see polkadot-transactions skill)
const tx = client.assetHub.tx.System.remark({ remark: Binary.fromText("hello") });

// Transfers require MultiAddress enum for dest parameter
const transfer = client.assetHub.tx.Balances.transfer_keep_alive({
  dest: { type: "Id", value: recipientSs58 },  // MultiAddress.Id
  value: 1_000_000_000n,
});
```

### Using the Raw PolkadotClient

> **Important**: Always use `createChainClient` or `getChainAPI` to establish connections --
> they automatically route through the Host API when inside a Polkadot container.
> Do NOT bypass chain-client by creating raw `PolkadotClient` instances with `createClient()`
> directly -- this skips host routing and breaks container integration.
> The `.raw` property on ChainClient is safe to use (the connection is already established
> through host routing). It is only needed for advanced APIs like `createInkSdk`.

The `.raw` property exposes the underlying `PolkadotClient` for each chain. Use it for advanced APIs like creating an Ink! SDK for contracts:

```ts
const client = await getChainAPI("paseo");

// Access raw PolkadotClient per chain
const rawAssetHub = client.raw.assetHub;
const rawBulletin = client.raw.bulletin;

// Example: Create an InkSdk for contract interactions
import { createInkSdk } from "@polkadot-api/sdk-ink";
const inkSdk = createInkSdk(client.raw.assetHub, { atBest: true });
const contract = inkSdk.getContract(contractDescriptor, contractAddress);
```

## Connection Lifecycle

### Initialize

```ts
// Preset path
import { getChainAPI } from "@polkadot-apps/chain-client";
const client = await getChainAPI("paseo");

// BYOD path
import { createChainClient } from "@polkadot-apps/chain-client";
import { paseo_asset_hub } from "@polkadot-apps/descriptors/paseo-asset-hub";
const client = await createChainClient({
  chains: { assetHub: paseo_asset_hub },
  rpcs: { assetHub: ["wss://sys.ibp.network/asset-hub-paseo"] },
});
```

Both functions are idempotent -- calling with the same config returns the same cached promise. Concurrent calls are deduplicated.

### Use

Access chains via `client.assetHub`, `client.bulletin`, `client.individuality` (preset), or whatever chain names you configured (BYOD). Access raw clients via `client.raw.<chainName>`.

### Destroy

```ts
import { destroyAll } from "@polkadot-apps/chain-client";

// Destroy a single client's connections
client.destroy();

// Or destroy all connections at once
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
const rawClient = getClient(bulletin);
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
{ type: "Id", value: ss58Address }        // AccountId32 -- most common
{ type: "Index", value: accountIndex }     // Compact index
{ type: "Address20", value: h160Address }  // H160/EVM address

// Example: transfer
client.assetHub.tx.Balances.transfer_keep_alive({
  dest: { type: "Id", value: "5GrwvaEF..." },
  value: 1_000_000_000n,
});
```

## Common Mistakes

### Forgetting to await getChainAPI / createChainClient

```ts
// WRONG -- both return a Promise
const client = getChainAPI("paseo");
client.assetHub.query.System.Account.getValue(addr); // TypeError!

// Correct
const client = await getChainAPI("paseo");
```

### Not calling destroy / destroyAll

Leaking connections causes WebSocket handles to stay open. Always clean up in app teardown, test afterAll, or process exit handlers.

### Using unavailable environments

```ts
// WRONG -- throws "Chain API for "polkadot" is not yet available"
const client = await getChainAPI("polkadot");

// Correct -- only paseo is available today
const client = await getChainAPI("paseo");
```

### Importing descriptors without subpath

```ts
// WRONG -- no barrel export exists
import { bulletin } from "@polkadot-apps/descriptors";

// Correct
import { bulletin } from "@polkadot-apps/descriptors/bulletin";
```

### Using the old .contracts property

```ts
// WRONG -- .contracts has been removed from ChainClient
const contract = client.contracts.getContract(descriptor, address);

// Correct -- create InkSdk yourself from the raw client
import { createInkSdk } from "@polkadot-api/sdk-ink";
const inkSdk = createInkSdk(client.raw.assetHub, { atBest: true });
const contract = inkSdk.getContract(descriptor, address);
```

## Integration with Bulletin

Both paths work with `BulletinClient`:

- **BYOD**: `BulletinClient.from(client.bulletin, gateway)` -- use with any chain client
- **Preset**: `BulletinClient.create("paseo")` -- auto-resolves via `getChainAPI`

## Reference Files

- [chain-client-api.md](references/chain-client-api.md) -- Full API surface of `@polkadot-apps/chain-client`
- [descriptors-guide.md](references/descriptors-guide.md) -- How descriptors work, subpath imports, adding new chains
- [examples.md](references/examples.md) -- Real-world usage patterns and code examples

## Resources

- npm: [@polkadot-apps/chain-client](https://www.npmjs.com/package/@polkadot-apps/chain-client)
- npm: [@polkadot-apps/descriptors](https://www.npmjs.com/package/@polkadot-apps/descriptors)
- API docs: [paritytech.github.io/polkadot-apps](https://paritytech.github.io/polkadot-apps/)
- Repository: [github.com/paritytech/polkadot-apps](https://github.com/paritytech/polkadot-apps)
- polkadot-api docs: [papi.how](https://papi.how)
