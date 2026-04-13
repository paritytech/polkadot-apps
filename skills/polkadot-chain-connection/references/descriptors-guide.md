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

## When to Import Descriptors

Descriptors are needed in two scenarios:

### 1. BYOD with `createChainClient`

When using the BYOD path, you import descriptors yourself and pass them in the config:

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
```

### 2. Low-level `polkadot-api` usage

When working directly with the raw polkadot-api client:

```ts
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/web";
import { paseo_asset_hub } from "@polkadot-apps/descriptors/paseo-asset-hub";

const client = createClient(getWsProvider("wss://sys.ibp.network/asset-hub-paseo"));
const api = client.getTypedApi(paseo_asset_hub);
```

### Not needed: Preset with `getChainAPI`

When using the preset (zero-config) path, descriptors are lazy-loaded internally -- you do not need to import them:

```ts
import { getChainAPI } from "@polkadot-apps/chain-client";

const client = await getChainAPI("paseo");
// No descriptor imports needed -- fully typed automatically
const account = await client.assetHub.query.System.Account.getValue("5G...");
```

## How chain-client Lazy-Loads Descriptors

`chain-client` never imports descriptors at the top level. The preset path (`getChainAPI`) uses dynamic imports in `loadDescriptors()`:

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

The BYOD path (`createChainClient`) does not lazy-load -- you provide descriptors directly.

## Using Descriptors for Connection Checking

Descriptors carry genesis hashes, making them useful with `chain-client` utilities:

```ts
import { isConnected, getClient } from "@polkadot-apps/chain-client";
import { bulletin } from "@polkadot-apps/descriptors/bulletin";

// Check connection status
if (isConnected(bulletin)) {
  const rawClient = getClient(bulletin);
  // use rawClient...
}
```

Note: If you have a `ChainClient` instance, you can also access raw clients via `client.raw.<chainName>` without importing descriptors.

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

**For BYOD use:** No changes needed. Users can immediately import the new descriptor and pass it to `createChainClient`.

**For preset use (adding to `getChainAPI`):** Update `packages/chain-client/src/presets.ts`:
1. Add a type-only import for the new descriptor.
2. Add RPC endpoints to the `rpcs` config.
3. Update the `PresetChains` type to include the new chain.
4. Update `loadDescriptors()` to dynamically import the new chain.

**For both paths:** Update `packages/chain-client/src/clients.ts` if you need to register the genesis hash or add new utility functions.

## Build Pipeline

The full generate-and-build flow:

1. **`scripts/generate.sh`** -- Runs `papi add` for each chain to fetch metadata from live nodes into `.papi/metadata/*.scale` files. Then calls `scripts/build.sh`.
2. **`scripts/build.sh`** -- Iterates over `CHAINS`, runs `papi generate --config .papi/polkadot-api.json` in each chain directory to produce `generated/dist/index.mjs` and `generated/dist/index.d.ts`.
3. The subpath exports in `package.json` point directly to these generated files.

### Peer Dependencies

`@polkadot-apps/descriptors` declares `polkadot-api` as a peer dependency (`>=1.23.0`). Consumers must have `polkadot-api` installed.
