# @polkadot-apps/descriptors

## 1.0.1

### Patch Changes

- 0b79474: Migrate individuality (People) chain to Paseo Next endpoint (`wss://paseo-people-next-rpc.polkadot.io`, genesis `0xd01475fd…b47d64`). The old `pop3-testnet.parity-lab.parity.io/people` stable-stage endpoint was unreachable for users on the Paseo Next environment, causing connection retry spam when using `getChainAPI("paseo")`. Descriptor regenerated against the new chain.

## 1.0.0

### Major Changes

- 648008e: Restructure descriptors into per-chain papi builds. Each chain now has its own `.papi/polkadot-api.json` config and generates into `chains/<name>/generated/dist/`. Consumers import via subpath exports (e.g., `import { bulletin } from "@polkadot-apps/descriptors/bulletin"`) which only bundles that chain's metadata. The barrel import is removed. chain-client lazy-loads descriptors per environment via dynamic imports.

## 0.1.7

### Patch Changes

- 997e628: Add README documentation and package descriptions for all packages.

## 0.1.6

### Patch Changes

- 1dcfd0c: Fix release workflow to strip `file:generated` dependency after build step, preventing papi from re-adding it before publish.

## 0.1.5

### Patch Changes

- f103fdb: Fix release workflow to strip `file:generated` dependency after changeset version step, preventing the dependency from being re-added before publish.

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
