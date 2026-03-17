# Plan: Implement `@polkadot-apps/chain-client`

## Context

`chain-client` is the P0 infrastructure package that unblocks `wallet`, `tx`, `contract`, `statement-store`, and `identity`. It provides a descriptor-driven, zero-config API for connecting to Substrate chains — built on top of `polkadot-api` (PAPI) and `@novasamatech/product-sdk`.

### How PAPI chain identity works

Understanding the relationship between descriptors, genesis hashes, and metadata is key to this design.

**The descriptor IS the chain identity.** PAPI's `ChainDefinition` type contains:

```ts
type ChainDefinition = {
    descriptors: Promise<DescriptorValues> & { pallets, apis };  // compiled type metadata
    asset: PlainDescriptor<any>;                                  // native token descriptor
    metadataTypes: Promise<Uint8Array>;                           // SCALE codec types
    getMetadata: () => Promise<Uint8Array>;                       // live metadata fetcher
    genesis: HexString | undefined;                               // genesis hash (embedded!)
};
```

When a developer runs `papi add`, the CLI:
1. Connects to the chain via the RPC endpoint
2. Fetches live metadata + genesis hash
3. Stores both in `.papi/polkadot-api.json`
4. Code-generates TypeScript types + runtime descriptors
5. **Embeds the genesis hash directly into the generated JS**

This means `paseo_hub.genesis` returns `"0xd6eec2..."` at runtime — no RPC call, no configuration, no registration needed. The descriptor already knows which chain it belongs to.

**Why this matters for chain-client:** We can read `descriptor.genesis` to look up well-known chain metadata (rpcs, chain specs) automatically. The user never needs to provide a genesis hash or call `registerChain` for known chains. True zero-config.

### How it works with the Product SDK

The `@novasamatech/product-sdk` is the host integration layer for apps running inside Polkadot Browser or Polkadot Desktop. chain-client uses it as the **primary** connection strategy:

- **`createPapiProvider(genesisHash, fallbackProvider)`** — the key insight: this function accepts an optional **fallback provider**. Inside a container, it routes JSON-RPC through the host. Outside, it uses the fallback (rpc or smoldot). chain-client always calls `createPapiProvider(descriptor.genesis, fallback)` when the SDK is available. The SDK handles container-vs-standalone routing automatically.
- **`sandboxProvider.isCorrectEnvironment()`** — clean container detection. Used by `isInsideContainer()`.
- **`WellKnownChain`** — genesis hash constants used to cross-reference and validate well-known chain entries.

The product SDK also provides accounts, signers, statement store, chat, and storage — but those are consumed by the `wallet`, `tx`, `statement-store`, and `storage` packages respectively, not by chain-client.

### Design Philosophy

**The descriptor is the key.** Users pass a PAPI `ChainDefinition` descriptor and get back a typed API. No manager class, no mode selection, no chain naming, no genesis hash, no registration for well-known chains. chain-client reads `descriptor.genesis`, looks up the well-known metadata, builds a provider, and returns a typed API.

```ts
import { getTypedApi } from "@polkadot-apps/chain-client"
import { paseo_hub } from ".papi/descriptors"

// Known chain — just works. No registration, no config.
const api = await getTypedApi(paseo_hub)
```

`registerChain` is only needed for two cases:
1. **Custom chains** not in the well-known registry
2. **Overriding defaults** for a known chain (e.g. private RPC endpoint)

```ts
import { registerChain } from "@polkadot-apps/chain-client"

// Custom chain — provide connection details
registerChain("0xabc123...", { rpcs: ["wss://my-chain.io"] })

// Override defaults — e.g. use a private RPC for Paseo Asset Hub
registerChain("0xd6eec2...", { rpcs: ["wss://my-private-rpc.io"] })
```

Note: `registerChain` is keyed by genesis hash string, not by descriptor. This avoids the reference identity problem entirely — any descriptor with the same embedded genesis hash will find the same metadata.

---

## What the Reference Apps Do Today

Each app reinvents chain connection boilerplate. Here's what they each build from scratch:

| App | Boilerplate | Chains | Modes | Container | Smoldot | Contract SDK |
|-----|-------------|--------|-------|-----------|---------|---------|
| **hackm3** | ~375 lines | 4 (Hub, Bulletin, People x2) | WS only | No | No | `createContractSdk` |
| **mark3t** | ~627 lines | 1 (Hub) | Host + RPC + Smoldot | Yes | Main thread | `createReviveSdk` (patched) |
| **tick3t** | ~164 lines | 1 (Hub) | RPC + Smoldot | No | Web Worker | `createContractSdk` |
| **task-rabbit** | ~253 lines | 4 (Relay, Hub, People, Bulletin) | WS only | No | No | `createContractSdk` |
| **t3rminal** | ~160 lines | 1 (Hub) | JSON-RPC (ethers.js) | No | No | None |

### Pain points `chain-client` eliminates

**1. Duplicated provider boilerplate (160-627 lines per app -> 0)**
Every app writes its own `ProviderManager` / `ChainProvider` / composable. hackm3 has a 272-line class with 4 near-identical `getXxx()` methods that only differ in the chain name. task-rabbit has a 146-line factory that manually wires 4 clients. All of this becomes `const api = await getTypedApi(descriptor)`.

**2. Only mark3t has container detection — the others are blind**
hackm3, tick3t, and task-rabbit hard-code WS endpoints and cannot run inside Polkadot Browser/Desktop at all. mark3t wrote 39 lines + 317 lines of React-specific wiring to support it. chain-client uses `@novasamatech/product-sdk`'s `createPapiProvider(genesisHash, fallback)` with the fallback pattern — every app gets Host API support for free, with transparent fallback to rpc/smoldot when standalone.

**3. Smoldot setup is complex and inconsistent**
mark3t runs smoldot on the main thread (not production-ideal). tick3t runs it in a Web Worker (better, but Nuxt-specific). hackm3 and task-rabbit don't support smoldot at all. chain-client provides a single smoldot implementation that all apps share.

**4. HMR/StrictMode race conditions re-solved per app**
mark3t's `__mark3tInitPromise` pattern (set synchronously before await) is the correct solution, but each app has to discover this independently. hackm3 uses `globalThis.__providerManager` but with a different approach. chain-client solves this once with the synchronous promise guard.

**5. RPC endpoints hardcoded everywhere**
hackm3 hardcodes 3 fallback endpoints in `network.ts`. tick3t hardcodes 1 endpoint per chain. task-rabbit has a `KNOWN_CHAINS` map with 4 presets. chain-client ships a built-in registry of well-known chains with sensible defaults — apps only configure custom chains.

**6. Contract SDK created inconsistently**
hackm3 creates one SDK per chain (wasteful). mark3t uses the deprecated `createReviveSdk` (for Solidity/PolkaVM contracts). task-rabbit creates one SDK on Asset Hub (correct). chain-client uses `createInkSdk(client)` which is the unified SDK in `@polkadot-api/sdk-ink@0.6.2` — it handles both Ink (Rust/Wasm) and Revive (Solidity/PolkaVM) contracts. mark3t's `createReviveSdk` is deprecated in favor of `createInkSdk`. chain-client provides `getContractSdk(descriptor)` with proper singleton caching.

### What each app becomes with `chain-client`

**hackm3** (375 -> ~4 lines): Remove `provider.ts` + `network.ts`. Replace with:
```ts
import { getTypedApi, getContractSdk } from "@polkadot-apps/chain-client"
const hubApi = await getTypedApi(paseoHub)
const bulletinApi = await getTypedApi(bulletinchain)
const peopleApi = await getTypedApi(stablepeople)
const sdk = await getContractSdk(paseoHub)
```

**mark3t** (627 -> ~15 lines): Remove `ChainProvider.tsx` + `container.ts`. The React context wrapper stays (framework-specific) but shrinks to just forwarding `getTypedApi()` results.

**tick3t** (164 -> ~5 lines): Remove `usePAPIClient.ts`. Vue composable becomes a thin wrapper around `getTypedApi()`.

**task-rabbit** (253 -> ~4 lines): Remove `chain-api.ts` + `config.ts` + `known_chains.ts`. Replace with 4 `getTypedApi()` calls.

---

## File Structure

```
packages/chain-client/src/
├── index.ts           # public re-exports
├── testing.ts         # reset() — subpath export for test cleanup
├── types.ts           # ChainMeta, ChainEntry, ConnectionMode
├── registry.ts        # Map<genesisHash, ChainMeta> + registerChain() + well-known defaults
├── container.ts       # isInsideContainer() — product-sdk primary, manual fallback
├── providers.ts       # createProvider(meta) factory — dynamic imports, SDK fallback pattern
├── clients.ts         # getTypedApi(), getClient(), getContractSdk(), isConnected(), destroy(), destroyAll()
└── hmr.ts             # globalThis client cache keyed by genesisHash
```

---

## Critical Reference Files

| File | What to take |
|---|---|
| `reference-repos/hackm3/frontend/src/lib/provider.ts` | Per-chain init promise dedup, `globalThis` HMR, `destroy()` lifecycle |
| `reference-repos/mark3t/packages/core-hooks/src/ChainProvider.tsx` | 3-mode provider factory, synchronous promise guard, smoldot relay+para setup, known chain specs map |
| `reference-repos/mark3t/packages/core-hooks/src/container.ts` | `isInsideContainer()` — manual fallback signals |
| `reference-repos/mark3t/.claude/skills/.../references/product-sdk-integration.md` | Full product-sdk API reference — `createPapiProvider` fallback pattern, `sandboxProvider`, `WellKnownChain` |
| `reference-repos/mark3t/.claude/skills/.../light-client.ts` | Smoldot singleton pattern |

---

## Modules

### `src/types.ts`

```ts
import type { ChainDefinition, PolkadotClient } from "polkadot-api";

/** Fallback strategy override — internal by default, exposed for ChainMeta.mode. */
export type ConnectionMode = "rpc" | "lightclient";

/** Connection metadata for a chain, keyed by genesis hash in the registry. */
export interface ChainMeta {
    rpcs?: string[];
    relayChainSpec?: string;
    paraChainSpec?: string;
    mode?: ConnectionMode;              // override fallback auto-detection (see trade-off #2)
}

/** Internal per-chain state stored in the HMR-safe cache. */
export interface ChainEntry {
    client: PolkadotClient;
    api: Map<ChainDefinition, unknown>;   // keyed by descriptor for multi-descriptor per chain
    contractSdk: unknown | null;          // cached createInkSdk result (see flaw fix #2)
    initPromise: Promise<void> | null;
}
```

Note: `ConnectionMode` no longer includes `"host"` — host routing is handled transparently by the product SDK's `createPapiProvider(genesisHash, fallback)`. The mode only controls which **fallback** provider is built (rpc or lightclient).

### `src/registry.ts`

A `Map<string, ChainMeta>` keyed by genesis hash. Well-known chains are pre-populated. `registerChain()` adds or overrides entries.

```ts
import type { ChainMeta } from "./types.js";

const registry = new Map<string, ChainMeta>();

// Pre-populate well-known chains at module load
registry.set("0x91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3", {
    rpcs: ["wss://rpc.polkadot.io", "wss://polkadot-rpc.dwellir.com"],
}); // Polkadot
registry.set("0xd6eec26135305a8ad257a20d003357284c8aa03d0bdb2b357ab0a22371e11ef2", {
    rpcs: ["wss://sys.ibp.network/asset-hub-paseo", "wss://asset-hub-paseo-rpc.dwellir.com"],
}); // Paseo Asset Hub
// ... more well-known chains

/** Register or override connection metadata for a genesis hash. */
export function registerChain(genesisHash: string, meta: ChainMeta): void {
    registry.set(genesisHash, { ...registry.get(genesisHash), ...meta });
}

/** Look up metadata by genesis hash. Returns undefined if unknown. */
export function getChainMeta(genesisHash: string): ChainMeta | undefined {
    return registry.get(genesisHash);
}
```

Note: `registerChain` **merges** with existing metadata. So `registerChain("0xd6eec2...", { rpcs: ["wss://private.io"] })` overrides rpcs but keeps existing chain specs. This makes overriding defaults clean.

### `src/container.ts`

Uses `sandboxProvider.isCorrectEnvironment()` from `@novasamatech/product-sdk` as the primary detection method. Falls back to the manual 3-signal check (iframe, webview mark, host API port) when product-sdk is not installed.

```ts
export function isInsideContainer(): boolean {
    try {
        const { sandboxProvider } = require("@novasamatech/product-sdk");
        return sandboxProvider.isCorrectEnvironment();
    } catch {
        return manualDetection();
    }
}
```

### `src/providers.ts`

Single export: `createProvider(genesisHash, meta): Promise<JsonRpcProvider>`. Uses the product SDK's **fallback pattern**.

**Provider creation flow:**

```ts
async function createProvider(genesisHash: string, meta: ChainMeta): Promise<JsonRpcProvider> {
    // 1. Build a standalone fallback provider (rpc or lightclient)
    const fallback = await createFallbackProvider(meta);

    // 2. Wrap with product-sdk if available — it handles container detection internally
    try {
        const { createPapiProvider } = await import("@novasamatech/product-sdk");
        return createPapiProvider(genesisHash as `0x${string}`, fallback);
    } catch {
        // product-sdk not installed — use fallback directly
        if (!fallback) throw new Error("No connection method available.");
        return fallback;
    }
}
```

**Fallback provider resolution** (rpc or lightclient, based on what's configured):

- **rpc**: `await import('polkadot-api/ws-provider/web')` -> `getWsProvider(meta.rpcs)`. Used when `rpcs` is provided.
- **lightclient**: Smoldot singleton (module-level `smoldotInstance`). Loads chain specs via fetch (explicit URLs) or `@polkadot-api/known-chains` lookup. Then `start()` -> `addChain(relay)` -> `addChain(para, { potentialRelayChains: [relay] })` -> `getSmProvider(para)`. Used when chain specs are provided but no rpcs.

The `mode` override on `ChainMeta` can force a specific fallback strategy regardless of what's configured.

This design means:
- **Inside container:** SDK routes through host API, ignoring the fallback.
- **Outside container:** SDK passes through to the fallback provider transparently.
- **No SDK installed:** Fallback provider is used directly — apps work standalone without product-sdk.

### `src/hmr.ts`

Clients keyed by genesis hash string on `globalThis` to survive HMR reloads.

```ts
import type { ChainEntry } from "./types.js";

declare global {
    var __chainClientCache: Map<string, ChainEntry> | undefined;
}

export function getClientCache(): Map<string, ChainEntry> {
    globalThis.__chainClientCache ??= new Map();
    return globalThis.__chainClientCache;
}
```

### `src/clients.ts`

The core public API — functional, no class.

```ts
import type { ChainDefinition, TypedApi, PolkadotClient } from "polkadot-api";

export async function getTypedApi<D extends ChainDefinition>(
    descriptor: D
): Promise<TypedApi<D>>

export async function getClient(
    descriptor: ChainDefinition
): Promise<PolkadotClient>

export async function getContractSdk(
    descriptor: ChainDefinition
): Promise<ReturnType<typeof createContractSdk>>

export function isConnected(descriptor: ChainDefinition): boolean
export function destroy(descriptor: ChainDefinition): void
export function destroyAll(): void
```

**`getTypedApi(descriptor)`** — the main entry point:
1. Read `descriptor.genesis` — if `undefined`, throw: `"Descriptor has no genesis hash. Upgrade polkadot-api or call registerChain(genesisHash, { rpcs: [...] }) and pass the genesis hash to getTypedApi via a wrapper."`
2. Check `getClientCache()` by genesis hash -> return cached `api` if present
3. If `initPromise` exists (init in flight) -> await it, return api
4. Otherwise: look up `getChainMeta(descriptor.genesis)` for connection details -> set `initPromise` **synchronously before any await** -> `createProvider(descriptor.genesis, meta)` -> `createClient(provider)` -> `client.getTypedApi(descriptor)` -> cache and return

If `descriptor.genesis` is not in the registry, throw: `"Unknown chain (genesis: 0x...). Call registerChain(genesisHash, { rpcs: [...] }) to add connection details."`

The synchronous promise guard (from mark3t) prevents React StrictMode double-effects and concurrent callers from spawning duplicate connections.

**`getContractSdk(descriptor)`** — returns a cached contract SDK instance. Checks `entry.contractSdk` first; if not cached, dynamically imports `@polkadot-api/sdk-ink`, creates the SDK, and caches it on the `ChainEntry`. Repeated calls return the same instance.

**`isConnected(descriptor)`** — sync cache lookup: reads `descriptor.genesis`, checks if it exists in `getClientCache()`. No side effects, no initialization.

**`destroy(descriptor)`** — destroys one chain's client by genesis hash. **`destroyAll()`** — explicit global teardown for app shutdown (see trade-off #4).

### `src/index.ts`

```ts
export { getTypedApi, getClient, getContractSdk, isConnected, destroy, destroyAll } from "./clients.js";
export { registerChain } from "./registry.js";
export { isInsideContainer } from "./container.js";
export type { ChainMeta, ConnectionMode } from "./types.js";
```

`@polkadot-apps/chain-client/testing` subpath (see trade-off #3):
```ts
export { reset } from "./testing.js";  // clears registry + cache — test-only
```

---

## package.json Changes

Add to `optionalDependencies` (see trade-off #5 — both are dynamically imported):
```json
"@polkadot-api/sdk-ink": "^0.6.2",
"@polkadot-api/known-chains": "*"
```

Add `testing` subpath export (see trade-off #3):
```json
"exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./testing": { "types": "./dist/testing.d.ts", "import": "./dist/testing.js" }
}
```

---

## Design Trade-offs

Seven risks were identified in the original design. Each is analyzed below with options and a chosen resolution.

### 1. Descriptor identity and cache keying

**Problem:** Using `Map<ChainDefinition, ...>` with `===` identity fails when the same descriptor is duplicated by the bundler.

**Resolution: Key by `descriptor.genesis` (string).** PAPI embeds the genesis hash into every generated descriptor at build time. `descriptor.genesis` is a stable string that survives bundler duplication, is serializable, and is debuggable. The cache is `Map<string, ChainEntry>` keyed by genesis hash. The descriptor is still passed to `client.getTypedApi(descriptor)` for type inference — it's just not the cache key.

This also eliminates the need for `registerChain` to accept a descriptor — it takes a genesis hash string directly, and `getTypedApi(descriptor)` reads `descriptor.genesis` internally.

### 2. No escape hatch for mode override

**Problem:** Auto-detection is convenient but blocks debugging (e.g. forcing RPC when only chain specs are configured) and testing.

**Decision: Optional `mode` field on `ChainMeta`.** Adding `mode?: ConnectionMode` lets you force a fallback strategy at registration time. Note: `ConnectionMode` is `"rpc" | "lightclient"` — there is no `"host"` mode because the product SDK handles host routing transparently via `createPapiProvider(genesisHash, fallback)`.

### 3. Global mutable state is hard to test

**Problem:** Module-level `registry` and `globalThis.__chainClientCache` make unit tests leak state between runs.

**Decision: Export `reset()` via `@polkadot-apps/chain-client/testing` subpath.** Clears registry (re-populates well-known defaults) + clears client cache. Tests call it in `beforeEach`.

### 4. `destroy()` with no args is a footgun

**Problem:** A no-args `destroy()` kills all connections on the page, breaking other consumers.

**Decision: Split into `destroy(descriptor)` and `destroyAll()`.** `destroy()` always requires a descriptor — no accidental global teardown. `destroyAll()` is the explicit nuclear option for app shutdown.

### 5. Contract SDK is a forced dependency

**Problem:** `@polkadot-api/sdk-ink` is pulled in even for apps that never use contracts.

**Decision: Dynamic import inside `getContractSdk()`.** Zero cost if never called. The package is in `optionalDependencies` with a clear error if not installed.

### 6. No reconnection handling

**Problem:** When a WebSocket drops, the cached client may be dead.

**Decision: Trust PAPI.** `getWsProvider([url1, url2, ...])` handles reconnection with endpoint rotation. Inside a container, the product SDK manages the transport lifecycle. Adding our own reconnection layer would conflict with both.

### 7. Registration timing — call before use

**Problem:** `getTypedApi(my_chain)` throws if `my_chain.genesis` is not in the registry.

**Decision: Throw with a clear error.** For well-known chains this never happens — they're pre-populated. For custom chains, the error says exactly what to do: `"Unknown chain (genesis: 0x...). Call registerChain(genesisHash, { rpcs: [...] })."`

---

## In-Source Tests

**`container.ts`**:
- Returns `false` when product-sdk is not installed and no window signals
- Falls back to manual detection when product-sdk import fails

**`registry.ts`**:
- Well-known chains are pre-populated (Polkadot, Paseo Asset Hub, etc.)
- `registerChain` adds new entries
- `registerChain` merges with existing entries (override rpcs but keep chain specs)
- `getChainMeta` returns `undefined` for unknown genesis hashes

**`hmr.ts`**:
- Returns a `Map`
- Same instance on repeated calls

**`providers.ts`**:
- Wraps fallback with `createPapiProvider` when product-sdk is available
- Falls back to direct provider when product-sdk is not installed
- Throws when no rpcs and no chain specs configured

**`clients.ts`**:
- `getTypedApi` reads `descriptor.genesis` for cache lookup
- `getTypedApi` deduplicates concurrent calls for same genesis hash
- `isConnected` returns `true` only for initialized chains
- `destroy()` clears single cache entry
- `destroyAll()` clears entire cache

---

## Where descriptors come from

chain-client accepts any PAPI `ChainDefinition` descriptor — it doesn't care where it was imported from. But where apps get their descriptors is an important architectural decision for the monorepo.

### Options considered

**Option A: Each app runs `papi add` and imports from `.papi/descriptors`**

Standard PAPI workflow. Each app owns its metadata snapshot.

- (+) Each app controls its own upgrade timing
- (+) Only bundles descriptors for chains the app uses
- (-) 5 apps x 4 chains = up to 20 `papi add` invocations to maintain
- (-) Metadata snapshots drift between apps

**Option B: Shared `@polkadot-apps/descriptors` package**

One package runs `papi add` once, all apps import from it.

```ts
import { paseo_hub, bulletinchain } from "@polkadot-apps/descriptors"
```

- (+) One `papi add` per chain for the entire monorepo
- (+) All apps use the same metadata snapshot — no drift
- (+) New apps get chain access by adding one dependency
- (-) Must be updated on runtime upgrades (manageable — PAPI has compatibility tokens to detect drift, CI can automate)

**Option C: Shared defaults + per-app overrides**

- (+) Zero setup for common cases, escape hatch for special needs
- (-) Two sources of truth — confusing when debugging type mismatches

### Decision: Option B — shared `@polkadot-apps/descriptors`

All 5 reference apps connect to the same set of chains (Paseo, Asset Hub, Bulletin, People). They're in the same monorepo and should stay in sync. A shared package eliminates duplicate `papi add` maintenance and guarantees all apps see the same chain types. When a chain upgrades, one package update covers all apps.

This is a **separate package** from chain-client — chain-client only reads `descriptor.genesis` and connects. Where the descriptor comes from is the app's choice. Apps outside this monorepo can use their own `.papi/descriptors` with no changes to chain-client.

**Implication:** Add `@polkadot-apps/descriptors` as a new package in the monorepo. It contains:
- `.papi/polkadot-api.json` — chain entries for all shared chains
- Generated descriptors — the output of `papi add` / `papi build`
- Exports: `paseo_hub`, `bulletinchain`, `stablepeople`, etc.

---

## Future Enhancements

Not in scope for the initial implementation, but backwards-compatible additions for later:

1. **Runtime mode switching** — `reconnect(descriptor, { mode })` to toggle rpc <-> lightclient at runtime (mark3t pattern). Requires destroy + re-init with new mode.
2. **Web Worker smoldot** — Use `startFromWorker()` instead of `start()` to offload light client to a background thread (tick3t pattern). Could be a `workerUrl` field on `ChainMeta` or auto-detect Worker availability.
3. **`withPolkadotSdkCompat` wrapper** — Auto-apply for rpc mode to handle compatibility with certain RPC endpoints (used by tick3t and task-rabbit).

---

## Changeset

After implementation: create `.changeset/<name>.md` with `minor` bump for `@polkadot-apps/chain-client`.

---

## Files to Create/Modify

- `packages/chain-client/src/index.ts` — replace skeleton
- `packages/chain-client/src/testing.ts` — new (subpath export for test reset)
- `packages/chain-client/src/types.ts` — new
- `packages/chain-client/src/registry.ts` — new (well-known chains + registerChain)
- `packages/chain-client/src/container.ts` — new (product-sdk primary, manual fallback)
- `packages/chain-client/src/providers.ts` — new (SDK fallback pattern)
- `packages/chain-client/src/clients.ts` — new (core public API)
- `packages/chain-client/src/hmr.ts` — new (globalThis cache)
- `packages/chain-client/package.json` — add optional deps + testing subpath export

## Verification

```sh
pnpm --filter @polkadot-apps/chain-client build
pnpm test
```
