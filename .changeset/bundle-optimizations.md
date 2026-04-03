---
"@polkadot-apps/address": patch
"@polkadot-apps/crypto": patch
"@polkadot-apps/host": patch
"@polkadot-apps/keys": patch
"@polkadot-apps/logger": patch
"@polkadot-apps/signer": patch
"@polkadot-apps/storage": patch
"@polkadot-apps/tx": patch
---

Add `sideEffects: false` to all packages and disable source map generation to improve tree-shaking and reduce published package size.
