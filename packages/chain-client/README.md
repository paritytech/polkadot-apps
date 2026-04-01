# @polkadot-apps/chain-client

Multi-chain Polkadot API client with typed access to Asset Hub, Bulletin, and Individuality chains.

## Install

```bash
pnpm add @polkadot-apps/chain-client
```

**Peer dependency**: `polkadot-api` must be installed in your project.

```bash
pnpm add polkadot-api
```

**Optional peer dependency**: `@novasamatech/product-sdk` is required only when running inside a Polkadot Desktop/Mobile container to route connections through the Host API.

## Quick start

```typescript
import { getChainAPI } from "@polkadot-apps/chain-client";

const api = await getChainAPI("paseo");

// Query Asset Hub
const account = await api.assetHub.query.System.Account.getValue(address);

// Query Bulletin chain
const fee = await api.bulletin.query.TransactionStorage.ByteFee.getValue();

// Use Ink contracts via the contracts SDK
const contract = api.contracts.getContract(descriptor, contractAddress);
```

## Supported environments

`getChainAPI` accepts an `Environment` value. Currently only `"paseo"` is fully configured with all three chains (Asset Hub, Bulletin, Individuality). Calling `getChainAPI("polkadot")` or `getChainAPI("kusama")` throws until those environments are live.

| Environment | Asset Hub | Bulletin | Individuality | Status |
|-------------|-----------|----------|---------------|--------|
| `"paseo"` | Yes | Yes | Yes | Available |
| `"polkadot"` | -- | -- | -- | Not yet available |
| `"kusama"` | -- | -- | -- | Not yet available |

## Connection routing

Connections are established automatically based on the runtime environment:

- **Inside a container** (Polkadot Desktop/Mobile): routes through the Host API via `@novasamatech/product-sdk`.
- **Outside a container** (standalone browser or Node.js): connects directly over WebSocket RPC.

Detect the environment programmatically:

```typescript
import { isInsideContainer } from "@polkadot-apps/chain-client";

if (isInsideContainer()) {
  console.log("Connections routed through Host API");
}
```

## Chain API structure

The object returned by `getChainAPI` provides typed access to each chain's runtime, derived from on-chain descriptors. Every property and query method is fully typed -- no manual type assertions needed.

```typescript
const api = await getChainAPI("paseo");

// api.assetHub  — typed API for Paseo Asset Hub
// api.bulletin   — typed API for Bulletin chain
// api.individuality — typed API for Individuality chain
// api.contracts  — Ink SDK instance bound to Asset Hub
// api.destroy()  — close all connections for this environment
```

## Contracts

The `contracts` property is an Ink SDK instance (`createInkSdk`) pre-configured for the environment's Asset Hub. Use it to interact with ink! smart contracts.

```typescript
const api = await getChainAPI("paseo");

const contract = api.contracts.getContract(descriptor, contractAddress);
const result = await contract.query.myMethod(args);
```

### Solidity contracts (pallet-revive)

For Solidity contracts deployed via Revive, use `@polkadot-apps/solidity-contracts` with the `api.assetHub` typed API:

```typescript
import { createSolidityContract } from "@polkadot-apps/solidity-contracts";

const api = await getChainAPI("paseo");
const contract = createSolidityContract(api.assetHub, "0xContractAddress", abi);

// Read a view function
const balance = await contract.read("balanceOf", ["0xOwner"]);

// Write a state-changing function
const result = await contract.write("transfer", ["0xTo", 1000n], senderAddress);
const tx = result.send();
```

Alternatively, if you have pre-generated descriptors from `papi generate` with the `"sol"` key, use `api.contracts.getContract(descriptor, address)` directly — the Ink SDK handles Solidity ABI encoding automatically.

## Raw client access

For advanced use cases, access the underlying `PolkadotClient` directly or check connection status.

```typescript
import { getClient, isConnected } from "@polkadot-apps/chain-client";
import { paseo_asset_hub } from "@polkadot-apps/descriptors";

const client = getClient(paseo_asset_hub);
const connected = isConnected(paseo_asset_hub); // boolean, synchronous
```

## Cleanup

Destroy connections when they are no longer needed. You can destroy a single environment or all environments at once.

```typescript
import { getChainAPI, destroyAll } from "@polkadot-apps/chain-client";

const api = await getChainAPI("paseo");

// Destroy one environment
api.destroy();

// Destroy all environments
destroyAll();
```

## API

### `getChainAPI<E extends Environment>(env: E): Promise<ChainAPI<E>>`

Return the typed chain API for a given environment. Results are cached -- calling `getChainAPI("paseo")` twice returns the same instance.

| Parameter | Type | Description |
|-----------|------|-------------|
| `env` | `Environment` | `"polkadot"`, `"kusama"`, or `"paseo"`. |

**Returns**: `Promise<ChainAPI<E>>` with typed `assetHub`, `bulletin`, `individuality`, `contracts`, and `destroy()`.

**Throws** when the requested environment is not yet available.

### `destroyAll(): void`

Destroy all cached chain API instances and close their connections.

### `getClient(descriptor): PolkadotClient`

Return the raw `PolkadotClient` for a connected chain identified by its descriptor.

| Parameter | Type | Description |
|-----------|------|-------------|
| `descriptor` | `ChainDefinition` | A chain descriptor from `@polkadot-apps/descriptors`. |

### `isConnected(descriptor): boolean`

Check whether a chain is currently connected. Synchronous.

| Parameter | Type | Description |
|-----------|------|-------------|
| `descriptor` | `ChainDefinition` | A chain descriptor from `@polkadot-apps/descriptors`. |

### `isInsideContainer(): boolean`

Synchronous check for whether the app is running inside a Polkadot Desktop/Mobile container. Re-exported from `@polkadot-apps/host`.

## Types

```typescript
type Environment = "polkadot" | "kusama" | "paseo";

type ChainAPI<E extends Environment> = {
  assetHub: TypedApi;        // typed from descriptors for the given environment
  bulletin: TypedApi;        // typed from the bulletin descriptor
  individuality: TypedApi;   // typed from the individuality descriptor
  contracts: InkSdk;         // Ink SDK bound to Asset Hub
  destroy: () => void;
};

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
