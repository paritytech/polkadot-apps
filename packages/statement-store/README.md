# @polkadot-apps/statement-store

Publish/subscribe client for the Polkadot Statement Store with host-first transport and topic-based routing.

## Install

```bash
pnpm add @polkadot-apps/statement-store
```

This package depends on `@polkadot-apps/host`, `@polkadot-apps/logger`, `@polkadot-apps/utils`, `@novasamatech/sdk-statement`, and `@polkadot-api/substrate-client`, which are installed automatically. The optional peer dependency `@novasamatech/product-sdk` is required for host mode (inside containers).

## Quick start

The client supports two connection modes depending on the runtime environment.

### Host mode (inside a container)

Inside Polkadot Desktop/Mobile, proof creation and submission are delegated to the host API. No WebSocket endpoint is needed.

```typescript
import { StatementStoreClient } from "@polkadot-apps/statement-store";

const client = new StatementStoreClient({ appName: "my-app" });
await client.connect({ mode: "host", accountId: ["5Grw...", 42] });

await client.publish({ type: "hello", peerId: "abc" }, {
  channel: "presence/abc",
  topic2: "room-123",
});

const sub = client.subscribe<{ type: string }>(statement => {
  console.log(statement.data.type);
});

sub.unsubscribe();
client.destroy();
```

### Local mode (outside a container)

Outside containers, statements are signed locally with an Sr25519 signer and submitted over WebSocket RPC.

```typescript
import { StatementStoreClient } from "@polkadot-apps/statement-store";

const signer = {
  publicKey: myPublicKey,       // Uint8Array, 32 bytes
  sign: (msg) => mySignFn(msg), // Returns Uint8Array (64 bytes) or Promise<Uint8Array>
};

const client = new StatementStoreClient({
  appName: "my-app",
  endpoint: "wss://paseo-bulletin-rpc.polkadot.io",
});
await client.connect({ mode: "local", signer });

await client.publish({ type: "hello", peerId: "abc" }, {
  channel: "presence/abc",
});

client.destroy();
```

## StatementStoreClient

The primary interface for publishing and subscribing to statements. Handles JSON encoding, signing (host or local), topic management, and resilient delivery via subscription with polling fallback.

### Creating a client

```typescript
import { StatementStoreClient } from "@polkadot-apps/statement-store";

const client = new StatementStoreClient({
  appName: "my-app",               // Required. Used as primary topic (blake2b hash).
  endpoint: "wss://rpc.example.com", // Optional. Fallback WebSocket endpoint.
  pollIntervalMs: 10_000,           // Optional. Polling interval. Default: 10000.
  defaultTtlSeconds: 30,            // Optional. Statement TTL. Default: 30.
  enablePolling: true,              // Optional. Enable polling fallback. Default: true.
  transport: customTransport,       // Optional. BYOD transport, skips auto-detection.
});
```

### Connecting

Call `connect` with credentials matching the runtime environment. The transport is resolved automatically: host API first, then direct WebSocket RPC as fallback.

```typescript
// Host mode — inside a container
await client.connect({ mode: "host", accountId: ["5Grw...", 42] });

// Local mode — outside a container
await client.connect({ mode: "local", signer: { publicKey, sign } });

console.log(client.isConnected());       // true
console.log(client.getPublicKeyHex());   // "0xaa..." (local mode only)
```

The legacy signature `connect(signer)` is still supported for backward compatibility but deprecated in favor of `connect({ mode: "local", signer })`.

### Publishing

Publish typed JSON data. Returns `true` if the network accepted the statement, `false` if rejected or errored.

```typescript
const accepted = await client.publish(
  { type: "presence", peerId: "abc", timestamp: Date.now() },
  {
    channel: "presence/abc",   // Optional. Enables last-write-wins deduplication.
    topic2: "room-123",        // Optional. Secondary topic for subscriber filtering.
    ttlSeconds: 60,            // Optional. Overrides default TTL.
    decryptionKey: keyBytes,   // Optional. 32-byte hint for filtering.
  },
);
```

Data is serialized as JSON and encoded to UTF-8. The maximum payload size is 512 bytes.

### Subscribing

Listen for incoming statements in real time. Statements are deduplicated by channel and expiry.

```typescript
const sub = client.subscribe<{ type: string; peerId: string }>(
  (statement) => {
    console.log(statement.data.type);
    console.log(statement.signerHex);    // string | undefined
    console.log(statement.channelHex);   // string | undefined
    console.log(statement.topics);       // string[]
    console.log(statement.expiry);       // bigint | undefined
  },
  { topic2: "room-123" },               // Optional. Filter by secondary topic.
);

// Stop listening
sub.unsubscribe();
```

### Querying existing statements

Fetch statements that were published before the subscription started. Only available in RPC mode (local). In host mode, the subscription replays existing statements automatically.

```typescript
const statements = await client.query<{ type: string }>({
  topic2: "room-123",
});

for (const stmt of statements) {
  console.log(stmt.data, stmt.signerHex);
}
```

### Cleanup

```typescript
client.destroy(); // Stops polling, unsubscribes, closes transport. Safe to call multiple times.
```

## ChannelStore

A higher-level abstraction providing last-write-wins semantics over `StatementStoreClient`. Each named channel holds a single value; newer writes replace older ones by timestamp.

```typescript
import { ChannelStore } from "@polkadot-apps/statement-store";

interface Presence {
  type: "presence";
  peerId: string;
  timestamp: number;
}

const channels = new ChannelStore<Presence>(client, { topic2: "doc-123" });

// Write
await channels.write("presence/peer-abc", {
  type: "presence",
  peerId: "abc",
  timestamp: Date.now(),
});

// Read a single channel
const value = channels.read("presence/peer-abc"); // Presence | undefined

// Read all channels
for (const [hashKey, value] of channels.readAll()) {
  console.log(value.peerId);
}

// Track the number of active channels
console.log(channels.size);

// React to changes
const sub = channels.onChange((channelKey, value, previous) => {
  console.log(`Updated: ${channelKey}`, value, previous);
});

sub.unsubscribe();
channels.destroy();
```

If the written value lacks a `timestamp` field, one is added automatically using `Date.now()`.

## Topic and channel utilities

```typescript
import {
  createTopic,
  createChannel,
  topicToHex,
  topicsEqual,
  serializeTopicFilter,
} from "@polkadot-apps/statement-store";

const topic = createTopic("my-app");       // TopicHash (blake2b-256)
const channel = createChannel("presence"); // ChannelHash (blake2b-256)

const hex = topicToHex(topic);             // "0x..."
const equal = topicsEqual(topicA, topicB); // boolean

const serialized = serializeTopicFilter({ matchAll: [topic] });
// { matchAll: ["0x..."] }
```

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_STATEMENT_SIZE` | `512` | Maximum data payload size in bytes |
| `MAX_USER_TOTAL` | `1024` | Maximum total storage per user in bytes |
| `DEFAULT_TTL_SECONDS` | `30` | Default statement time-to-live in seconds |
| `DEFAULT_POLL_INTERVAL_MS` | `10000` | Default polling interval in milliseconds |

## Error handling

All errors extend `StatementStoreError`. Catch the base class to handle any error from this package.

```typescript
import {
  StatementStoreError,
  StatementEncodingError,
  StatementSubmitError,
  StatementSubscriptionError,
  StatementConnectionError,
  StatementDataTooLargeError,
} from "@polkadot-apps/statement-store";

try {
  await client.publish(data);
} catch (err) {
  if (err instanceof StatementDataTooLargeError) {
    console.error(`Too large: ${err.actualSize}/${err.maxSize} bytes`);
  } else if (err instanceof StatementConnectionError) {
    console.error("Not connected");
  } else if (err instanceof StatementStoreError) {
    console.error("Statement store error:", err.message);
  }
}
```

| Error class | When it is thrown | Extra properties |
|-------------|-------------------|------------------|
| `StatementEncodingError` | JSON encode/decode failed | -- |
| `StatementSubmitError` | Node rejected the statement | `detail: unknown` |
| `StatementSubscriptionError` | Subscription setup failed (non-fatal) | -- |
| `StatementConnectionError` | Transport connection failed | -- |
| `StatementDataTooLargeError` | Data exceeds 512 bytes | `actualSize: number`, `maxSize: number` |

## API

### StatementStoreClient

```typescript
class StatementStoreClient {
  constructor(config: StatementStoreConfig)
  connect(credentials: ConnectionCredentials): Promise<void>
  connect(signer: StatementSignerWithKey): Promise<void> // deprecated
  publish<T>(data: T, options?: PublishOptions): Promise<boolean>
  subscribe<T>(callback: (statement: ReceivedStatement<T>) => void, options?: { topic2?: string }): Unsubscribable
  query<T>(options?: { topic2?: string }): Promise<ReceivedStatement<T>[]>
  isConnected(): boolean
  getPublicKeyHex(): string
  destroy(): void
}
```

### ChannelStore

```typescript
class ChannelStore<T extends { timestamp?: number }> {
  constructor(client: StatementStoreClient, options?: { topic2?: string })
  write(channelName: string, value: T): Promise<boolean>
  read(channelName: string): T | undefined
  readAll(): ReadonlyMap<string, T>
  get size(): number
  onChange(callback: (channelName: string, value: T, previous: T | undefined) => void): Unsubscribable
  destroy(): void
}
```

### Topic/channel utilities

```typescript
function createTopic(name: string): TopicHash
function createChannel(name: string): ChannelHash
function topicToHex(hash: Uint8Array): string
function topicsEqual(a: Uint8Array, b: Uint8Array): boolean
function serializeTopicFilter(filter: TopicFilter): SdkTopicFilter
```

### Transport (advanced)

```typescript
function createTransport(config: { endpoint?: string }): Promise<StatementTransport>
```

The `createTransport` factory tries the Host API first (inside containers), then falls back to direct WebSocket RPC via `@polkadot-api/substrate-client` + `@novasamatech/sdk-statement`. Most consumers should use `StatementStoreClient` instead of calling this directly.

## Types

```typescript
/** Connection credentials — host mode or local mode. */
type ConnectionCredentials =
  | { mode: "host"; accountId: [string, number] }
  | { mode: "local"; signer: StatementSignerWithKey };

interface StatementStoreConfig {
  appName: string;
  endpoint?: string;
  pollIntervalMs?: number;      // Default: 10000
  defaultTtlSeconds?: number;   // Default: 30
  enablePolling?: boolean;      // Default: true
  transport?: StatementTransport; // BYOD
}

interface PublishOptions {
  channel?: string;
  topic2?: string;
  ttlSeconds?: number;
  decryptionKey?: Uint8Array;
}

interface ReceivedStatement<T = unknown> {
  data: T;
  signerHex?: string;
  channelHex?: string;
  topics: string[];
  expiry?: bigint;
  raw: Statement;
}

interface StatementSignerWithKey {
  publicKey: Uint8Array;
  sign: (message: Uint8Array) => Uint8Array | Promise<Uint8Array>;
}

/** Branded 32-byte blake2b-256 hash for statement topics. */
type TopicHash = Uint8Array & { readonly __brand: "TopicHash" };

/** Branded 32-byte blake2b-256 hash for statement channels. */
type ChannelHash = Uint8Array & { readonly __brand: "ChannelHash" };

type TopicFilter = "any" | { matchAll: TopicHash[] } | { matchAny: TopicHash[] };

interface StatementTransport {
  subscribe(filter: SdkTopicFilter, onStatements: (statements: Statement[]) => void, onError: (error: Error) => void): Unsubscribable;
  signAndSubmit(statement: Statement, credentials: ConnectionCredentials): Promise<void>;
  query?(filter: SdkTopicFilter): Promise<Statement[]>;
  destroy(): void;
}

interface Unsubscribable {
  unsubscribe: () => void;
}
```

## License

Apache-2.0
