---
"@polkadot-apps/chain-client": minor
"@polkadot-apps/descriptors": minor
---

Add `@polkadot-apps/descriptors` with PAPI-generated typed chain descriptors for Polkadot, Kusama, and Paseo environments (asset hub, bulletin, individuality).

Implement `@polkadot-apps/chain-client` with descriptor-driven, zero-config chain connections.

Public API: getChainAPI, getClient, isConnected, destroyAll, isInsideContainer.

Features:
- Environment-based API (polkadot | kusama | paseo) returning fully typed chain access
- Automatic container detection via @novasamatech/product-sdk with manual fallback
- Env-scoped client caching with HMR survival via globalThis
- Smoldot light client support with relay chain caching
- Contract SDK (Ink) on asset hub
