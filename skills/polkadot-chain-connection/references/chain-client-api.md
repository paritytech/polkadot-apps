# chain-client API Reference

Full API surface of `@polkadot-apps/chain-client` (`packages/chain-client/src/`).

## Exports

```ts
// Functions
export { createChainClient, destroyAll, getClient, isConnected } from "./clients.js";
export { getChainAPI } from "./presets.js";

// Types
export type { ChainClient, ChainClientConfig, ChainMeta, ConnectionMode } from "./types.js";
export type { Environment, PresetChains } from "./presets.js";

// Re-export from @polkadot-apps/host
export { isInsideContainer } from "@polkadot-apps/host";
```

## Types

### Environment

```ts
type Environment = "polkadot" | "kusama" | "paseo";
```

Only `"paseo"` is currently available. Calling `getChainAPI` with `"polkadot"` or `"kusama"` throws:
```
Error: Chain API for "polkadot" is not yet available
```

### ChainClientConfig\<TChains\>

```ts
/**
 * Configuration for createChainClient.
 *
 * Provide named chain descriptors and their RPC endpoints.
 * TypeScript enforces that `rpcs` has the same keys as `chains`.
 */
export interface ChainClientConfig<
  TChains extends Record<string, ChainDefinition> = Record<string, ChainDefinition>,
> {
  /** Named chain descriptors (PAPI ChainDefinition objects). */
  chains: TChains;
  /** RPC endpoints per chain name. Must have an entry for each key in `chains`. */
  rpcs: { [K in keyof TChains]: readonly string[] };
  /** Optional per-chain connection metadata (lightclient specs, mode overrides). */
  meta?: { [K in keyof TChains]?: Omit<ChainMeta, "rpcs"> };
}
```

Example:
```ts
import { paseo_asset_hub } from "@polkadot-apps/descriptors/paseo-asset-hub";
import { bulletin } from "@polkadot-apps/descriptors/bulletin";

const config: ChainClientConfig<{
  assetHub: typeof paseo_asset_hub;
  bulletin: typeof bulletin;
}> = {
  chains: { assetHub: paseo_asset_hub, bulletin },
  rpcs: {
    assetHub: ["wss://sys.ibp.network/asset-hub-paseo"],
    bulletin: ["wss://paseo-bulletin-rpc.polkadot.io"],
  },
};
```

### ChainClient\<TChains\>

```ts
/**
 * A connected chain client returned by createChainClient or getChainAPI.
 *
 * Each key from your config maps to a fully-typed PAPI TypedApi.
 * Access raw PolkadotClient instances via `.raw` for advanced use cases
 * like creating an InkSdk for contract interactions.
 */
export type ChainClient<TChains extends Record<string, ChainDefinition>> = {
  [K in string & keyof TChains]: TypedApi<TChains[K]>;
} & {
  /** Raw PolkadotClient instances, keyed by chain name. Use for advanced APIs like createInkSdk. */
  raw: { [K in string & keyof TChains]: PolkadotClient };
  /** Destroy all connections managed by this client. */
  destroy: () => void;
};
```

Properties:
- **`[chainName]`** -- Typed API for each chain (e.g., `client.assetHub`, `client.bulletin`). Provides `query`, `tx`, `constants`, `event` access fully typed from the chain's descriptor.
- **`raw`** -- Object mapping each chain name to its underlying `PolkadotClient`. Use for advanced operations like creating an `InkSdk` for contract interactions: `createInkSdk(client.raw.assetHub, { atBest: true })`.
- **`destroy()`** -- Tears down all connections managed by this client and removes them from the internal cache.

### PresetChains\<E extends Environment\>

```ts
/**
 * The chain shape returned by getChainAPI for a given environment.
 * Maps chain names to their descriptor types.
 */
export type PresetChains<E extends Environment> = {
  assetHub: AssetHubDescriptors[E];
  bulletin: typeof BulletinDef;
  individuality: typeof IndividualityDef;
};
```

Where `AssetHubDescriptors` maps:
- `"polkadot"` -> `typeof polkadot_asset_hub` from `@polkadot-apps/descriptors/polkadot-asset-hub`
- `"kusama"` -> `typeof kusama_asset_hub` from `@polkadot-apps/descriptors/kusama-asset-hub`
- `"paseo"` -> `typeof paseo_asset_hub` from `@polkadot-apps/descriptors/paseo-asset-hub`

So `getChainAPI("paseo")` returns `Promise<ChainClient<PresetChains<"paseo">>>`, which has typed `assetHub`, `bulletin`, and `individuality` properties.

### ConnectionMode

```ts
type ConnectionMode = "rpc" | "lightclient";
```

Controls which standalone provider is built. Internal to the provider system.

### ChainMeta

```ts
interface ChainMeta {
  rpcs?: readonly string[];
  relayChainSpec?: string;
  paraChainSpec?: string;
  mode?: ConnectionMode;
}
```

Connection metadata for a chain. Internal to the provider system.

## Functions

### createChainClient (BYOD)

```ts
async function createChainClient<
  const TChains extends Record<string, ChainDefinition>,
>(config: ChainClientConfig<TChains>): Promise<ChainClient<TChains>>
```

Create a multi-chain client with user-provided descriptors and RPC endpoints. This is the **BYOD** path -- you import your own descriptors and specify your own RPCs.

- **Caching:** Results are cached by a fingerprint of the chain names + genesis hashes. Calling with the same descriptors returns the same instance.
- **Deduplication:** Concurrent calls for the same config share one initialization promise.
- **Error recovery:** If initialization fails, the cache entry is removed so the next call retries.

**Connection strategy:**
1. Uses host routing (via `@polkadot-apps/host`) when inside a container.
2. Falls back to direct WebSocket RPC outside a container.

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

// Fully typed from your descriptors
const account = await client.assetHub.query.System.Account.getValue(addr);
const fee = await client.bulletin.query.TransactionStorage.ByteFee.getValue();

// Raw client for advanced use (e.g., InkSdk for contracts)
import { createInkSdk } from "@polkadot-api/sdk-ink";
const inkSdk = createInkSdk(client.raw.assetHub, { atBest: true });

client.destroy();
```

### getChainAPI (Preset)

```ts
async function getChainAPI<E extends Environment>(env: E): Promise<ChainClient<PresetChains<E>>>
```

Get a chain client for a known environment with built-in descriptors and RPCs. This is the **zero-config** path -- no need to import descriptors or specify endpoints.

Internally delegates to `createChainClient` with pre-configured descriptors and RPC endpoints for Asset Hub, Bulletin, and Individuality.

- **Caching:** First call creates connections; subsequent calls return the cached promise (via `createChainClient` deduplication).
- **Lazy loading:** Descriptors are imported dynamically -- only the chains needed for the requested environment are loaded.
- **Error recovery:** If initialization fails, the cache entry is removed so the next call retries.

```ts
import { getChainAPI } from "@polkadot-apps/chain-client";

const client = await getChainAPI("paseo");

// Fully typed -- no descriptor imports needed
const account = await client.assetHub.query.System.Account.getValue(addr);
const fee = await client.bulletin.query.TransactionStorage.ByteFee.getValue();

// Raw client for advanced use (e.g., InkSdk for contracts)
import { createInkSdk } from "@polkadot-api/sdk-ink";
const inkSdk = createInkSdk(client.raw.assetHub, { atBest: true });

client.destroy();
```

### destroyAll

```ts
function destroyAll(): void
```

Destroy all chain client instances and reset internal caches. Disconnects every connection created by `createChainClient` or `getChainAPI`, clears all caches, and terminates the smoldot light client worker if running.

### getClient

```ts
function getClient(descriptor: ChainDefinition): PolkadotClient
```

Get the raw `PolkadotClient` (from `polkadot-api`) for a connected chain. The chain must have been initialized via `createChainClient()` or `getChainAPI()` first.

Alternatively, use `client.raw.<chainName>` on the returned `ChainClient` for direct access without needing a descriptor.

- `descriptor` -- A papi `ChainDefinition` with a `genesis` field.
- Throws if the descriptor has no genesis hash.
- Throws if the chain is not connected: `"Chain not connected (genesis: 0x...). Call createChainClient() or getChainAPI() first to establish connections."`

```ts
import { bulletin } from "@polkadot-apps/descriptors/bulletin";
const rawClient = getClient(bulletin); // raw PolkadotClient
```

### isConnected

```ts
function isConnected(descriptor: ChainDefinition): boolean
```

Check if a chain is currently connected. Synchronous -- no side effects, no initialization.

- Returns `false` if the descriptor has no genesis hash.
- Returns `false` if the chain has not been initialized via `createChainClient()` or `getChainAPI()`.

```ts
import { bulletin } from "@polkadot-apps/descriptors/bulletin";
isConnected(bulletin); // false (before connecting)
await getChainAPI("paseo");
isConnected(bulletin); // true
```

### isInsideContainer

```ts
async function isInsideContainer(): Promise<boolean>
```

Re-exported from `@polkadot-apps/host`. Detects if running inside a Polkadot container (Polkadot Browser or Polkadot Desktop).

Detection order:
1. `@novasamatech/product-sdk` `sandboxProvider.isCorrectEnvironment()` (primary)
2. Manual detection: iframe check, `__HOST_WEBVIEW_MARK__`, `__HOST_API_PORT__`
3. Returns `false` in Node.js (no `window`)

## Internal Architecture

### Provider Creation (`providers.ts`)

```ts
async function createProvider(genesisHash: string, meta: ChainMeta): Promise<JsonRpcProvider>
```

Creates a papi-compatible JSON-RPC provider for a chain:
1. Builds a standalone fallback provider (RPC or light client based on `meta.mode`).
2. Wraps with `@polkadot-apps/host`'s `getHostProvider` if available (routes through host).
3. If host provider is unavailable, uses the fallback directly.

### HMR Cache (`hmr.ts`)

Client connections are cached on `globalThis.__chainClientCache` to survive hot module replacement during development. Cache keys are `${fingerprint}:${genesis}` where the fingerprint is derived from sorted chain names + genesis hashes.

### Available RPCs (paseo)

| Chain | RPC Endpoints |
|---|---|
| Asset Hub | `wss://asset-hub-paseo-rpc.n.dwellir.com`, `wss://sys.ibp.network/asset-hub-paseo` |
| Bulletin | `wss://paseo-bulletin-rpc.polkadot.io` |
| Individuality | `wss://paseo-people-next-rpc.polkadot.io` |
