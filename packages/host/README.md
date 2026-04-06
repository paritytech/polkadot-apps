# @polkadot-apps/host

Host container detection and storage access for Polkadot Desktop and Mobile environments.

## Install

```bash
pnpm add @polkadot-apps/host
# or
npm install @polkadot-apps/host
```

### Peer Dependencies

`@novasamatech/product-sdk` is an optional peer dependency. When available, it is used as the primary container detection mechanism. The package works without it by falling back to manual environment checks.

```bash
pnpm add @novasamatech/product-sdk
```

## Quick Start

```typescript
import { isInsideContainer, getHostLocalStorage, getHostProvider } from "@polkadot-apps/host";

if (await isInsideContainer()) {
  const storage = await getHostLocalStorage();
  await storage?.writeString("last-visit", new Date().toISOString());
}

// Get a host-routed chain provider (returns null outside a container)
const provider = await getHostProvider("0xabc...", wsProvider) ?? wsProvider;
```

## Container Detection

`isInsideContainer` determines whether the current page is running inside the Polkadot Desktop or Mobile shell.

```typescript
import { isInsideContainer } from "@polkadot-apps/host";

const hosted = await isInsideContainer();
// true when running inside Polkadot Desktop/Mobile, false otherwise
```

### Detection Signals

The function checks the following signals, in order:

1. **product-sdk sandboxProvider** -- If `@novasamatech/product-sdk` is installed, its sandbox provider is used as the authoritative check.
2. **`__HOST_WEBVIEW_MARK__`** -- A global flag injected by the mobile WebView shell.
3. **`__HOST_API_PORT__`** -- A global variable set by the desktop host process.
4. **iframe detection** -- Checks whether the page is embedded in an iframe, which may indicate a container context.

The function returns `true` as soon as any signal matches.

## Host localStorage

When running inside a container, `getHostLocalStorage` returns a `HostLocalStorage` object that bridges to the host application's persistent storage. Outside a container it returns `null`.

```typescript
import { getHostLocalStorage } from "@polkadot-apps/host";

const storage = await getHostLocalStorage();

if (storage) {
  // String values
  await storage.writeString("theme", "dark");
  const theme = await storage.readString("theme"); // "dark"

  // Structured data (serialized as JSON)
  await storage.writeJSON("preferences", { locale: "en", currency: "DOT" });
  const prefs = await storage.readJSON("preferences");

  // Clear all host storage
  await storage.clear();
} else {
  // Not inside a container -- fall back to window.localStorage
}
```

## Host Provider

When running inside a Polkadot container, `getHostProvider` wraps chain connections through the host's shared connection pool, enabling efficient routing and resource sharing.

```typescript
import { getHostProvider } from "@polkadot-apps/host";
import { getWsProvider } from "polkadot-api/ws-provider/web";

const ws = getWsProvider("wss://rpc.example.com");
const provider = await getHostProvider("0xabc...", ws);

if (provider) {
  // Inside container — connections route through the host
  const client = createClient(provider);
} else {
  // Outside container — use WebSocket directly
  const client = createClient(ws);
}
```

## API

| Function | Signature | Description |
|---|---|---|
| `isInsideContainer` | `() => Promise<boolean>` | Detect if running inside the Polkadot Desktop/Mobile container. Uses product-sdk as the primary signal, with manual fallbacks. |
| `getHostLocalStorage` | `() => Promise<HostLocalStorage \| null>` | Get the host localStorage bridge when inside a container. Returns `null` outside a container. |
| `getHostProvider` | `(genesisHash, fallback?) => Promise<JsonRpcProvider \| null>` | Get a host-routed PAPI provider. Returns `null` when product-sdk is unavailable. |

## Types

```typescript
interface HostLocalStorage {
  /** Read a string value by key. */
  readString(key: string): Promise<string | null>;

  /** Write a string value. */
  writeString(key: string, value: string): Promise<void>;

  /** Read and deserialize a JSON value. */
  readJSON<T = unknown>(key: string): Promise<T | null>;

  /** Serialize and write a JSON value. */
  writeJSON<T = unknown>(key: string, value: T): Promise<void>;

  /** Clear all stored values. */
  clear(): Promise<void>;
}
```

## License

Apache-2.0
