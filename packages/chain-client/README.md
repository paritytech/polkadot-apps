# @polkadot-apps/chain-client

Multi-chain Polkadot API client with two connection modes: **BYOD** (bring your own descriptors) for zero-overhead custom setups, or **Preset** for zero-config access to known environments.

## Install

```bash
pnpm add @polkadot-apps/chain-client polkadot-api
```

For the BYOD path, also install descriptors for the chains you need:

```bash
pnpm add @polkadot-apps/descriptors
```

## Quick start

### BYOD — bring your own descriptors

Import descriptors for exactly the chains you need. No unused chain metadata is bundled.

```typescript
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

// Fully typed from your descriptors
const account = await client.assetHub.query.System.Account.getValue(address);
const fee = await client.bulletin.query.TransactionStorage.ByteFee.getValue();

client.destroy();
```

### Preset — zero config

No descriptor imports needed. Built-in descriptors and RPCs for known environments.

```typescript
import { getChainAPI } from "@polkadot-apps/chain-client";

const client = await getChainAPI("paseo");

// Same fully-typed APIs — no imports needed
const account = await client.assetHub.query.System.Account.getValue(address);
const fee = await client.bulletin.query.TransactionStorage.ByteFee.getValue();

client.destroy();
```

### When to use which

| | BYOD (`createChainClient`) | Preset (`getChainAPI`) |
|---|---|---|
| **Bundle size** | Only your chosen chains | All chains for the environment |
| **Configuration** | You provide descriptors + RPCs | Zero config |
| **Custom chains** | Any PAPI-compatible chain | Only polkadot/kusama/paseo |
| **Best for** | Production apps, libraries | Prototyping, scripts |

## Contracts (InkSdk)

Create an InkSdk from the raw `PolkadotClient` via `.raw`:

```typescript
import { createInkSdk } from "@polkadot-api/sdk-ink";
import { ContractManager } from "@polkadot-apps/contracts";

// Works with either createChainClient or getChainAPI
const inkSdk = createInkSdk(client.raw.assetHub, { atBest: true });
const manager = new ContractManager(cdmJson, inkSdk, { signerManager });
```

## Connection routing

Connections are established automatically based on the runtime environment:

- **Inside a container** (Polkadot Desktop/Mobile): routes through the Host API via `@polkadot-apps/host`.
- **Outside a container** (standalone browser or Node.js): connects directly over WebSocket RPC.

```typescript
import { isInsideContainer } from "@polkadot-apps/chain-client";

if (await isInsideContainer()) {
    console.log("Connections routed through Host API");
}
```

## Raw client access

Access the underlying `PolkadotClient` for advanced use cases:

```typescript
// Via .raw (on the client instance)
const polkadotClient = client.raw.assetHub;

// Via getClient (global lookup by descriptor)
import { getClient, isConnected } from "@polkadot-apps/chain-client";
import { paseo_asset_hub } from "@polkadot-apps/descriptors/paseo-asset-hub";

const polkadotClient = getClient(paseo_asset_hub);
const connected = isConnected(paseo_asset_hub); // boolean, synchronous
```

## Cleanup

```typescript
// Destroy one client's connections
client.destroy();

// Destroy ALL connections across all clients
import { destroyAll } from "@polkadot-apps/chain-client";
destroyAll();
```

## Supported preset environments

| Environment | Asset Hub | Bulletin | Individuality | Status |
|-------------|-----------|----------|---------------|--------|
| `"paseo"` | Yes | Yes | Yes | Available |
| `"polkadot"` | -- | -- | -- | Not yet available |
| `"kusama"` | -- | -- | -- | Not yet available |

## API

### `createChainClient<TChains>(config): Promise<ChainClient<TChains>>`

Create a chain client with user-provided descriptors and RPC endpoints. Results are cached by genesis-hash fingerprint.

```typescript
const client = await createChainClient({
    chains: { assetHub: paseo_asset_hub, bulletin },
    rpcs: { assetHub: ["wss://..."], bulletin: ["wss://..."] },
    meta: { assetHub: { mode: "lightclient", relayChainSpec: "..." } }, // optional
});
```

**Returns**: `ChainClient<TChains>` — typed APIs per chain key + `.raw` + `.destroy()`.

### `getChainAPI<E extends Environment>(env): Promise<ChainClient<PresetChains<E>>>`

Get a chain client for a known environment with built-in descriptors and RPCs. Internally calls `createChainClient` with preset configuration.

| Parameter | Type | Description |
|-----------|------|-------------|
| `env` | `Environment` | `"polkadot"`, `"kusama"`, or `"paseo"`. |

**Returns**: `ChainClient` with `assetHub`, `bulletin`, `individuality`, `.raw`, and `.destroy()`.

**Throws** when the requested environment is not yet available.

### `destroyAll(): void`

Destroy all chain client instances and reset internal caches including the smoldot worker.

### `getClient(descriptor): PolkadotClient`

Return the raw `PolkadotClient` for a connected chain identified by its descriptor. The chain must have been initialized first.

### `isConnected(descriptor): boolean`

Check whether a chain is currently connected. Synchronous, no side effects.

### `isInsideContainer(): boolean`

Check whether the app is running inside a Polkadot Desktop/Mobile container. Re-exported from `@polkadot-apps/host`.

## Types

```typescript
/** Configuration for createChainClient. */
interface ChainClientConfig<TChains extends Record<string, ChainDefinition>> {
    chains: TChains;
    rpcs: { [K in keyof TChains]: readonly string[] };
    meta?: { [K in keyof TChains]?: Omit<ChainMeta, "rpcs"> };
}

/** Connected chain client — typed APIs + raw clients + destroy. */
type ChainClient<TChains extends Record<string, ChainDefinition>> = {
    [K in keyof TChains]: TypedApi<TChains[K]>;
} & {
    raw: { [K in keyof TChains]: PolkadotClient };
    destroy: () => void;
};

type Environment = "polkadot" | "kusama" | "paseo";
type ConnectionMode = "rpc" | "lightclient";

interface ChainMeta {
    rpcs?: readonly string[];
    relayChainSpec?: string;
    paraChainSpec?: string;
    mode?: ConnectionMode;
}
```

## License

Apache-2.0
