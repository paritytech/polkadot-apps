# @polkadot-apps

Reusable TypeScript components for rapidly developing applications within the Polkadot ecosystem.

## Packages

| Package | Description |
|---------|-------------|
| [`@polkadot-apps/address`](https://www.npmjs.com/package/@polkadot-apps/address) | Substrate and EVM address utilities — SS58/H160 encoding, validation, and conversion |
| [`@polkadot-apps/bulletin`](https://www.npmjs.com/package/@polkadot-apps/bulletin) | TypeScript SDK for uploading and retrieving data on the Polkadot Bulletin Chain |
| [`@polkadot-apps/chain-client`](https://www.npmjs.com/package/@polkadot-apps/chain-client) | Multi-chain Polkadot API client with typed access to Asset Hub, Bulletin, and Individuality chains |
| [`@polkadot-apps/contracts`](https://www.npmjs.com/package/@polkadot-apps/contracts) | Typed contract interactions for Solidity and ink! contracts on Polkadot |
| [`@polkadot-apps/crypto`](https://www.npmjs.com/package/@polkadot-apps/crypto) | Cryptographic primitives — symmetric encryption, key derivation, and NaCl operations |
| [`@polkadot-apps/descriptors`](https://www.npmjs.com/package/@polkadot-apps/descriptors) | Pre-generated Polkadot API descriptors for Asset Hub, Bulletin, and Individuality chains |
| [`@polkadot-apps/host`](https://www.npmjs.com/package/@polkadot-apps/host) | Host container detection, provider routing, and storage access for Polkadot Desktop and Mobile environments |
| [`@polkadot-apps/keys`](https://www.npmjs.com/package/@polkadot-apps/keys) | Hierarchical key derivation and session key management for Polkadot accounts |
| [`@polkadot-apps/logger`](https://www.npmjs.com/package/@polkadot-apps/logger) | Structured, namespace-filtered logging for the @polkadot-apps ecosystem |
| [`@polkadot-apps/signer`](https://www.npmjs.com/package/@polkadot-apps/signer) | Multi-provider signer manager — Host API, browser extensions, and dev accounts |
| [`@polkadot-apps/statement-store`](https://www.npmjs.com/package/@polkadot-apps/statement-store) | Publish/subscribe client for the Polkadot Statement Store with topic-based routing |
| [`@polkadot-apps/storage`](https://www.npmjs.com/package/@polkadot-apps/storage) | Key-value storage abstraction with automatic host/browser backend detection |
| [`@polkadot-apps/tx`](https://www.npmjs.com/package/@polkadot-apps/tx) | Transaction submission, lifecycle watching, and dev signers for Polkadot chains |
| [`@polkadot-apps/utils`](https://www.npmjs.com/package/@polkadot-apps/utils) | Encoding utilities and token formatting for the @polkadot-apps ecosystem |

## Skills for AI Agents

The `skills/` directory contains skills that enable AI coding assistants to build Polkadot applications end-to-end using these packages — without requiring the user to write code.

| Skill | Packages Covered | Triggers On |
|-------|-----------------|-------------|
| `polkadot-app-builder` | Orchestrator | "build a Polkadot app", project scaffolding |
| `polkadot-chain-connection` | chain-client, descriptors, host | "connect to chain", "query state" |
| `polkadot-transactions` | tx, signer, keys | "submit transaction", "sign", "dev signer" |
| `polkadot-bulletin` | bulletin | "upload data", "Bulletin Chain", "CID" |
| `polkadot-statement-store` | statement-store | "pub/sub", "statement store", "topics" |
| `polkadot-utilities` | address, crypto, utils, storage, logger | "SS58", "encrypt", "format token", "key-value store" |

See the `examples/` directory for sample apps built with these packages:

- **`examples/multi-chain-explorer/`** — CLI app that queries Paseo chain state, balances, and submits a remark transaction.
- **`examples/t3rminal-lite/`** — Next.js web app demonstrating wallet connection, address display, and transaction submission.

### Using the Skills

#### Claude Code (CLI / Desktop / Web)

Copy the skills into your project's `.claude/skills/` directory:

```bash
# From within your project directory
cp -r /path/to/polkadot-apps/skills/* .claude/skills/
```

Skills are auto-discovered on session start. Invoke directly with `/polkadot-app-builder` or let Claude use them automatically when you describe what you want to build.

#### Cursor

Add the skill content as project rules. In your project root, create `.cursor/rules/`:

```bash
mkdir -p .cursor/rules
cp /path/to/polkadot-apps/skills/polkadot-app-builder/SKILL.md .cursor/rules/polkadot-app-builder.md
cp /path/to/polkadot-apps/skills/polkadot-chain-connection/SKILL.md .cursor/rules/polkadot-chain-connection.md
# ... repeat for each skill you need
```

Or add the `skills/` directory path to `.cursorrules` so Cursor indexes the content.

#### Windsurf

Add the skills as Windsurf rules. Copy SKILL.md files into `.windsurfrules/` in your project:

```bash
mkdir -p .windsurfrules
cp /path/to/polkadot-apps/skills/polkadot-app-builder/SKILL.md .windsurfrules/polkadot-app-builder.md
```

#### GitHub Copilot (VS Code)

Add skills as custom instructions in `.github/copilot-instructions.md` or reference them via workspace settings:

```bash
mkdir -p .github
# Concatenate the skills you need into a single instructions file
cat /path/to/polkadot-apps/skills/polkadot-app-builder/SKILL.md > .github/copilot-instructions.md
```

For Copilot Chat, you can also reference skill files directly in conversation: `@workspace /path/to/skills/polkadot-app-builder/SKILL.md`.

#### Gemini CLI

Skills auto-activate via the `activate_skill` tool when installed as plugins. Copy the skills directory:

```bash
cp -r /path/to/polkadot-apps/skills ~/.gemini/skills
```

#### Any AI Agent (Generic)

The skills are standard Markdown files with YAML frontmatter. To use them with any AI tool:

1. Read the `SKILL.md` file for the relevant skill
2. Include its content in your system prompt or context
3. When the skill references `references/<file>.md`, load those on demand for detailed API signatures

The `polkadot-app-builder` skill is the best starting point — it routes to the other skills based on what you're building.

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