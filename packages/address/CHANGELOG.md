# @polkadot-apps/address

## 0.3.3

### Patch Changes

- 648008e: Add `sideEffects: false` to all packages and disable source map generation to improve tree-shaking and reduce published package size.

## 0.3.2

### Patch Changes

- 997e628: Add README documentation and package descriptions for all packages.

## 0.3.1

### Patch Changes

- 27019c9: fix: migrate npm publishing to npm_publish_automation dispatch workflow

## 0.3.0

### Minor Changes

- 77b7afb: Implement address utilities: SS58 encode/decode/validate/normalize, H160 derivation (pallet-revive keccak256 + 0xEE padding rule), H160-SS58 round-trip conversion, display truncation, and address comparison

## 0.2.0

### Minor Changes

- 43a9c3e: Implement `@polkadot-apps/address` with canonical SS58/H160 utilities for pallet-revive.

  Exports: `isValidSS58`, `normalizeSS58`, `toGenericSS58`, `toPolkadotSS58`, `ss58ToH160`, `deriveEvmAddress`, `evmToSs58`, `toEvmAddress`, `toSS58`, `truncateAddress`, `isValidAddress`, `isValidH160`, `addressesEqual`.

  Canonical H160 derivation uses keccak256(accountId32) last-20-bytes (correct for pallet-revive) and handles the 0xEE padding rule for EVM-derived accounts.

## 0.1.3

### Patch Changes

- 8adfb60: test release

## 0.1.2

### Patch Changes

- b1cb3f1: test release

## 0.1.1

### Patch Changes

- 5de5276: Initial skeleton release
