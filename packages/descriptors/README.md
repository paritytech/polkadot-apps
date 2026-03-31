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

```typescript
import { polkadot_asset_hub } from "@polkadot-apps/descriptors";
import { createClient } from "polkadot-api";

const client = createClient(/* transport */);
const api = client.getTypedApi(polkadot_asset_hub);

// Full type safety for all calls, queries, and events
const result = await api.query.System.Account.getValue(address);
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

```typescript
import {
  polkadot_asset_hub,
  kusama_asset_hub,
  paseo_asset_hub,
  bulletin,
  individuality,
} from "@polkadot-apps/descriptors";
```

## Regenerating descriptors

This package contains generated code. To regenerate from chain metadata:

```bash
pnpm generate
```

This runs the Polkadot API CLI to fetch current chain metadata and rebuild the descriptor files.

## License

Apache-2.0
