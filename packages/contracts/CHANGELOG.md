# @polkadot-apps/contracts

## 0.4.1

### Patch Changes

- Updated dependencies [50828e8]
  - @polkadot-apps/tx@0.3.6

## 0.4.0

### Minor Changes

- 4b60d19: Add `.prepare(...args, opts?)` to every contract method. Returns a `BatchableCall` consumable by `batchSubmitAndWatch` from `@polkadot-apps/tx`, so multiple contract calls (or contract calls mixed with other transactions on the same chain) can be grouped into a single atomic `Utility.batch_all` without dropping down to `@polkadot-api/sdk-ink` directly. `opts` accepts `origin`, `value`, `gasLimit`, and `storageDepositLimit` — signer and submission-lifecycle options belong to the batch submit, not the individual prepared call.

## 0.3.2

### Patch Changes

- Updated dependencies [652b215]
- Updated dependencies [652b215]
  - @polkadot-apps/signer@1.1.0
  - @polkadot-apps/keys@0.4.4
  - @polkadot-apps/tx@0.3.5

## 0.3.1

### Patch Changes

- @polkadot-apps/signer@1.0.1
- @polkadot-apps/keys@0.4.3
- @polkadot-apps/tx@0.3.4

## 0.3.0

### Minor Changes

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

### Patch Changes

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

- Updated dependencies [2692df9]
  - @polkadot-apps/signer@1.0.0
  - @polkadot-apps/keys@0.4.2
  - @polkadot-apps/tx@0.3.3

## 0.2.1

### Patch Changes

- 3f33cdc: Re-release contracts package

## 0.2.0

### Minor Changes

- 57ce974: Add @polkadot-apps/contracts package for typed contract interactions on Polkadot
