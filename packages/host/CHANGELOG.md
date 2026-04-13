# @polkadot-apps/host

## 0.5.0

### Minor Changes

- c83fcfa: fix: rewrite statement-store transport — host API first, remove custom SCALE codec

  **@polkadot-apps/statement-store:**

  - Rewrite transport layer with host-first architecture: inside containers, uses the Host API's native `remote_statement_store_*` protocol (bypasses JSON-RPC). Outside containers, falls back to direct WebSocket via `@polkadot-api/substrate-client` + `@novasamatech/sdk-statement`.
  - Remove custom SCALE codec (buggy field tag ordering). Encoding/decoding handled by `@novasamatech/sdk-statement` and the host API.
  - Remove `@polkadot-apps/chain-client` and `@polkadot-apps/descriptors` dependencies (no descriptors baggage).
  - Add `ConnectionCredentials` type for dual connection modes: `{ mode: "host", accountId }` and `{ mode: "local", signer }`.
  - Re-export `Statement`/`SignedStatement` types from `@novasamatech/sdk-statement`.
  - `ReceivedStatement` fields changed: `signerHex` (string), `channelHex` (string), `topics` (string[]).

  **@polkadot-apps/host:**

  - Add `getStatementStore()` for host API statement store access.
  - Add shared chain config (`BULLETIN_RPCS`, `DEFAULT_BULLETIN_ENDPOINT`) — single source of truth.

## 0.4.0

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

## 0.3.0

### Minor Changes

- c286f9b: Add `getHostProvider` to `@polkadot-apps/host` — wraps product-sdk's `createPapiProvider` so apps can get host-routed chain connections without importing `@novasamatech/product-sdk` directly. Migrated chain-client to use this wrapper, removing its direct product-sdk dependency.

## 0.2.3

### Patch Changes

- 648008e: Add `sideEffects: false` to all packages and disable source map generation to improve tree-shaking and reduce published package size.

## 0.2.2

### Patch Changes

- 997e628: Add README documentation and package descriptions for all packages.

## 0.2.1

### Patch Changes

- 022913a: Initial npm publish for all previously unpublished packages

## 0.2.0

### Minor Changes

- 88383d3: feat: add host package for container detection and Host API types, implement KvStore in storage with host/browser/memory backends, refactor SessionKeyManager to accept an injected store, and move container detection from chain-client to host
