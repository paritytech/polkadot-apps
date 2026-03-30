# @polkadot-apps/chain-client

## 0.3.3

### Patch Changes

- Updated dependencies [f2f6e15]
  - @polkadot-apps/descriptors@0.1.4

## 0.3.2

### Patch Changes

- 022913a: Initial npm publish for all previously unpublished packages
- Updated dependencies [022913a]
  - @polkadot-apps/host@0.2.1
  - @polkadot-apps/descriptors@0.1.3

## 0.3.1

### Patch Changes

- Updated dependencies [b813235]
  - @polkadot-apps/descriptors@0.1.2

## 0.3.0

### Minor Changes

- 88383d3: feat: add host package for container detection and Host API types, implement KvStore in storage with host/browser/memory backends, refactor SessionKeyManager to accept an injected store, and move container detection from chain-client to host

### Patch Changes

- Updated dependencies [88383d3]
  - @polkadot-apps/host@0.2.0

## 0.2.2

### Patch Changes

- 6c0e757: feat: implement Bulletin Chain SDK with CID computation, upload/batch upload, gateway fetch, and BulletinClient entry point; throw for unavailable Polkadot/Kusama networks instead of silently using Paseo testnet endpoints

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
