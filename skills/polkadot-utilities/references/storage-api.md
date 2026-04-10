# Storage API Reference

Package: `@polkadot-apps/storage`

## Table of Contents

- [createKvStore](#createkvstore)
- [Types](#types)
  - [KvStore](#kvstore)
  - [KvStoreOptions](#kvstoreoptions)
- [Re-exports](#re-exports)
- [Backend Detection](#backend-detection)

---

## createKvStore

Create a key-value store with automatic backend detection.

```ts
function createKvStore(options?: KvStoreOptions): Promise<KvStore>
```

**Parameters:**
- `options` - Optional configuration object (see [KvStoreOptions](#kvstoreoptions)).

**Returns:** A `Promise<KvStore>` that resolves to a key-value store instance.

**Backend selection order:**
1. If `options.hostLocalStorage` is provided, use the host backend directly.
2. If running inside a container (detected via `@polkadot-apps/host`), attempt to obtain host storage. If successful, use host backend.
3. Fall back to browser `localStorage`.

In environments without `localStorage` (SSR/Node), all operations are safe no-ops: `get` returns `null`, `set` does nothing.

```ts
import { createKvStore } from "@polkadot-apps/storage";

// Basic usage - auto-detects backend
const store = await createKvStore({ prefix: "myapp" });

// String operations
await store.set("theme", "dark");
const theme = await store.get("theme");       // "dark"
await store.remove("theme");
const gone = await store.get("theme");         // null

// JSON operations
await store.setJSON("preferences", { lang: "en", fontSize: 14 });
const prefs = await store.getJSON<{ lang: string; fontSize: number }>("preferences");

// With explicit host storage (bypasses auto-detection)
import { getHostLocalStorage } from "@polkadot-apps/host";
const hostStorage = await getHostLocalStorage();
const store = await createKvStore({
  prefix: "myapp",
  hostLocalStorage: hostStorage,
});
```

---

## Types

### KvStore

The key-value store interface. All methods return Promises.

```ts
interface KvStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  getJSON<T>(key: string): Promise<T | null>;
  setJSON(key: string, value: unknown): Promise<void>;
}
```

**Methods:**

| Method | Description |
|--------|-------------|
| `get(key)` | Retrieve a string value. Returns `null` if the key does not exist or on error. |
| `set(key, value)` | Store a string value. Silently fails on error (e.g. quota exceeded). |
| `remove(key)` | Delete a key. Silently fails on error. |
| `getJSON<T>(key)` | Retrieve and parse a JSON value. Returns `null` if the key does not exist, the JSON is corrupted, or on error. |
| `setJSON(key, value)` | Serialize a value as JSON and store it. Silently fails on error. |

---

### KvStoreOptions

Configuration options for `createKvStore`.

```ts
interface KvStoreOptions {
  prefix?: string;
  hostLocalStorage?: HostLocalStorage;
}
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `prefix` | `string` | Key prefix to namespace storage keys. E.g. `"myapp"` causes keys to become `"myapp:theme"`. |
| `hostLocalStorage` | `HostLocalStorage` | Override auto-detection. When provided, routes all operations through this host storage instance. |

---

## Re-exports

The package re-exports these for convenience:

```ts
export type { HostLocalStorage } from "@polkadot-apps/host";
export { default as Dexie, type Table } from "dexie";
```

- `HostLocalStorage` - The host storage interface type from `@polkadot-apps/host`.
- `Dexie` - IndexedDB wrapper library, re-exported for consumers that need richer storage (e.g. structured tables). Not used by the KvStore itself.
- `Table` - Dexie table type.

---

## Backend Detection

The storage package automatically selects the appropriate backend:

```
createKvStore(options)
  |
  +-- options.hostLocalStorage provided?
  |     YES -> Use host backend
  |     NO  -> Continue
  |
  +-- Inside container? (via @polkadot-apps/host isInsideContainer())
  |     YES -> Try getHostLocalStorage()
  |     |       SUCCESS -> Use host backend
  |     |       FAIL    -> Fall back to localStorage
  |     NO  -> Use localStorage
  |
  +-- localStorage available?
        YES -> Use localStorage
        NO  -> Safe no-op backend (SSR/Node)
```

**Host backend** routes operations through the container's native storage API (`readString`, `writeString`, `readJSON`, `writeJSON`, `clear`).

**localStorage backend** uses `globalThis.localStorage` with try/catch around every operation. Errors (SecurityError, QuotaExceededError) are caught and logged via `@polkadot-apps/logger`, and operations gracefully degrade (get returns `null`, set/remove become no-ops).

**Key prefixing** is applied at the backend level. With `prefix: "myapp"`, a call to `store.set("theme", "dark")` stores the value under the key `"myapp:theme"`.
