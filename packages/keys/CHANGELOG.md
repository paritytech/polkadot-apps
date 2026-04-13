# @polkadot-apps/keys

## 0.4.4

### Patch Changes

- @polkadot-apps/storage@0.2.8

## 0.4.3

### Patch Changes

- @polkadot-apps/storage@0.2.7

## 0.4.2

### Patch Changes

- @polkadot-apps/storage@0.2.6

## 0.4.1

### Patch Changes

- Updated dependencies [6fe9c11]
  - @polkadot-apps/utils@0.4.0

## 0.4.0

### Minor Changes

- f047507: Refine SS58 address types from `string` to `SS58String` branded type.

  Return types of `ss58Encode`, `normalizeSs58`, `toGenericSs58`, `toPolkadotSs58`,
  `accountIdFromBytes`, and `h160ToSs58` are now `SS58String` instead of `string`.

  `DerivedAccount.ss58Address` and `SignerAccount.address` are now `SS58String`.

  Input parameters (`isValidSs58`, `ss58Decode`, `accountIdBytes` in address;
  `selectAccount` in signer) remain `string` for ergonomic use at validation boundaries.

### Patch Changes

- Updated dependencies [f047507]
  - @polkadot-apps/address@0.4.0

## 0.3.8

### Patch Changes

- @polkadot-apps/storage@0.2.5

## 0.3.7

### Patch Changes

- Updated dependencies [8bbabe6]
  - @polkadot-apps/utils@0.3.0

## 0.3.6

### Patch Changes

- Updated dependencies [562a36f]
  - @polkadot-apps/utils@0.2.1

## 0.3.5

### Patch Changes

- b9a8385: Add `@polkadot-apps/utils` package with encoding utilities (`bytesToHex`, `hexToBytes`, `utf8ToBytes`, `concatBytes`) and token formatting (`formatPlanck`, `parseToPlanck`).

  **Breaking:** `bytesToHex`, `hexToBytes`, `utf8ToBytes`, and `concatBytes` are removed from `@polkadot-apps/crypto`. Import them from `@polkadot-apps/utils` instead. `randomBytes` remains in `@polkadot-apps/crypto`.

- Updated dependencies [b9a8385]
  - @polkadot-apps/utils@0.2.0
  - @polkadot-apps/crypto@1.0.0

## 0.3.4

### Patch Changes

- 648008e: Add `sideEffects: false` to all packages and disable source map generation to improve tree-shaking and reduce published package size.
- Updated dependencies [648008e]
  - @polkadot-apps/address@0.3.3
  - @polkadot-apps/crypto@0.3.4
  - @polkadot-apps/storage@0.2.4

## 0.3.3

### Patch Changes

- 997e628: Add README documentation and package descriptions for all packages.
- Updated dependencies [997e628]
  - @polkadot-apps/address@0.3.2
  - @polkadot-apps/crypto@0.3.3
  - @polkadot-apps/storage@0.2.3

## 0.3.2

### Patch Changes

- 022913a: Initial npm publish for all previously unpublished packages
- Updated dependencies [022913a]
  - @polkadot-apps/crypto@0.3.2
  - @polkadot-apps/storage@0.2.2

## 0.3.1

### Patch Changes

- @polkadot-apps/storage@0.2.1

## 0.3.0

### Minor Changes

- 88383d3: feat: add host package for container detection and Host API types, implement KvStore in storage with host/browser/memory backends, refactor SessionKeyManager to accept an injected store, and move container detection from chain-client to host

### Patch Changes

- Updated dependencies [88383d3]
  - @polkadot-apps/storage@0.2.0

## 0.2.2

### Patch Changes

- 27019c9: fix: migrate npm publishing to npm_publish_automation dispatch workflow
- Updated dependencies [27019c9]
  - @polkadot-apps/address@0.3.1
  - @polkadot-apps/crypto@0.3.1

## 0.2.1

### Patch Changes

- Updated dependencies [d404b4e]
  - @polkadot-apps/crypto@0.3.0

## 0.2.0

### Minor Changes

- aa6f53d: Implement hierarchical key management: KeyManager (HKDF master key derivation, symmetric keys, sr25519 accounts, NaCl keypairs), SessionKeyManager (mnemonic-based ephemeral accounts with auto-detected storage), and seedToAccount standalone function
