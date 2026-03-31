# @polkadot-apps/storage

Key-value storage abstraction with automatic host/browser backend detection.

## Install

```bash
pnpm add @polkadot-apps/storage
```

Dependencies (`@polkadot-apps/host`, `@polkadot-apps/logger`, `dexie`) are resolved automatically via the monorepo workspace.

## Quick start

```typescript
import { createKvStore } from "@polkadot-apps/storage";

const store = await createKvStore({ prefix: "myapp" });

await store.set("theme", "dark");
const theme = await store.get("theme"); // "dark"

await store.setJSON("settings", { fontSize: 14, lang: "en" });
const settings = await store.getJSON<{ fontSize: number; lang: string }>("settings");
```

## Backend detection

`createKvStore` selects a storage backend in this order:

1. **Explicit host storage** -- if `options.hostLocalStorage` is provided, all operations route through it.
2. **Auto-detect container** -- if running inside a container host (e.g. a native app shell), the host's `localStorage` bridge is used automatically.
3. **Browser localStorage** -- fallback for standard browser environments.

In SSR or Node environments where `localStorage` is unavailable, read operations return `null` and write operations are silent no-ops.

```typescript
// Force host storage
import { createKvStore } from "@polkadot-apps/storage";
import type { HostLocalStorage } from "@polkadot-apps/storage";

const hostStorage: HostLocalStorage = getHostStorageSomehow();
const store = await createKvStore({ hostLocalStorage: hostStorage });
```

## Prefix namespacing

The `prefix` option prepends `"prefix:"` to every key, preventing collisions when multiple modules share the same storage backend.

```typescript
const store = await createKvStore({ prefix: "session" });

await store.set("token", "abc"); // actual key: "session:token"
await store.get("token");        // reads "session:token"
```

## JSON helpers

`getJSON` and `setJSON` handle serialization. `getJSON` returns `null` for missing keys or corrupted data (it does not throw).

```typescript
await store.setJSON("user", { id: 1, name: "Alice" });

const user = await store.getJSON<{ id: number; name: string }>("user");
// { id: 1, name: "Alice" }

const missing = await store.getJSON("nonexistent");
// null
```

## Dexie re-export

The package re-exports the `Dexie` class and `Table` type for cases where you need IndexedDB directly.

```typescript
import { Dexie, type Table } from "@polkadot-apps/storage";

interface Friend {
  id?: number;
  name: string;
}

class AppDatabase extends Dexie {
  friends!: Table<Friend>;

  constructor() {
    super("AppDatabase");
    this.version(1).stores({ friends: "++id, name" });
  }
}
```

## API

### createKvStore

```typescript
function createKvStore(options?: KvStoreOptions): Promise<KvStore>
```

Creates a `KvStore` with automatic backend detection. See "Backend detection" above for the selection order.

### KvStore methods

| Method | Signature | Returns | Description |
|---|---|---|---|
| `get` | `(key: string)` | `Promise<string \| null>` | Read a string value. Returns `null` if the key does not exist. |
| `set` | `(key: string, value: string)` | `Promise<void>` | Write a string value. |
| `remove` | `(key: string)` | `Promise<void>` | Delete a key. |
| `getJSON` | `<T>(key: string)` | `Promise<T \| null>` | Read and parse a JSON value. Returns `null` on missing key or parse failure. |
| `setJSON` | `(key: string, value: unknown)` | `Promise<void>` | Serialize a value to JSON and write it. |

All methods silently catch storage errors (quota exceeded, security restrictions) and log warnings via `@polkadot-apps/logger`.

## Types

```typescript
interface KvStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  getJSON<T>(key: string): Promise<T | null>;
  setJSON(key: string, value: unknown): Promise<void>;
}

interface KvStoreOptions {
  /** Key prefix to namespace storage keys (e.g. "myapp" results in keys like "myapp:theme"). */
  prefix?: string;
  /** Override auto-detection. Routes all operations through this host storage. */
  hostLocalStorage?: HostLocalStorage;
}

interface HostLocalStorage {
  readString(key: string): Promise<string>;
  writeString(key: string, value: string): Promise<void>;
  readJSON(key: string): Promise<unknown>;
  writeJSON(key: string, value: unknown): Promise<void>;
  clear(key: string): Promise<void>;
}
```

## License

Apache-2.0
