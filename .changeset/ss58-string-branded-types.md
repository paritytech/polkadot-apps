---
"@polkadot-apps/address": minor
"@polkadot-apps/keys": minor
"@polkadot-apps/signer": minor
---

Refine SS58 address types from `string` to `SS58String` branded type.

Return types of `ss58Encode`, `normalizeSs58`, `toGenericSs58`, `toPolkadotSs58`,
`accountIdFromBytes`, and `h160ToSs58` are now `SS58String` instead of `string`.

`DerivedAccount.ss58Address` and `SignerAccount.address` are now `SS58String`.

Input parameters (`isValidSs58`, `ss58Decode`, `accountIdBytes` in address;
`selectAccount` in signer) remain `string` for ergonomic use at validation boundaries.
