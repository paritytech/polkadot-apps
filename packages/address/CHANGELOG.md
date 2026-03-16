# @polkadot-apps/address

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
