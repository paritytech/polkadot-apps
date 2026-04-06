# @polkadot-apps/utils

## 0.2.1

### Patch Changes

- 562a36f: Initial npm publish for @polkadot-apps/utils

## 0.2.0

### Minor Changes

- b9a8385: Add `@polkadot-apps/utils` package with encoding utilities (`bytesToHex`, `hexToBytes`, `utf8ToBytes`, `concatBytes`) and token formatting (`formatPlanck`, `parseToPlanck`).

  **Breaking:** `bytesToHex`, `hexToBytes`, `utf8ToBytes`, and `concatBytes` are removed from `@polkadot-apps/crypto`. Import them from `@polkadot-apps/utils` instead. `randomBytes` remains in `@polkadot-apps/crypto`.
