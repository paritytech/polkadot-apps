---
"@polkadot-apps/address": minor
---

Implement `@polkadot-apps/address` with canonical SS58/H160 utilities for pallet-revive.

Exports: `isValidSS58`, `normalizeSS58`, `toGenericSS58`, `toPolkadotSS58`, `ss58ToH160`, `deriveEvmAddress`, `evmToSs58`, `toEvmAddress`, `toSS58`, `truncateAddress`, `isValidAddress`, `isValidH160`, `addressesEqual`.

Canonical H160 derivation uses keccak256(accountId32) last-20-bytes (correct for pallet-revive) and handles the 0xEE padding rule for EVM-derived accounts.
