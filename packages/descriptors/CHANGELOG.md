# @polkadot-apps/descriptors

## 0.1.4

### Patch Changes

- f2f6e15: Fix published package containing broken `file:generated` dependency by stripping it in CI before versioning.

## 0.1.3

### Patch Changes

- 022913a: Initial npm publish for all previously unpublished packages

## 0.1.2

### Patch Changes

- b813235: Fix npm consumer installs: remove broken `file:generated` dep from descriptors, add missing `.js` extensions to logger ESM imports.

## 0.1.1

### Patch Changes

- 27019c9: fix: migrate npm publishing to npm_publish_automation dispatch workflow

## 0.1.0

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
