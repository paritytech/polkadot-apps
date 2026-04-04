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

## Reference Repos

Refer to `./reference-repos/` when developing as some of these will likely be relevant references to the task you are working on.