# @polkadot-apps

Reusable TypeScript components for rapidly developing applications within the Polkadot ecosystem.

## Packages

| Package | Description |
|---------|-------------|
| [`@polkadot-apps/address`](https://www.npmjs.com/package/@polkadot-apps/address) | Substrate and EVM address utilities — SS58/H160 encoding, validation, and conversion |
| [`@polkadot-apps/bulletin`](https://www.npmjs.com/package/@polkadot-apps/bulletin) | TypeScript SDK for uploading and retrieving data on the Polkadot Bulletin Chain |
| [`@polkadot-apps/chain-client`](https://www.npmjs.com/package/@polkadot-apps/chain-client) | Multi-chain Polkadot API client with typed access to Asset Hub, Bulletin, and Individuality chains |
| [`@polkadot-apps/crypto`](https://www.npmjs.com/package/@polkadot-apps/crypto) | Cryptographic primitives — symmetric encryption, key derivation, and NaCl operations |
| [`@polkadot-apps/descriptors`](https://www.npmjs.com/package/@polkadot-apps/descriptors) | Pre-generated Polkadot API descriptors for Asset Hub, Bulletin, and Individuality chains |
| [`@polkadot-apps/host`](https://www.npmjs.com/package/@polkadot-apps/host) | Host container detection and storage access for Polkadot Desktop and Mobile environments |
| [`@polkadot-apps/keys`](https://www.npmjs.com/package/@polkadot-apps/keys) | Hierarchical key derivation and session key management for Polkadot accounts |
| [`@polkadot-apps/logger`](https://www.npmjs.com/package/@polkadot-apps/logger) | Structured, namespace-filtered logging for the @polkadot-apps ecosystem |
| [`@polkadot-apps/signer`](https://www.npmjs.com/package/@polkadot-apps/signer) | Multi-provider signer manager — Host API, browser extensions, and dev accounts |
| [`@polkadot-apps/statement-store`](https://www.npmjs.com/package/@polkadot-apps/statement-store) | Publish/subscribe client for the Polkadot Statement Store with topic-based routing |
| [`@polkadot-apps/storage`](https://www.npmjs.com/package/@polkadot-apps/storage) | Key-value storage abstraction with automatic host/browser backend detection |
| [`@polkadot-apps/tx`](https://www.npmjs.com/package/@polkadot-apps/tx) | Transaction submission, lifecycle watching, and dev signers for Polkadot chains |

## Documentation

Full API documentation is available at [paritytech.github.io/polkadot-apps](https://paritytech.github.io/polkadot-apps/).

## Getting Started

```bash
bash setup.sh

pnpm build
pnpm test
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages (turbo respects the dependency graph) |
| `pnpm dev` | Start dev mode with watch |
| `pnpm test` | Run vitest across all packages |
| `pnpm test:coverage` | Run tests with coverage reporting |
| `pnpm format` | Auto-fix formatting with Biome |
| `pnpm format:check` | Check formatting without writing |
| `pnpm clean` | Remove build artifacts |
| `pnpm docs` | Generate API docs with TypeDoc |

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