# @polkadot-apps/keys

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
