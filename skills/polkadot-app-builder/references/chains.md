# Supported Chains and Environments

## Two Paths to Chain Connection

### Preset: `getChainAPI(env)`

Zero-config connection to a known environment. Returns a `ChainClient` with `assetHub`, `bulletin`, and `individuality` chains plus `.raw` access to raw `PolkadotClient` instances.

```ts
import { getChainAPI } from "@polkadot-apps/chain-client";

const client = await getChainAPI("paseo");
// client.assetHub, client.bulletin, client.individuality — typed APIs
// client.raw.assetHub, client.raw.bulletin — raw PolkadotClient instances
```

### BYOD: `createChainClient(config)`

Bring Your Own Descriptors. Connect to any combination of chains with your own descriptors and RPC endpoints.

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
// client.assetHub, client.bulletin — typed APIs (names match your config keys)
// client.raw.assetHub, client.raw.bulletin — raw PolkadotClient instances
```

## Preset Environments

> **WARNING:** Only `"paseo"` is currently available. `"polkadot"` and `"kusama"` will throw: `Chain API for "<env>" is not yet available`.

| Environment | Type | Status | Asset Hub | Bulletin | Individuality |
|-------------|------|--------|-----------|----------|---------------|
| `"paseo"` | Testnet | **Available** | Yes | Yes | Yes |
| `"polkadot"` | Mainnet | Planned | Partial | No RPCs | No RPCs |
| `"kusama"` | Canary | Planned | Partial | No RPCs | No RPCs |

## Chain Details

### Asset Hub

The parachain for fungible/non-fungible assets, smart contracts (via Revive/Solidity), and system operations.

**Descriptors:**
- `@polkadot-apps/descriptors/polkadot-asset-hub`
- `@polkadot-apps/descriptors/kusama-asset-hub`
- `@polkadot-apps/descriptors/paseo-asset-hub`

**RPC endpoints (Paseo):**
- `wss://sys.ibp.network/asset-hub-paseo`
- `wss://asset-hub-paseo-rpc.dwellir.com`

### Bulletin Chain

Decentralized data storage via TransactionStorage pallet. Data is addressed by CID (Content Identifier).

**Descriptor:** `@polkadot-apps/descriptors/bulletin`

**RPC endpoint (Paseo):** `wss://paseo-bulletin-rpc.polkadot.io`

**Gateway (HTTP):** Used by `@polkadot-apps/bulletin` for HTTP-based data retrieval.

### Individuality (People Chain)

Identity and personhood chain.

**Descriptor:** `@polkadot-apps/descriptors/individuality`

**RPC endpoint (Paseo):** `wss://pop3-testnet.parity-lab.parity.io/people`

## Connection Modes

Both `getChainAPI` and `createChainClient` support three connection modes (auto-detected):

1. **Host API** — When inside Polkadot Desktop/Mobile container (via `@novasamatech/product-sdk`)
2. **Direct WebSocket** — Fallback using RPC endpoints (preset or user-provided)
3. **Smoldot light client** — Embedded light client with relay chain caching

## Genesis Hashes

For advanced use (manual client creation):

| Chain | Genesis Hash |
|-------|-------------|
| Polkadot Asset Hub | `0x68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f` |
| Kusama Asset Hub | `0x48239ef607d7928874027a43a67689209727dfb3d3dc5e5b03a39bdc2eda771a` |
| Paseo Asset Hub | `0xd6eec26135305a8ad257a20d003357284c8aa03d0bdb2b357ab0a22371e11ef2` |
| Bulletin | `0x744960c32e3a3df5440e1ecd4d34096f1ce2230d7016a5ada8a765d5a622b4ea` |
| Individuality | `0xe583155e68c7b71e9d2443f846eaba0016d0c38aa807884923545a7003f5bef0` |

## Dev Accounts (Testnet Only)

Pre-funded accounts available via `createDevSigner()` from `@polkadot-apps/tx`:

- `"Alice"`, `"Bob"`, `"Charlie"`, `"Dave"`, `"Eve"`, `"Ferdie"`

These use the well-known dev seed phrase. **Never use in production.**
