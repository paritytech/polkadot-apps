# @polkadot-apps/chain-client

## 2.0.6

### Patch Changes

- Updated dependencies [ca934de]
  - @polkadot-apps/descriptors@1.0.2

## 2.0.5

### Patch Changes

- cfd1325: Rotate Paseo Asset Hub preset RPC endpoints. `getChainAPI("paseo")` now connects to IBP's new `asset-hub-paseo.ibp.network` subdomain first, with Dotters and TurboFlakes as additional live providers, and Dwellir retained as a fallback. Removes the deprecated `sys.ibp.network/asset-hub-paseo` path (now returning 502). Resolves "Unable to connect" loops observed during cold start when both previously-listed endpoints were unhealthy simultaneously.

## 2.0.4

### Patch Changes

- 0b79474: Migrate individuality (People) chain to Paseo Next endpoint (`wss://paseo-people-next-rpc.polkadot.io`, genesis `0xd01475fd…b47d64`). The old `pop3-testnet.parity-lab.parity.io/people` stable-stage endpoint was unreachable for users on the Paseo Next environment, causing connection retry spam when using `getChainAPI("paseo")`. Descriptor regenerated against the new chain.
- Updated dependencies [0b79474]
  - @polkadot-apps/descriptors@1.0.1

## 2.0.3

### Patch Changes

- 6ba8ae6: Fix Paseo Asset Hub primary RPC endpoint (dwellir.com → n.dwellir.com)

## 2.0.2

### Patch Changes

- Updated dependencies [652b215]
  - @polkadot-apps/host@0.5.1

## 2.0.1

### Patch Changes

- Updated dependencies [c83fcfa]
  - @polkadot-apps/host@0.5.0

## 2.0.0

### Major Changes

- af74940: BYOD chain client: new `createChainClient()` for user-provided descriptors and RPCs with zero size overhead from unused chains.

  **Breaking changes:**

  - `.contracts` removed from the chain client return type. Create InkSdk yourself: `createInkSdk(client.raw.assetHub, { atBest: true })`.
  - `.raw` added: exposes `PolkadotClient` per chain name for advanced use.
  - `ChainAPI<E>` type replaced by `ChainClient<T>` and `PresetChains<E>`.
  - `@polkadot-api/sdk-ink` removed from chain-client dependencies (moved to consumer).

  **New features:**

  - `createChainClient({ chains, rpcs })` — BYOD path, import only the chains you need.
  - `getChainAPI("paseo")` preserved as zero-config preset wrapper.
  - Both return the same `ChainClient<T>` type with typed APIs + `.raw` + `.destroy()`.

### Patch Changes

- 2692df9: PR review fixes for the BYOD chain-client refactor.

  **@polkadot-apps/chain-client** (patch):

  - Fix resource leak: partial `createChainClient` failures now clean up orphaned WebSocket connections.
  - Remove dead code: GENESIS constants moved to test scope, redundant `clearClientInstances` removed.
  - Add `isInsideContainerSync` re-export from host.
  - Fix README `await` on async `isInsideContainer()`.

  **@polkadot-apps/host** (minor):

  - Export `isInsideContainerSync()` — synchronous container detection for performance-critical code paths.
  - `isInsideContainer()` (async, uses product-sdk) remains the primary API.

  **@polkadot-apps/signer** (major):

  - **Breaking**: `isInsideContainer` is no longer exported from signer. Import from `@polkadot-apps/host` instead (`isInsideContainer` for async, `isInsideContainerSync` for sync).
  - Container detection consolidated into `@polkadot-apps/host` as the single source of truth.

  **@polkadot-apps/contracts** (minor):

  - New `ContractManager.fromClient(cdmJson, client, options)` async factory — creates InkSdk internally via dynamic import for convenience.
  - New `createContractFromClient(client, address, abi, options)` standalone convenience function.
  - Existing constructor (`new ContractManager(cdm, inkSdk)`) remains the size-optimized path.

  **@polkadot-apps/bulletin** (patch):

  - Import `Environment` type from `@polkadot-apps/chain-client` instead of defining locally.

- Updated dependencies [2692df9]
  - @polkadot-apps/host@0.4.0

## 0.3.8

### Patch Changes

- c286f9b: Add `getHostProvider` to `@polkadot-apps/host` — wraps product-sdk's `createPapiProvider` so apps can get host-routed chain connections without importing `@novasamatech/product-sdk` directly. Migrated chain-client to use this wrapper, removing its direct product-sdk dependency.
- Updated dependencies [c286f9b]
  - @polkadot-apps/host@0.3.0

## 0.3.7

### Patch Changes

- 648008e: Restructure descriptors into per-chain papi builds. Each chain now has its own `.papi/polkadot-api.json` config and generates into `chains/<name>/generated/dist/`. Consumers import via subpath exports (e.g., `import { bulletin } from "@polkadot-apps/descriptors/bulletin"`) which only bundles that chain's metadata. The barrel import is removed. chain-client lazy-loads descriptors per environment via dynamic imports.
- Updated dependencies [648008e]
- Updated dependencies [648008e]
  - @polkadot-apps/host@0.2.3
  - @polkadot-apps/descriptors@1.0.0

## 0.3.6

### Patch Changes

- 997e628: Add README documentation and package descriptions for all packages.
- Updated dependencies [997e628]
  - @polkadot-apps/descriptors@0.1.7
  - @polkadot-apps/host@0.2.2

## 0.3.5

### Patch Changes

- Updated dependencies [1dcfd0c]
  - @polkadot-apps/descriptors@0.1.6

## 0.3.4

### Patch Changes

- Updated dependencies [f103fdb]
  - @polkadot-apps/descriptors@0.1.5

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
