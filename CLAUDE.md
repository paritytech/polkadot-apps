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

- `@polkadot-apps/descriptors` provides per-chain subpath imports (e.g., `@polkadot-apps/descriptors/bulletin`). Prefer these over the barrel import to avoid bundling all chain metadata.
- `pnpm generate-descriptors` runs `papi` then `scripts/generate-per-chain.mjs` to produce per-chain entry files.
- Adding a new chain requires updating: (1) `scripts/generate.sh` (add the chain), (2) `scripts/generate-per-chain.mjs` (add to the `chains` array), (3) `package.json` exports map (add a subpath entry).

## Reference Repos

Refer to `./reference-repos/` when developing as some of these will likely be relevant references to the task you are working on.