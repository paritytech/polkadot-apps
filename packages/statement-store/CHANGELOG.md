# @polkadot-apps/statement-store

## 0.3.0

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

### Patch Changes

- Updated dependencies [c83fcfa]
  - @polkadot-apps/host@0.5.0

## 0.2.11

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

- Updated dependencies [af74940]
- Updated dependencies [2692df9]
  - @polkadot-apps/chain-client@2.0.0

## 0.2.10

### Patch Changes

- Updated dependencies [6fe9c11]
  - @polkadot-apps/utils@0.4.0

## 0.2.9

### Patch Changes

- Updated dependencies [c286f9b]
  - @polkadot-apps/chain-client@0.3.8

## 0.2.8

### Patch Changes

- 8bbabe6: Add `blake2b256`, `sha256`, and `keccak256` hash functions to `@polkadot-apps/utils`. Consumers no longer need `@noble/hashes` as a direct dependency for hashing. Migrated bulletin and statement-store to use the new centralized exports.
- Updated dependencies [8bbabe6]
  - @polkadot-apps/utils@0.3.0

## 0.2.7

### Patch Changes

- 648008e: Restructure descriptors into per-chain papi builds. Each chain now has its own `.papi/polkadot-api.json` config and generates into `chains/<name>/generated/dist/`. Consumers import via subpath exports (e.g., `import { bulletin } from "@polkadot-apps/descriptors/bulletin"`) which only bundles that chain's metadata. The barrel import is removed. chain-client lazy-loads descriptors per environment via dynamic imports.
- Updated dependencies [648008e]
- Updated dependencies [648008e]
  - @polkadot-apps/logger@0.1.5
  - @polkadot-apps/descriptors@1.0.0
  - @polkadot-apps/chain-client@0.3.7

## 0.2.6

### Patch Changes

- abd49ca: Remove unused variables and imports

## 0.2.5

### Patch Changes

- 997e628: Add README documentation and package descriptions for all packages.
- Updated dependencies [997e628]
  - @polkadot-apps/chain-client@0.3.6
  - @polkadot-apps/descriptors@0.1.7
  - @polkadot-apps/logger@0.1.4

## 0.2.4

### Patch Changes

- Updated dependencies [1dcfd0c]
  - @polkadot-apps/descriptors@0.1.6
  - @polkadot-apps/chain-client@0.3.5

## 0.2.3

### Patch Changes

- Updated dependencies [f103fdb]
  - @polkadot-apps/descriptors@0.1.5
  - @polkadot-apps/chain-client@0.3.4

## 0.2.2

### Patch Changes

- Updated dependencies [f2f6e15]
  - @polkadot-apps/descriptors@0.1.4
  - @polkadot-apps/chain-client@0.3.3

## 0.2.1

### Patch Changes

- Updated dependencies [022913a]
  - @polkadot-apps/descriptors@0.1.3
  - @polkadot-apps/chain-client@0.3.2

## 0.2.0

### Minor Changes

- ce7c113: feat(statement-store): add statement store client package

  High-level client for the Polkadot Statement Store ephemeral pub/sub layer.
  Provides typed publish/subscribe, SCALE encoding, Sr25519 signing, topic management,
  channel-based last-write-wins semantics, and resilient delivery with subscription + polling fallback.
