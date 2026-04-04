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

Import descriptors per chain — each subpath is a separate papi build, so you only bundle the chain metadata you actually use:

```typescript
import { bulletin } from "@polkadot-apps/descriptors/bulletin";
import { createClient } from "polkadot-api";

const client = createClient(/* transport */);
const api = client.getTypedApi(bulletin);

// Full type safety for all calls, queries, and events
const fee = await api.query.TransactionStorage.ByteFee.getValue();
```

## Available chain descriptors

| Subpath | Export | Chain |
|---------|--------|-------|
| `./polkadot-asset-hub` | `polkadot_asset_hub` | Polkadot Asset Hub |
| `./kusama-asset-hub` | `kusama_asset_hub` | Kusama Asset Hub |
| `./paseo-asset-hub` | `paseo_asset_hub` | Paseo Asset Hub |
| `./bulletin` | `bulletin` | Bulletin Chain (Paseo) |
| `./individuality` | `individuality` | People Chain (Paseo) |

```typescript
import { polkadot_asset_hub } from "@polkadot-apps/descriptors/polkadot-asset-hub";
import { kusama_asset_hub } from "@polkadot-apps/descriptors/kusama-asset-hub";
import { paseo_asset_hub } from "@polkadot-apps/descriptors/paseo-asset-hub";
import { bulletin } from "@polkadot-apps/descriptors/bulletin";
import { individuality } from "@polkadot-apps/descriptors/individuality";
```

## Regenerating descriptors

This package contains generated code. To regenerate from chain metadata:

```bash
pnpm generate-descriptors
```

This fetches current chain metadata and runs `papi generate` once per chain, producing isolated per-chain builds.

## Adding a new chain

1. Add the chain's metadata: update `scripts/generate.sh` with a `papi add` command.
2. Create `chains/<name>/.papi/polkadot-api.json` with the chain config and a minimal `package.json`.
3. Add the chain to the `CHAINS` list in `scripts/build.sh`.
4. Add a subpath export in the root `package.json`.

## License

Apache-2.0
