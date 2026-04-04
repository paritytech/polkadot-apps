# chain-client API Reference

Full API surface of `@polkadot-apps/chain-client` (`packages/chain-client/src/`).

## Exports

```ts
// Functions
export { getChainAPI, destroyAll, getClient, isConnected } from "./clients.js";

// Types
export type { Environment, ChainAPI } from "./clients.js";
export type { ChainMeta, ConnectionMode } from "./types.js";

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

### ChainAPI\<E extends Environment\>

```ts
type ChainAPI<E extends Environment> = {
  assetHub: TypedApi<AssetHubDescriptors[E]>;
  bulletin: TypedApi<typeof BulletinDef>;
  individuality: TypedApi<typeof IndividualityDef>;
  contracts: ContractSdk;
  destroy: () => void;
};
```

Where:
- `AssetHubDescriptors` maps each environment to its asset hub descriptor type (`polkadot_asset_hub`, `kusama_asset_hub`, or `paseo_asset_hub`)
- `ContractSdk` is `ReturnType<typeof createInkSdk>` from `@polkadot-api/sdk-ink`
- `TypedApi` is from `polkadot-api`
- `BulletinDef` is `typeof bulletin` from `@polkadot-apps/descriptors/bulletin`
- `IndividualityDef` is `typeof individuality` from `@polkadot-apps/descriptors/individuality`

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

### getChainAPI

```ts
async function getChainAPI<E extends Environment>(env: E): Promise<ChainAPI<E>>
```

Get the typed chain API for a given environment. Returns asset hub, bulletin, individuality, and contracts -- fully typed from descriptors.

- **Caching:** First call creates connections; subsequent calls return the cached promise.
- **Deduplication:** Concurrent calls for the same environment share one initialization promise.
- **Error recovery:** If initialization fails, the cache entry is removed so the next call retries.
- **Lazy loading:** Descriptors are imported dynamically -- only the chains needed for the requested environment are loaded.

**Connection strategy:**
1. Uses host routing (via `@novasamatech/product-sdk`) when inside a container.
2. Falls back to direct WebSocket RPC outside a container.

```ts
const api = await getChainAPI("paseo");
await api.assetHub.query.System.Account.getValue(addr);
await api.bulletin.query.TransactionStorage.ByteFee.getValue();
const contract = api.contracts.getContract(descriptor, address);
```

### destroyAll

```ts
function destroyAll(): void
```

Destroy all environments. Disconnects all clients, clears all caches (client cache, environment cache), and terminates the smoldot light client worker if running.

### getClient

```ts
function getClient(descriptor: ChainDefinition): PolkadotClient
```

Get the raw `PolkadotClient` (from `polkadot-api`) for a connected chain. The chain must have been initialized via `getChainAPI()` first.

- `descriptor` -- A papi `ChainDefinition` with a `genesis` field.
- Throws if the descriptor has no genesis hash.
- Throws if the chain is not connected: `"Chain not connected (genesis: 0x...). Call getChainAPI() first to establish connections."`

```ts
import { bulletin } from "@polkadot-apps/descriptors/bulletin";
const client = getClient(bulletin); // raw PolkadotClient
```

### isConnected

```ts
function isConnected(descriptor: ChainDefinition): boolean
```

Check if a chain is currently connected. Synchronous -- no side effects, no initialization.

- Returns `false` if the descriptor has no genesis hash.
- Returns `false` if the chain has not been initialized via `getChainAPI()`.

```ts
import { bulletin } from "@polkadot-apps/descriptors/bulletin";
isConnected(bulletin); // false (before getChainAPI)
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
2. Wraps with `@novasamatech/product-sdk`'s `createPapiProvider` if available (routes through host).
3. If product-sdk is not installed, uses the fallback directly.

### HMR Cache (`hmr.ts`)

Client connections are cached on `globalThis.__chainClientCache` to survive hot module replacement during development. Cache keys are `${env}:${genesis}` to avoid collisions when the same chain (e.g., bulletin) is used across environments.

### Available RPCs (paseo)

| Chain | RPC Endpoints |
|---|---|
| Asset Hub | `wss://sys.ibp.network/asset-hub-paseo`, `wss://asset-hub-paseo-rpc.dwellir.com` |
| Bulletin | `wss://paseo-bulletin-rpc.polkadot.io` |
| Individuality | `wss://pop3-testnet.parity-lab.parity.io/people` |
