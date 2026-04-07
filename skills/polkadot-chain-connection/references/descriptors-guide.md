# Descriptors Guide

How `@polkadot-apps/descriptors` works, how to use them, and how to add new chains.

## What Are Descriptors?

Descriptors are pre-generated type definitions created from live chain metadata using `polkadot-api` (papi). They provide:

- Fully typed storage queries (`query.System.Account.getValue(...)`)
- Typed transaction builders
- Typed constants and events
- Chain-specific `ChainDefinition` objects (with genesis hash)

Without descriptors, you would need to work with untyped chain interactions.

## Subpath Imports

Each chain has its own subpath export. There is **no barrel import** -- you must import each chain individually:

```ts
// Available subpath imports
import { polkadot_asset_hub } from "@polkadot-apps/descriptors/polkadot-asset-hub";
import { kusama_asset_hub }   from "@polkadot-apps/descriptors/kusama-asset-hub";
import { paseo_asset_hub }    from "@polkadot-apps/descriptors/paseo-asset-hub";
import { bulletin }           from "@polkadot-apps/descriptors/bulletin";
import { individuality }      from "@polkadot-apps/descriptors/individuality";
```

Each subpath maps to a separate build output under `chains/<name>/generated/dist/`:

| Subpath | Named Export | Directory |
|---|---|---|
| `./polkadot-asset-hub` | `polkadot_asset_hub` | `chains/polkadot-asset-hub/generated/dist/` |
| `./kusama-asset-hub` | `kusama_asset_hub` | `chains/kusama-asset-hub/generated/dist/` |
| `./paseo-asset-hub` | `paseo_asset_hub` | `chains/paseo-asset-hub/generated/dist/` |
| `./bulletin` | `bulletin` | `chains/bulletin/generated/dist/` |
| `./individuality` | `individuality` | `chains/individuality/generated/dist/` |

This per-chain split avoids bundling all chain metadata when a consumer only uses one chain.

## How chain-client Lazy-Loads Descriptors

`chain-client` never imports descriptors at the top level. Instead, it uses dynamic imports in `loadDescriptors()`:

```ts
// chain-client only imports the descriptor type (erased at compile time)
import type { bulletin as BulletinDef } from "@polkadot-apps/descriptors/bulletin";

// At runtime, descriptors are loaded lazily per environment
const [ahMod, { bulletin }, { individuality }] = await Promise.all([
  import("@polkadot-apps/descriptors/paseo-asset-hub"),  // or polkadot/kusama
  import("@polkadot-apps/descriptors/bulletin"),
  import("@polkadot-apps/descriptors/individuality"),
]);
```

This means:
- Type-only imports are erased at compile time (zero bundle cost).
- Runtime imports are lazy and environment-specific -- requesting `"paseo"` only loads `paseo-asset-hub`, not `polkadot-asset-hub` or `kusama-asset-hub`.
- Bulletin and individuality descriptors are shared across all environments (same genesis hash).

## Using Descriptors Directly (Without chain-client)

If you need lower-level control, you can use descriptors directly with `polkadot-api`:

```ts
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/web";
import { paseo_asset_hub } from "@polkadot-apps/descriptors/paseo-asset-hub";

// Create a raw client
const provider = getWsProvider("wss://sys.ibp.network/asset-hub-paseo");
const client = createClient(provider);

// Get a typed API from the descriptor
const api = client.getTypedApi(paseo_asset_hub);

// Use the typed API
const account = await api.query.System.Account.getValue("5G...");

// Clean up
client.destroy();
```

The descriptor object (e.g., `paseo_asset_hub`) is a `ChainDefinition` that carries the genesis hash and type information papi needs to provide typed access.

## Using Descriptors for Connection Checking

Descriptors carry genesis hashes, making them useful with `chain-client` utilities:

```ts
import { isConnected, getClient } from "@polkadot-apps/chain-client";
import { bulletin } from "@polkadot-apps/descriptors/bulletin";

// Check connection status
if (isConnected(bulletin)) {
  const client = getClient(bulletin);
  // use client...
}
```

## Adding a New Chain

### Step 1: Fetch metadata in `scripts/generate.sh`

Add a `papi add` line:

```bash
npx papi add my_chain -w wss://my-chain-rpc.example.com --skip-codegen
```

Or for a well-known chain:

```bash
npx papi add my_chain -n my_chain_name --skip-codegen
```

### Step 2: Create chain directory

Create `chains/my-chain/` with:

**`.papi/polkadot-api.json`** -- papi config pointing to the chain's metadata.

**`package.json`** -- minimal package file for the chain build.

Look at existing chains (e.g., `chains/bulletin/`) as a template.

### Step 3: Add to build script

In `scripts/build.sh`, add the chain name to the `CHAINS` variable:

```bash
CHAINS="polkadot-asset-hub kusama-asset-hub paseo-asset-hub bulletin individuality my-chain"
```

### Step 4: Add subpath export

In `packages/descriptors/package.json`, add:

```json
"./my-chain": {
  "types": "./chains/my-chain/generated/dist/index.d.ts",
  "import": "./chains/my-chain/generated/dist/index.mjs"
}
```

### Step 5: Generate and build

```bash
cd packages/descriptors
pnpm generate   # Fetches metadata
pnpm build      # Generates per-chain descriptors
```

Or from the repo root:

```bash
pnpm generate-descriptors
```

### Step 6: Wire into chain-client (if needed)

If the new chain should be part of `ChainAPI`, update `packages/chain-client/src/clients.ts`:
1. Add a type-only import for the new descriptor.
2. Add its genesis hash to the `GENESIS` constant.
3. Add RPC endpoints to the `rpcs` config.
4. Update the `ChainAPI` type to include the new chain.
5. Update `loadDescriptors()` and `initChainAPI()` to create the new client and typed API.

## Build Pipeline

The full generate-and-build flow:

1. **`scripts/generate.sh`** -- Runs `papi add` for each chain to fetch metadata from live nodes into `.papi/metadata/*.scale` files. Then calls `scripts/build.sh`.
2. **`scripts/build.sh`** -- Iterates over `CHAINS`, runs `papi generate --config .papi/polkadot-api.json` in each chain directory to produce `generated/dist/index.mjs` and `generated/dist/index.d.ts`.
3. The subpath exports in `package.json` point directly to these generated files.

### Peer Dependencies

`@polkadot-apps/descriptors` declares `polkadot-api` as a peer dependency (`>=1.23.0`). Consumers must have `polkadot-api` installed.
