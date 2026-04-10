# @polkadot-apps/utils

## 0.4.0

### Minor Changes

- 6fe9c11: Add `formatBalance` for locale-aware display formatting with thousand separators, decimal truncation, and optional token symbol. Add `getBalance` typed convenience wrapper for System.Account balance queries.

## 0.3.0

### Minor Changes

- 8bbabe6: Add `blake2b256`, `sha256`, and `keccak256` hash functions to `@polkadot-apps/utils`. Consumers no longer need `@noble/hashes` as a direct dependency for hashing. Migrated bulletin and statement-store to use the new centralized exports.

## 0.2.1

### Patch Changes

- 562a36f: Initial npm publish for @polkadot-apps/utils

## 0.2.0

### Minor Changes

- b9a8385: Add `@polkadot-apps/utils` package with encoding utilities (`bytesToHex`, `hexToBytes`, `utf8ToBytes`, `concatBytes`) and token formatting (`formatPlanck`, `parseToPlanck`).

  **Breaking:** `bytesToHex`, `hexToBytes`, `utf8ToBytes`, and `concatBytes` are removed from `@polkadot-apps/crypto`. Import them from `@polkadot-apps/utils` instead. `randomBytes` remains in `@polkadot-apps/crypto`.
