# @polkadot-apps/descriptors

Pre-generated Polkadot API descriptors for Asset Hub, Bulletin, and Individuality chains.

## Install

```bash
pnpm add @polkadot-apps/descriptors
```

**Peer dependency**: `polkadot-api` (>=1.23.0)

```bash
pnpm add polkadot-api
```

## Quick start

Use per-chain subpath imports to only bundle the chains you need:

```typescript
import bulletin from "@polkadot-apps/descriptors/bulletin";
import { createClient } from "polkadot-api";

const client = createClient(/* transport */);
const api = client.getTypedApi(bulletin);

// Full type safety for all calls, queries, and events
const fee = await api.query.TransactionStorage.ByteFee.getValue();
```

Per-chain imports are the **recommended** pattern — they avoid bundling metadata for chains you don't use, which can save several MB of bundle size.

The barrel import is still available when you need multiple chains at once:

```typescript
import { polkadot_asset_hub, bulletin } from "@polkadot-apps/descriptors";
```

## Available chain descriptors

| Export | Chain | Genesis hash |
|--------|-------|--------------|
| `polkadot_asset_hub` | Polkadot Asset Hub | `0x68d56f15...` |
| `kusama_asset_hub` | Kusama Asset Hub | `0x48239ef6...` |
| `paseo_asset_hub` | Paseo Asset Hub | `0xd6eec261...` |
| `bulletin` | Bulletin Chain (Paseo) | `0x744960c3...` |
| `individuality` | People Chain (Paseo) | `0xe583155e...` |

Each export is a typed descriptor object that you pass to `client.getTypedApi()` from `polkadot-api`. The descriptor carries full chain metadata so that all storage queries, transactions, events, and constants are type-safe.

Per-chain subpath imports (recommended for bundle size):

```typescript
import polkadot_asset_hub from "@polkadot-apps/descriptors/polkadot-asset-hub";
import kusama_asset_hub from "@polkadot-apps/descriptors/kusama-asset-hub";
import paseo_asset_hub from "@polkadot-apps/descriptors/paseo-asset-hub";
import bulletin from "@polkadot-apps/descriptors/bulletin";
import individuality from "@polkadot-apps/descriptors/individuality";
```

## Regenerating descriptors

This package contains generated code. To regenerate from chain metadata:

```bash
pnpm generate
```

This runs the Polkadot API CLI to fetch current chain metadata, rebuild the descriptor files, and generate per-chain entry files for subpath imports.

## License

Apache-2.0
