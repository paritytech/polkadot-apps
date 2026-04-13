# @polkadot-apps/bulletin

## 0.6.6

### Patch Changes

- Updated dependencies [c83fcfa]
  - @polkadot-apps/host@0.5.0
  - @polkadot-apps/chain-client@2.0.1
  - @polkadot-apps/tx@0.3.4

## 0.6.5

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

- Updated dependencies [af74940]
- Updated dependencies [2692df9]
  - @polkadot-apps/chain-client@2.0.0
  - @polkadot-apps/host@0.4.0
  - @polkadot-apps/tx@0.3.3

## 0.6.4

### Patch Changes

- Updated dependencies [6fe9c11]
  - @polkadot-apps/utils@0.4.0
  - @polkadot-apps/tx@0.3.2

## 0.6.3

### Patch Changes

- @polkadot-apps/tx@0.3.1

## 0.6.2

### Patch Changes

- Updated dependencies [5e3beb5]
  - @polkadot-apps/tx@0.3.0

## 0.6.1

### Patch Changes

- Updated dependencies [c286f9b]
  - @polkadot-apps/host@0.3.0
  - @polkadot-apps/chain-client@0.3.8
  - @polkadot-apps/tx@0.2.12

## 0.6.0

### Minor Changes

- e41ea54: Add `checkAuthorization` for pre-flight authorization checks before uploading to the Bulletin Chain. Queries `TransactionStorage.Authorizations` and returns the raw quota (remaining transactions, bytes, expiration block), enabling dApps to show "not authorized" or "insufficient quota" instead of failing mid-transaction.

## 0.5.1

### Patch Changes

- 8bbabe6: Add `blake2b256`, `sha256`, and `keccak256` hash functions to `@polkadot-apps/utils`. Consumers no longer need `@noble/hashes` as a direct dependency for hashing. Migrated bulletin and statement-store to use the new centralized exports.
- Updated dependencies [8bbabe6]
  - @polkadot-apps/utils@0.3.0
  - @polkadot-apps/tx@0.2.11

## 0.5.0

### Minor Changes

- 474a0b8: Add `hashToCid` function to reconstruct a CIDv1 from a `0x`-prefixed hex hash — the reverse of `cidToPreimageKey`. Supports all hash algorithms (blake2b-256, sha2-256, keccak-256) and codecs (raw, dag-pb, dag-cbor) used by the Bulletin Chain. Also exports `HashAlgorithm` and `CidCodec` constants, and broadens `cidToPreimageKey` to accept any supported hash algorithm.

## 0.4.4

### Patch Changes

- @polkadot-apps/tx@0.2.10

## 0.4.3

### Patch Changes

- @polkadot-apps/tx@0.2.9

## 0.4.2

### Patch Changes

- 648008e: Restructure descriptors into per-chain papi builds. Each chain now has its own `.papi/polkadot-api.json` config and generates into `chains/<name>/generated/dist/`. Consumers import via subpath exports (e.g., `import { bulletin } from "@polkadot-apps/descriptors/bulletin"`) which only bundles that chain's metadata. The barrel import is removed. chain-client lazy-loads descriptors per environment via dynamic imports.
- Updated dependencies [648008e]
- Updated dependencies [648008e]
  - @polkadot-apps/host@0.2.3
  - @polkadot-apps/logger@0.1.5
  - @polkadot-apps/tx@0.2.8
  - @polkadot-apps/descriptors@1.0.0
  - @polkadot-apps/chain-client@0.3.7

## 0.4.1

### Patch Changes

- Updated dependencies [abd49ca]
  - @polkadot-apps/tx@0.2.7

## 0.4.0

### Minor Changes

- 304a433: Add host-based query path for bulletin data. Inside a host container (Polkadot Desktop/Mobile), `fetchBytes`/`fetchJson` now route through the host preimage lookup API with local caching and managed polling. Standalone usage falls back to direct IPFS gateway fetch as before.

  New exports: `queryBytes`, `queryJson`, `resolveQueryStrategy`, `cidToPreimageKey`, `QueryStrategy`, `QueryOptions`.

## 0.3.1

### Patch Changes

- Updated dependencies [997e628]
  - @polkadot-apps/chain-client@0.3.6
  - @polkadot-apps/descriptors@0.1.7
  - @polkadot-apps/host@0.2.2
  - @polkadot-apps/logger@0.1.4
  - @polkadot-apps/tx@0.2.6

## 0.3.0

### Minor Changes

- 08cf1c3: Make signer optional in upload functions. When omitted, auto-resolves: uses host preimage API inside containers, dev signer (Alice) when standalone. Adds `preimageKey` to `UploadResult` and makes `blockHash` optional.

## 0.2.6

### Patch Changes

- Updated dependencies [1dcfd0c]
  - @polkadot-apps/descriptors@0.1.6
  - @polkadot-apps/chain-client@0.3.5

## 0.2.5

### Patch Changes

- Updated dependencies [f103fdb]
  - @polkadot-apps/descriptors@0.1.5
  - @polkadot-apps/chain-client@0.3.4

## 0.2.4

### Patch Changes

- Updated dependencies [f2f6e15]
  - @polkadot-apps/descriptors@0.1.4
  - @polkadot-apps/chain-client@0.3.3

## 0.2.3

### Patch Changes

- Updated dependencies [022913a]
  - @polkadot-apps/descriptors@0.1.3
  - @polkadot-apps/tx@0.2.5
  - @polkadot-apps/chain-client@0.3.2

## 0.2.2

### Patch Changes

- Updated dependencies [b813235]
  - @polkadot-apps/descriptors@0.1.2
  - @polkadot-apps/chain-client@0.3.1
  - @polkadot-apps/tx@0.2.4

## 0.2.1

### Patch Changes

- Updated dependencies [88383d3]
  - @polkadot-apps/chain-client@0.3.0
  - @polkadot-apps/tx@0.2.3

## 0.2.0

### Minor Changes

- 6c0e757: feat: implement Bulletin Chain SDK with CID computation, upload/batch upload, gateway fetch, and BulletinClient entry point; throw for unavailable Polkadot/Kusama networks instead of silently using Paseo testnet endpoints

### Patch Changes

- Updated dependencies [6c0e757]
  - @polkadot-apps/chain-client@0.2.2

## 0.1.6

### Patch Changes

- 27019c9: fix: migrate npm publishing to npm_publish_automation dispatch workflow
- Updated dependencies [27019c9]
  - @polkadot-apps/address@0.3.1

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
