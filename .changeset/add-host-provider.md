---
"@polkadot-apps/host": minor
"@polkadot-apps/chain-client": patch
---

Add `getHostProvider` to `@polkadot-apps/host` — wraps product-sdk's `createPapiProvider` so apps can get host-routed chain connections without importing `@novasamatech/product-sdk` directly. Migrated chain-client to use this wrapper, removing its direct product-sdk dependency.
