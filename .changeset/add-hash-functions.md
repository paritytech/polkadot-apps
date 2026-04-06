---
"@polkadot-apps/utils": minor
"@polkadot-apps/bulletin": patch
"@polkadot-apps/statement-store": patch
---

Add `blake2b256`, `sha256`, and `keccak256` hash functions to `@polkadot-apps/utils`. Consumers no longer need `@noble/hashes` as a direct dependency for hashing. Migrated bulletin and statement-store to use the new centralized exports.
