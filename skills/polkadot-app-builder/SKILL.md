---
name: polkadot-app-builder
description: >
  End-to-end scaffolding and implementation of Polkadot applications using @polkadot-apps packages.
  Use when: creating a new Polkadot project, building a dApp, scaffolding chain interactions,
  choosing which @polkadot-apps packages to install, or when a user says "build me a Polkadot app".
  Handles both developer-guided and fully autonomous (non-developer) workflows.
---

# Polkadot App Builder

Orchestrator skill for building applications with the `@polkadot-apps` package ecosystem.

## Quick Start

```typescript
import { getChainAPI } from "@polkadot-apps/chain-client";

const api = await getChainAPI("paseo");
const balance = await api.assetHub.query.System.Account.getValue("5GrwvaEF...");
api.destroy();
```

## Workflow

### 1. Understand Requirements

Determine what the app needs:
- **Read chain state** (balances, storage, block info)
- **Submit transactions** (transfers, remarks, contract calls)
- **Store data** on Bulletin Chain
- **Real-time messaging** via Statement Store
- **Address utilities** (SS58, H160 conversion)
- **Encryption** (AES, ChaCha20, NaCl)
- **Key management** (derivation, session keys)

### 2. Select Packages

Use the decision tree in [references/package-selector.md](references/package-selector.md).

**Every app needs:**
```
@polkadot-apps/chain-client    # Connect to chains
@polkadot-apps/descriptors     # Chain type definitions (peer dep of chain-client)
polkadot-api                   # Core runtime (peer dep of descriptors)
```

**Add based on features:**

| Feature | Package | Skill |
|---------|---------|-------|
| Smart contracts (Solidity/ink!) | `@polkadot-apps/contracts` | polkadot-contracts |
| Submit transactions | `@polkadot-apps/tx` | polkadot-transactions |
| Wallet connection (Talisman, Polkadot.js, Host API) | `@polkadot-apps/signer` | polkadot-transactions |
| Key derivation | `@polkadot-apps/keys` | polkadot-transactions |
| Decentralized storage | `@polkadot-apps/bulletin` | polkadot-bulletin |
| Pub/sub messaging | `@polkadot-apps/statement-store` | polkadot-statement-store |
| Address encoding | `@polkadot-apps/address` | polkadot-utilities |
| Encryption | `@polkadot-apps/crypto` | polkadot-utilities |
| KV storage | `@polkadot-apps/storage` | polkadot-utilities |
| Logging | `@polkadot-apps/logger` | polkadot-utilities |

### 3. Scaffold Project

Use templates in [references/project-templates.md](references/project-templates.md).

```bash
mkdir my-polkadot-app && cd my-polkadot-app
npm init -y
```

**package.json** essentials:
```json
{
  "type": "module",
  "dependencies": {
    "@polkadot-apps/chain-client": "latest",
    "polkadot-api": "^1.23.3"
  }
}
```

**tsconfig.json** essentials:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

Install:
```bash
npm install
```

### 4. Implement

Invoke the relevant domain skill(s) based on the selected packages:
- **polkadot-chain-connection** — for connecting and querying chains
- **polkadot-transactions** — for submitting transactions, signing, keys
- **polkadot-bulletin** — for Bulletin Chain data storage
- **polkadot-statement-store** — for pub/sub messaging
- **polkadot-utilities** — for address, crypto, storage, logger

### 5. Build and Verify

```bash
npx tsc            # Compile TypeScript
node dist/index.js # Run the app
```

## Environments and Chains

See [references/chains.md](references/chains.md) for full details.

> **WARNING:** Only the `"paseo"` environment is currently available. Using `"polkadot"` or `"kusama"` will throw an error.

| Environment | Asset Hub | Bulletin | Individuality |
|-------------|-----------|----------|---------------|
| **paseo** (testnet) | Yes | Yes | Yes |
| polkadot (mainnet) | Planned | Planned | Planned |
| kusama (canary) | Planned | Planned | Planned |

## Common Mistakes

1. **Missing `polkadot-api`** — It's a peer dependency of `@polkadot-apps/descriptors`. Always install it.
2. **Barrel import of descriptors** — Use `@polkadot-apps/descriptors/bulletin`, NOT `@polkadot-apps/descriptors`.
3. **Using unavailable environments** — Only `"paseo"` works. `"polkadot"` and `"kusama"` throw.
4. **Forgetting `await`** — `getChainAPI()` returns a Promise. Always `await` it.
5. **Not cleaning up** — Call `api.destroy()` or `destroyAll()` when done to close WebSocket connections.
6. **Dev signers in production** — `createDevSigner("Alice")` is testnet-only. Use `SignerManager` for production.
7. **Wrong signer type** — `PolkadotSigner` (tx), `StatementSignerWithKey` (statement-store), and `SignerManager` (wallet UI) are distinct.

## Non-Developer Tier

When building autonomously for a non-technical user:

1. Ask what the app should do (in plain language)
2. Map requirements to packages using the selector
3. Scaffold the project with all dependencies
4. Implement all features using domain skills
5. Build and test before presenting the result
6. Include clear instructions for running the app

## Developer Tier

When assisting a developer:

1. Present the package selection rationale
2. Show the project scaffold and let them review
3. Implement features incrementally, explaining each step
4. Reference the domain skill docs for API details
5. Let the developer customize and extend
