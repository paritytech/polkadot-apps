---
"@polkadot-apps/chain-client": major
"@polkadot-apps/contracts": patch
"@polkadot-apps/statement-store": patch
---

BYOD chain client: new `createChainClient()` for user-provided descriptors and RPCs with zero size overhead from unused chains.

**Breaking changes:**
- `.contracts` removed from the chain client return type. Create InkSdk yourself: `createInkSdk(client.raw.assetHub, { atBest: true })`.
- `.raw` added: exposes `PolkadotClient` per chain name for advanced use.
- `ChainAPI<E>` type replaced by `ChainClient<T>` and `PresetChains<E>`.
- `@polkadot-api/sdk-ink` removed from chain-client dependencies (moved to consumer).

**New features:**
- `createChainClient({ chains, rpcs })` — BYOD path, import only the chains you need.
- `getChainAPI("paseo")` preserved as zero-config preset wrapper.
- Both return the same `ChainClient<T>` type with typed APIs + `.raw` + `.destroy()`.
