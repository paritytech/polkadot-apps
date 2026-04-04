# Multi-Chain Explorer

Sample application demonstrating end-to-end usage of `@polkadot-apps` packages. Built for validation and benchmarking of the skills system.

## What It Does

1. **Connects** to the Paseo testnet via `@polkadot-apps/chain-client`
2. **Queries chain state** — block number, runtime version
3. **Queries account balance** — Alice's balance on Asset Hub, formatted with `@polkadot-apps/address`
4. **Submits a transaction** — `System.remark` with dev signer via `@polkadot-apps/tx`

## Packages Exercised

| Package | Usage |
|---------|-------|
| `@polkadot-apps/chain-client` | `getChainAPI("paseo")`, `destroyAll()` |
| `@polkadot-apps/descriptors` | Loaded lazily by chain-client |
| `@polkadot-apps/tx` | `submitAndWatch()`, `createDevSigner()`, `getDevPublicKey()` |
| `@polkadot-apps/address` | `ss58Encode()`, `truncateAddress()` |
| `polkadot-api` | `Binary.fromText()` |

## Running

From the monorepo root:

```bash
pnpm install
pnpm build
cd examples/multi-chain-explorer
pnpm start
```

Requires network access to reach Paseo testnet RPC endpoints.

## For Benchmarking

This app can be used to measure:
- **Bundle size** — `npx esbuild src/index.ts --bundle --analyze`
- **Startup time** — Time from `node` invocation to first chain query
- **Skill adequacy** — Whether skills contain enough information to reproduce this app
