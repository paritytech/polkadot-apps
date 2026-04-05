---
"@polkadot-apps/utils": minor
"@polkadot-apps/crypto": major
"@polkadot-apps/keys": patch
---

Add `@polkadot-apps/utils` package with encoding utilities (`bytesToHex`, `hexToBytes`, `utf8ToBytes`, `concatBytes`) and token formatting (`formatPlanck`, `parseToPlanck`).

**Breaking:** `bytesToHex`, `hexToBytes`, `utf8ToBytes`, and `concatBytes` are removed from `@polkadot-apps/crypto`. Import them from `@polkadot-apps/utils` instead. `randomBytes` remains in `@polkadot-apps/crypto`.
