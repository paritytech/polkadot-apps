# @polkadot-apps

Reusable TypeScript components for rapidly developing applications within the Polkadot ecosystem.

## Getting Started

```bash
pnpm install
pnpm build
pnpm test
```

## Contributing

### Development Workflow

1. Make changes in `packages/<name>/src/`.
2. Build: `pnpm build` (turbo respects the dependency graph).
3. Test: `pnpm test` (runs vitest across all packages).
4. Format: `pnpm format` (biome).

### In-Source Testing

Unit tests live alongside the code they test using vitest's in-source testing. Ex:

```typescript
export function add(a: number, b: number): number {
    return a + b;
}

if (import.meta.vitest) {
    const { test, expect } = import.meta.vitest;

    test("add", () => {
        expect(add(1, 2)).toBe(3);
    });
}
```

The `if (import.meta.vitest)` block is tree-shaken out of production builds. No separate test files needed for unit tests, though `tests/*.test.ts` files are also supported for integration tests.

### Adding a New Package

1. Create `packages/<name>/` with `package.json`, `tsconfig.json`, and `src/index.ts`.
2. `package.json` must include:
   - `"name": "@polkadot-apps/<name>"`
   - `"type": "module"`
   - `"publishConfig": { "access": "public" }`
   - `"files": ["dist"]`
3. `tsconfig.json` must extend `../../tsconfig.json` with `outDir: "./dist"` and `rootDir: "./src"`.
4. Use `"workspace:*"` for internal dependencies and `"catalog:"` for shared versions.

### Versioning & Releases

This repo uses [changesets](https://github.com/changesets/changesets) for versioning.

To prepare a release:

```bash
pnpm changeset
```

Select the packages you changed, choose the semver bump level, and write a summary. This creates a changeset file in `.changeset/`. Commit it with your PR.

When the changeset lands on `main`, the release workflow consumes it, bumps versions, and publishes to npm.

### Code Style

- Formatting is enforced by [Biome](https://biomejs.dev/) — 4-space indent, double quotes, always semicolons, trailing commas.
- Format-on-save is configured in `.vscode/settings.json` (install the Biome extension).
- Run `pnpm format:check` to verify locally, or `pnpm format` to auto-fix.
- Keep packages framework-agnostic. Framework-specific code belongs in `react/` or `vue/` packages (not yet created).