# @polkadot-apps/chain-client

## 0.2.1

### Patch Changes

- 27019c9: fix: migrate npm publishing to npm_publish_automation dispatch workflow
- Updated dependencies [27019c9]
  - @polkadot-apps/descriptors@0.1.1

## 0.2.0

### Minor Changes

- 8ee181c: Add `@polkadot-apps/descriptors` with PAPI-generated typed chain descriptors for Polkadot, Kusama, and Paseo environments (asset hub, bulletin, individuality).

  Implement `@polkadot-apps/chain-client` with descriptor-driven, zero-config chain connections.

  Public API: getChainAPI, getClient, isConnected, destroyAll, isInsideContainer.

  Features:

  - Environment-based API (polkadot | kusama | paseo) returning fully typed chain access
  - Automatic container detection via @novasamatech/product-sdk with manual fallback
  - Env-scoped client caching with HMR survival via globalThis
  - Smoldot light client support with relay chain caching
  - Contract SDK (Ink) on asset hub

### Patch Changes

- Updated dependencies [8ee181c]
  - @polkadot-apps/descriptors@0.1.0

## 0.1.5

### Patch Changes

- Updated dependencies [77b7afb]
  - @polkadot-apps/address@0.3.0

## 0.1.4

### Patch Changes

- Updated dependencies [43a9c3e]
  - @polkadot-apps/address@0.2.0

## 0.1.3

### Patch Changes

- 8adfb60: test release
- Updated dependencies [8adfb60]
  - @polkadot-apps/address@0.1.3

## 0.1.2

### Patch Changes

- b1cb3f1: test release
- Updated dependencies [b1cb3f1]
  - @polkadot-apps/address@0.1.2

## 0.1.1

### Patch Changes

- 5de5276: Initial skeleton release
- Updated dependencies [5de5276]
  - @polkadot-apps/address@0.1.1
