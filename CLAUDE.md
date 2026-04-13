# CLAUDE.md

Follow the contributor guidelines in `README.md`.

## Quick Reference

- **Build:** `pnpm build`
- **Dev:** `pnpm dev`
- **Clean:** `pnpm clean`
- **Test:** `pnpm test`
- **Test with coverage:** `pnpm test:coverage`
- **Format:** `pnpm format`
- **Format check:** `pnpm format:check`
- **Generate descriptors:** `pnpm generate-descriptors`
- **Generate docs:** `pnpm docs`

## Key Conventions

- All packages live in `packages/<name>/` and are scoped under `@polkadot-apps/`.
- Use in-source testing (`if (import.meta.vitest)` blocks) for unit tests. Separate `tests/*.test.ts` files are for integration tests only.
- Internal deps use `"workspace:*"`, shared versions use `"catalog:"` from `pnpm-workspace.yaml`.
- Packages must be framework-agnostic pure TypeScript. No React/Vue imports in core packages.
- Biome handles formatting — do not use prettier or eslint.
- Changesets are required for any change to published packages. Run `pnpm changeset` and include the generated file in your commit.

## Descriptors

- `@polkadot-apps/descriptors` provides per-chain subpath imports (e.g., `@polkadot-apps/descriptors/bulletin`). Each subpath is a separate papi build — no barrel import, no unnecessary chain metadata.
- Each chain lives in `packages/descriptors/chains/<name>/` with its own `.papi/polkadot-api.json` config. `pnpm generate-descriptors` fetches metadata and runs `papi generate` per chain.
- Adding a new chain: (1) add `papi add` in `scripts/generate.sh`, (2) create `chains/<name>/` with `.papi/polkadot-api.json` and `package.json`, (3) add chain to `CHAINS` in `scripts/build.sh`, (4) add subpath export in `package.json`.

## Chain Client

- `@polkadot-apps/chain-client` offers **two ways** to connect:
  - **BYOD** (`createChainClient`): bring your own descriptors and RPCs. Zero overhead from unused chains.
  - **Preset** (`getChainAPI`): zero-config with built-in descriptors and RPCs for known environments (paseo, polkadot, kusama).
- Both return a `ChainClient<T>` with typed APIs per chain key, `.raw` for `PolkadotClient` access, and `.destroy()`.
- `@polkadot-api/sdk-ink` is **not** a dependency of chain-client. Consumers who need contracts create `InkSdk` themselves: `createInkSdk(client.raw.assetHub, { atBest: true })`.
- `isInsideContainerSync()` is available from both `@polkadot-apps/host` and `@polkadot-apps/chain-client` for synchronous container detection in performance-critical code paths. The async `isInsideContainer()` (which uses product-sdk) remains the primary API.
- Bulletin RPC endpoints are imported from `@polkadot-apps/host`'s shared chain config (`BULLETIN_RPCS`), not hardcoded in presets.

## Contracts

- `@polkadot-apps/contracts` provides typed contract interactions on Asset Hub (Ink!/PolkaVM and Solidity). Contracts are defined via a `cdm.json` manifest or raw ABI arrays.
- Key exports: `ContractManager` (loads contracts from cdm.json, resolves targets), `createContract` (standalone single-contract handle from an ABI + address), `generateContractTypes` (codegen that maps Solidity ABI types to TypeScript).
- `InkSdk` is created by the consumer via `createInkSdk(client.raw.assetHub)` and passed to `ContractManager` or `createContract`. This is the size-optimized path recommended for production.
- Convenience factories `ContractManager.fromClient(cdmJson, client, options)` and `createContractFromClient(client, address, abi, options)` create InkSdk internally from a `ChainClient`. These are simpler but pull in `@polkadot-api/sdk-ink` as a transitive dependency.
- Uses `@polkadot-apps/signer` via `SignerManager` for automatic signer/origin resolution.
- Each contract method exposes `.query()` (dry-run) and `.tx()` (submit transaction). Signer resolution order: explicit call option > `signerManager` > static `defaultSigner`.
- The `@polkadot-apps/contracts/codegen` subpath export provides `generateContractTypes` separately for build-time use without pulling in runtime dependencies.
- The `Contracts` interface in `types.ts` is augmentable via module augmentation — codegen extends it so `getContract()` returns fully-typed handles.

## Statement Store

- `@polkadot-apps/statement-store` provides publish/subscribe over the Polkadot Statement Store with topic-based routing and host-first transport.
- **Transport is host-first**: Inside containers, uses the Host API's native `remote_statement_store_*` protocol (bypasses JSON-RPC). Outside containers, falls back to direct WebSocket via `@polkadot-api/substrate-client` + `@novasamatech/sdk-statement`.
- **Two connection modes**: `{ mode: "host", accountId }` for containers (proof creation delegated to host), `{ mode: "local", signer }` for direct RPC (local Sr25519 signing via `getStatementSigner` from sdk-statement).
- Dependencies: `@polkadot-apps/host`, `@polkadot-apps/logger`, `@polkadot-apps/utils`, `@novasamatech/sdk-statement`, `@polkadot-api/substrate-client`, `polkadot-api`. Does **not** depend on chain-client or descriptors.
- `Statement` and `SignedStatement` types are re-exported from `@novasamatech/sdk-statement`.
- Bulletin RPC endpoints are shared via `@polkadot-apps/host`'s `BULLETIN_RPCS` / `DEFAULT_BULLETIN_ENDPOINT` — single source of truth used by both chain-client presets and statement-store.

## Skills

AI coding assistants (Claude Code, Copilot, Gemini, Codex) use the skills in `skills/` to build apps with `@polkadot-apps` packages end-to-end. **When modifying packages, update the corresponding skills:**

- **Changing a package's public API** → update the matching skill's `references/` files with new signatures.
- **Adding a new package** → add it to the appropriate skill (or create a new one) and update `skills/polkadot-app-builder/references/package-selector.md`.
- **Changing supported chains/environments** → update `skills/polkadot-app-builder/references/chains.md` and `skills/polkadot-chain-connection/references/descriptors-guide.md`.
- **Modifying examples** → ensure skills still match.

| Skill | Packages Covered |
|-------|-----------------|
| `polkadot-app-builder` | Orchestrator — routes to domain skills, scaffolds projects |
| `polkadot-chain-connection` | chain-client, descriptors, host |
| `polkadot-contracts` | contracts |
| `polkadot-transactions` | tx, signer, keys |
| `polkadot-bulletin` | bulletin |
| `polkadot-statement-store` | statement-store |
| `polkadot-utilities` | address, crypto, utils, storage, logger |

## Examples

The `examples/` directory contains sample applications for validation and benchmarking:

- **`examples/multi-chain-explorer/`** — CLI app that queries Paseo chain state, balances, submits a remark transaction, and demonstrates batch transaction submission. Run with `pnpm start` from the example directory (after `pnpm build` from root).
- **`examples/t3rminal-lite/`** — Next.js web app demonstrating wallet connection, address display, and transaction submission. Run with `pnpm dev` from the example directory.

## Reference Repos

Refer to `./reference-repos/` when developing as some of these will likely be relevant references to the task you are working on.