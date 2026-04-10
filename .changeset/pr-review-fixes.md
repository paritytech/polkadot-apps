---
"@polkadot-apps/chain-client": patch
"@polkadot-apps/host": minor
"@polkadot-apps/signer": major
"@polkadot-apps/contracts": minor
"@polkadot-apps/bulletin": patch
---

PR review fixes for the BYOD chain-client refactor.

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
