# @polkadot-apps/signer

## 0.2.1

### Patch Changes

- @polkadot-apps/keys@0.4.1

## 0.2.0

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
  - @polkadot-apps/keys@0.4.0

## 0.1.7

### Patch Changes

- @polkadot-apps/keys@0.3.8

## 0.1.6

### Patch Changes

- @polkadot-apps/keys@0.3.7

## 0.1.5

### Patch Changes

- @polkadot-apps/keys@0.3.6

## 0.1.4

### Patch Changes

- Updated dependencies [b9a8385]
  - @polkadot-apps/keys@0.3.5

## 0.1.3

### Patch Changes

- 648008e: Add `sideEffects: false` to all packages and disable source map generation to improve tree-shaking and reduce published package size.
- Updated dependencies [648008e]
  - @polkadot-apps/address@0.3.3
  - @polkadot-apps/keys@0.3.4
  - @polkadot-apps/logger@0.1.5

## 0.1.2

### Patch Changes

- 997e628: Add README documentation and package descriptions for all packages.
- Updated dependencies [997e628]
  - @polkadot-apps/address@0.3.2
  - @polkadot-apps/keys@0.3.3
  - @polkadot-apps/logger@0.1.4

## 0.1.1

### Patch Changes

- 022913a: Initial npm publish for all previously unpublished packages
- Updated dependencies [022913a]
  - @polkadot-apps/keys@0.3.2
