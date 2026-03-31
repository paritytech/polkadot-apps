# @polkadot-apps/statement-store

Publish/subscribe client for the Polkadot Statement Store with topic-based routing and SCALE encoding.

## Install

```bash
pnpm add @polkadot-apps/statement-store
```

This package depends on `@polkadot-apps/chain-client`, `@polkadot-apps/descriptors`, `@polkadot-apps/logger`, `@noble/hashes`, and `polkadot-api`, which are installed automatically.

## Quick start

```typescript
import { StatementStoreClient } from "@polkadot-apps/statement-store";

const client = new StatementStoreClient({ appName: "my-app" });
await client.connect(signer);

// Publish a message
await client.publish({ type: "hello", peerId: "abc" }, {
  channel: "presence/abc",
  topic2: "room-123",
});

// Subscribe to messages
const sub = client.subscribe<{ type: string }>(statement => {
  console.log(statement.data.type);
});

// Clean up
sub.unsubscribe();
client.destroy();
```

## StatementStoreClient

The primary interface for publishing and subscribing to statements. Handles SCALE encoding, Sr25519 signing, topic management, and resilient delivery via subscription with polling fallback.

### Creating a client

```typescript
import { StatementStoreClient } from "@polkadot-apps/statement-store";

const client = new StatementStoreClient({
  appName: "my-app",               // Required. Used as primary topic (blake2b hash).
  endpoint: "wss://rpc.example.com", // Optional. Fallback WebSocket endpoint.
  pollIntervalMs: 10_000,           // Optional. Polling interval. Default: 10000.
  defaultTtlSeconds: 30,            // Optional. Statement TTL. Default: 30.
  enablePolling: true,              // Optional. Enable polling fallback. Default: true.
});
```

### Connecting

Call `connect` with an Sr25519 signer to establish the transport. The client tries the chain-client bulletin first, then falls back to the configured WebSocket endpoint.

```typescript
import type { StatementSignerWithKey } from "@polkadot-apps/statement-store";

const signer: StatementSignerWithKey = {
  publicKey: myPublicKey,       // Uint8Array, 32 bytes
  sign: (msg) => mySignFn(msg), // Returns Uint8Array (64 bytes) or Promise<Uint8Array>
};

await client.connect(signer);
console.log(client.isConnected());       // true
console.log(client.getPublicKeyHex());   // "0xaa..."
```

### Publishing

Publish typed JSON data. Returns `true` if the network accepted the statement ("new" or "known"), `false` if rejected.

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
    console.log(statement.signer);   // Uint8Array | undefined
    console.log(statement.channel);  // Uint8Array | undefined
    console.log(statement.expiry);   // bigint | undefined
  },
  { topic2: "room-123" },           // Optional. Filter by secondary topic.
);

// Stop listening
sub.unsubscribe();
```

### Querying existing statements

Fetch statements that were published before the subscription started.

```typescript
const statements = await client.query<{ type: string }>({
  topic2: "room-123",
});

for (const stmt of statements) {
  console.log(stmt.data, stmt.signer);
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

## Codec (advanced)

Direct access to SCALE encoding and decoding for consumers that need low-level control.

```typescript
import {
  encodeData,
  decodeData,
  encodeStatement,
  decodeStatement,
  createSignatureMaterial,
  toHex,
  fromHex,
} from "@polkadot-apps/statement-store";

// Encode/decode JSON payloads
const bytes = encodeData({ hello: "world" }); // Uint8Array (JSON to UTF-8, max 512 bytes)
const parsed = decodeData<{ hello: string }>(bytes);

// Encode/decode full SCALE statements
const encoded = encodeStatement(fields, signerPublicKey, signature); // Uint8Array
const decoded = decodeStatement("0x...");  // DecodedStatement

// Signature material for manual signing
const material = createSignatureMaterial(fields); // Uint8Array

// Hex conversion
const hex = toHex(new Uint8Array([0xde, 0xad])); // "0xdead"
const raw = fromHex("0xdead");                     // Uint8Array
```

## Transport (advanced)

For consumers that need custom transport implementations or direct WebSocket access.

```typescript
import { createTransport, RpcTransport } from "@polkadot-apps/statement-store";

// Auto-detect: tries chain-client bulletin, falls back to direct WebSocket
const transport = await createTransport({ endpoint: "wss://rpc.example.com" });

// Or use the RPC transport directly
const rpc = new RpcTransport(/* ... */);
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
| `StatementEncodingError` | SCALE encode/decode failed | -- |
| `StatementSubmitError` | Node rejected the statement | `detail: unknown` |
| `StatementSubscriptionError` | Subscription setup failed (non-fatal) | -- |
| `StatementConnectionError` | Transport connection failed | -- |
| `StatementDataTooLargeError` | Data exceeds 512 bytes | `actualSize: number`, `maxSize: number` |

## API

### StatementStoreClient

```typescript
class StatementStoreClient {
  constructor(config: StatementStoreConfig)
  connect(signer: StatementSignerWithKey): Promise<void>
  publish<T>(data: T, options?: PublishOptions): Promise<boolean>
  subscribe<T>(callback: (statement: ReceivedStatement<T>) => void, options?: { topic2?: string }): Unsubscribable
  query<T>(options?: { topic2?: string; decryptionKey?: Uint8Array }): Promise<ReceivedStatement<T>[]>
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
function serializeTopicFilter(filter: TopicFilter): SerializedTopicFilter
```

### Codec

```typescript
function encodeStatement(fields: StatementFields, signer: Uint8Array, signature: Uint8Array): Uint8Array
function decodeStatement(hex: string): DecodedStatement
function encodeData<T>(value: T): Uint8Array
function decodeData<T>(bytes: Uint8Array): T
function createSignatureMaterial(fields: StatementFields): Uint8Array
function toHex(bytes: Uint8Array): string
function fromHex(hex: string): Uint8Array
```

### Transport

```typescript
function createTransport(config: { endpoint?: string }): Promise<StatementTransport>
class RpcTransport { /* JSON-RPC over WebSocket */ }
```

## Types

```typescript
/** Branded 32-byte blake2b-256 hash for statement topics. */
type TopicHash = Uint8Array & { readonly __brand: "TopicHash" };

/** Branded 32-byte blake2b-256 hash for statement channels. */
type ChannelHash = Uint8Array & { readonly __brand: "ChannelHash" };

interface StatementStoreConfig {
  appName: string;
  endpoint?: string;
  pollIntervalMs?: number;      // Default: 10000
  defaultTtlSeconds?: number;   // Default: 30
  enablePolling?: boolean;      // Default: true
}

interface PublishOptions {
  channel?: string;
  topic2?: string;
  ttlSeconds?: number;
  decryptionKey?: Uint8Array;
}

interface ReceivedStatement<T = unknown> {
  data: T;
  signer?: Uint8Array;
  channel?: Uint8Array;
  topic1?: Uint8Array;
  topic2?: Uint8Array;
  expiry?: bigint;
  raw: DecodedStatement;
}

interface StatementFields {
  expirationTimestamp: number;
  sequenceNumber: number;
  decryptionKey?: Uint8Array;
  channel?: Uint8Array;
  topic1?: Uint8Array;
  topic2?: Uint8Array;
  data?: Uint8Array;
}

interface DecodedStatement {
  signer?: Uint8Array;
  expiry?: bigint;
  decryptionKey?: Uint8Array;
  topic1?: Uint8Array;
  topic2?: Uint8Array;
  channel?: Uint8Array;
  data?: Uint8Array;
}

type TopicFilter = "any" | { matchAll: TopicHash[] } | { matchAny: TopicHash[] };
type SerializedTopicFilter = "any" | { matchAll: string[] } | { matchAny: string[] };

interface StatementSignerWithKey {
  publicKey: Uint8Array;
  sign: (message: Uint8Array) => Uint8Array | Promise<Uint8Array>;
}

type SubmitStatus = "new" | "known" | "rejected";

interface Unsubscribable {
  unsubscribe: () => void;
}

interface StatementTransport {
  subscribe(filter: TopicFilter, onStatement: (hex: string) => void, onError: (error: Error) => void): Unsubscribable;
  submit(statementHex: string): Promise<SubmitStatus>;
  query(topics: TopicHash[], decryptionKey?: string): Promise<string[]>;
  destroy(): void;
}
```

## License

Apache-2.0
