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

## Reference Repos

Refer to `./reference-repos/` when developing as some of these will likely be relevant references to the task you are working on.