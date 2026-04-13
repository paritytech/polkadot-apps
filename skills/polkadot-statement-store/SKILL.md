---
name: polkadot-statement-store
description: >
  Use when publishing or subscribing to ephemeral messages on the Polkadot Statement Store.
  Covers StatementStoreClient lifecycle, two connection modes (host and local), topic/channel
  creation, ChannelStore last-write-wins semantics, data size limits, and StatementTransport BYOD.
---

# Polkadot Statement Store

The Statement Store is a pub/sub messaging system built on top of the Polkadot Bulletin Chain. It lets peers publish small, signed, ephemeral statements tagged with topics and optional channels. Subscribers filter by topic to receive relevant statements in near real-time (via WebSocket subscriptions) with a polling fallback for reliability.

All code lives in a single package: `@polkadot-apps/statement-store`.

> **DATA SIZE LIMIT: MAX_STATEMENT_SIZE = 512 bytes.** The JSON-serialized payload of any single statement must not exceed 512 bytes after UTF-8 encoding. Attempting to publish larger data throws `StatementDataTooLargeError`. Keep payloads minimal -- use the statement store for signaling and metadata, not bulk data transfer.

> **TWO CONNECTION MODES.** `connect()` takes a `ConnectionCredentials` object, not a raw signer. Use `{ mode: "host", accountId }` inside containers (proof creation is delegated to the host API) or `{ mode: "local", signer }` outside containers (statements are signed locally with Sr25519).

## Dependencies

```json
{
  "dependencies": {
    "@polkadot-apps/statement-store": "workspace:*"
  }
}
```

The package internally depends on:
- `@polkadot-apps/host` -- for Host API transport and `DEFAULT_BULLETIN_ENDPOINT`
- `@novasamatech/sdk-statement` -- for statement SCALE codec and SDK
- `@polkadot-api/substrate-client` -- for WebSocket RPC transport

Optional peer dependency (auto-detected at runtime):
- `@novasamatech/product-sdk` -- for container-hosted transport (host mode)

## Quick Start: Host Mode (Inside Container)

```ts
import { StatementStoreClient } from "@polkadot-apps/statement-store";

// 1. Create client with an application namespace
const client = new StatementStoreClient({ appName: "my-app" });

// 2. Connect with host credentials (inside a container)
//    accountId is a [ss58Address, chainPrefix] tuple from product-sdk
await client.connect({ mode: "host", accountId: ["5Grw...", 42] });

// 3. Subscribe to incoming statements
const sub = client.subscribe<{ type: string; peerId: string }>(statement => {
  console.log(statement.data.type, statement.signerHex);
});

// 4. Publish a statement (must be JSON-serializable, <= 512 bytes)
await client.publish(
  { type: "presence", peerId: "abc123" },
  { channel: "presence/abc123", topic2: "room-42" },
);

// 5. Clean up
sub.unsubscribe();
client.destroy();
```

## Quick Start: Local Mode (Outside Container)

```ts
import { StatementStoreClient } from "@polkadot-apps/statement-store";

// 1. Create client (endpoint defaults to paseo bulletin RPC)
const client = new StatementStoreClient({
  appName: "my-app",
  endpoint: "wss://paseo-bulletin-rpc.polkadot.io",
});

// 2. Connect with a local Sr25519 signer
const signer = {
  publicKey: myPublicKey,   // Uint8Array, 32 bytes
  sign: (msg: Uint8Array) => sr25519Sign(msg, mySecretKey), // 64-byte signature
};
await client.connect({ mode: "local", signer });

// 3. Subscribe to incoming statements
const sub = client.subscribe<{ type: string; peerId: string }>(statement => {
  console.log(statement.data.type, statement.data.peerId);
});

// 4. Publish a statement
await client.publish(
  { type: "presence", peerId: "abc123" },
  { channel: "presence/abc123", topic2: "room-42" },
);

// 5. Clean up
sub.unsubscribe();
client.destroy();
```

## StatementStoreClient Lifecycle

### Create

```ts
const client = new StatementStoreClient({
  appName: "my-app",               // required: blake2b-hashed as topic1
  endpoint: "wss://...",           // optional: fallback WebSocket URL
  pollIntervalMs: 10_000,          // optional: polling interval (default 10s)
  defaultTtlSeconds: 30,           // optional: statement TTL (default 30s)
  enablePolling: true,             // optional: enable poll fallback (default true)
  transport: myCustomTransport,    // optional: BYOD transport (skips auto-detection)
});
```

The `appName` is hashed with blake2b-256 and used as `topic1` for all statements from this client. This scopes your application's traffic so subscribers only see relevant messages.

When `transport` is provided, the client skips host/RPC auto-detection and uses it directly. This is the BYOD path for testing or custom setups.

### Connect

```ts
// Host mode (inside container)
await client.connect({ mode: "host", accountId: ["5Grw...", 42] });

// Local mode (outside container)
await client.connect({ mode: "local", signer: { publicKey, sign } });
```

Connection establishes a transport (Host API first, then falls back to the `endpoint` WebSocket), starts a real-time subscription on the app's topic, and begins the periodic poll fallback (if the transport supports queries).

- Duplicate `connect()` calls are deduplicated (returns the same promise).
- Calling `connect()` when already connected is a no-op.
- Throws `StatementConnectionError` if no transport can be established.

### Publish

```ts
const accepted = await client.publish<MyData>(data, options?);
// accepted: true if submitted successfully, false on transport error
```

Publishes JSON-serializable data as a statement. The transport handles signing -- in host mode, the host API creates the proof; in local mode, the `getStatementSigner` from sdk-statement signs with Sr25519. Returns `true` on success, `false` on rejection or transport error (errors are caught and logged, not thrown).

Throws `StatementConnectionError` if not connected, `StatementDataTooLargeError` if data exceeds 512 bytes.

### Subscribe

```ts
const sub = client.subscribe<MyData>(callback, { topic2?: "room-id" });
sub.unsubscribe();
```

Registers a callback for incoming statements. Can optionally filter by a secondary topic. Receives both real-time subscription events and polling results. Statements are deduplicated by channel + expiry.

### Query

```ts
const results = await client.query<MyData>({ topic2?: "room-id" });
// results: ReceivedStatement<MyData>[]
```

Fetches existing statements from the store. Only available when the transport supports queries (RPC mode). In host mode, the subscription replays initial state automatically, so `query()` returns an empty array.

### Destroy

```ts
client.destroy();
```

Stops polling, unsubscribes, closes the transport, and clears all state. Safe to call multiple times. The client cannot be reused after destruction.

## Topics and Channels

### Topics

Topics are 32-byte blake2b-256 hashes used to filter statements on the network.

- **topic1** (primary): Automatically set from `appName`. All statements from a client share the same topic1.
- **topic2** (secondary): Optional, set per-publish via `PublishOptions.topic2`. Use for scoping to a room, document, or context.

```ts
import { createTopic, topicToHex, topicsEqual } from "@polkadot-apps/statement-store";

const topic = createTopic("my-room");       // TopicHash (branded Uint8Array)
const hex = topicToHex(topic);              // "0x..." (66 chars)
topicsEqual(topicA, topicB);                // byte equality check
```

### Channels

Channels enable **last-write-wins** semantics. For a given channel, only the most recent statement (by expiry timestamp) is kept.

```ts
import { createChannel } from "@polkadot-apps/statement-store";

const channel = createChannel("presence/peer-abc");  // ChannelHash (branded Uint8Array)
```

Use channels for data that should be deduplicated, such as presence announcements where you only care about the latest state per peer.

### Topic Filters

Used internally for subscriptions and queries:

```ts
import { serializeTopicFilter } from "@polkadot-apps/statement-store";

// Match all statements (no filtering)
serializeTopicFilter("any");

// Match statements that have ALL listed topics
serializeTopicFilter({ matchAll: [topic1, topic2] });

// Match statements that have ANY listed topic
serializeTopicFilter({ matchAny: [topicA, topicB] });
```

## ChannelStore: Last-Write-Wins Abstraction

`ChannelStore` is a higher-level abstraction over `StatementStoreClient` that provides a key-value interface with last-write-wins semantics per channel.

```ts
import { StatementStoreClient, ChannelStore } from "@polkadot-apps/statement-store";

interface Presence {
  type: "presence";
  peerId: string;
  timestamp: number;
}

const client = new StatementStoreClient({ appName: "my-app" });
await client.connect({ mode: "local", signer });

const channels = new ChannelStore<Presence>(client, { topic2: "doc-123" });

// Write to a channel
await channels.write("presence/peer-abc", {
  type: "presence",
  peerId: "abc",
  timestamp: Date.now(),
});

// Read latest value
const value = channels.read("presence/peer-abc");

// Read all channels
const all = channels.readAll();  // ReadonlyMap<string, Presence>
console.log(channels.size);      // number of tracked channels

// React to changes
const sub = channels.onChange((channelName, value, previous) => {
  console.log(`Channel ${channelName} updated`, value);
});

// Clean up (does NOT destroy the underlying client)
sub.unsubscribe();
channels.destroy();
client.destroy();
```

Values should include a `timestamp` field for ordering. If omitted, `Date.now()` is added automatically on write.

## ReceivedStatement Shape

When you subscribe or query, you receive `ReceivedStatement<T>` objects with the following shape:

```ts
interface ReceivedStatement<T = unknown> {
  data: T;              // Parsed JSON data payload
  signerHex?: string;   // Signer's public key hex (from proof), if present
  channelHex?: string;  // Channel hex, if present
  topics: string[];     // Topics array (hex strings)
  expiry?: bigint;      // Combined expiry (upper 32 bits = timestamp, lower 32 = sequence)
  raw: Statement;       // Full Statement object from sdk-statement for advanced inspection
}
```

Note that `signerHex`, `channelHex`, and `topics` are hex strings (not `Uint8Array`). The `raw` field is the `Statement` type from `@novasamatech/sdk-statement`.

## Data Size Limits

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_STATEMENT_SIZE` | 512 bytes | Maximum size of a single statement's JSON data payload after UTF-8 encoding |
| `MAX_USER_TOTAL` | 1024 bytes | Maximum total storage per user across all active statements |
| `DEFAULT_TTL_SECONDS` | 30 | Default time-to-live for published statements |
| `DEFAULT_POLL_INTERVAL_MS` | 10,000 | Default polling interval for the fallback poller |

The 512-byte limit applies to the **JSON-serialized, UTF-8-encoded** payload. For example, `{ "type": "presence", "peerId": "abc" }` is 37 bytes. Use compact JSON keys and minimal payloads.

## Data Encoding Utilities

For consumers that need direct JSON-to-bytes conversion or hex utilities:

```ts
import { encodeData, decodeData, toHex, fromHex } from "@polkadot-apps/statement-store";

// Encode JSON to bytes (throws if > 512 bytes)
const bytes = encodeData({ type: "hello" });

// Decode bytes back to JSON
const parsed = decodeData<{ type: string }>(bytes);

// Hex utilities
const hex = toHex(new Uint8Array([0xde, 0xad]));  // "0xdead"
const bytes2 = fromHex("0xdead");                   // Uint8Array([0xde, 0xad])
```

## Transport (Advanced)

The client auto-detects the best transport. For BYOD or testing, inject a custom transport:

```ts
import { StatementStoreClient } from "@polkadot-apps/statement-store";
import type { StatementTransport } from "@polkadot-apps/statement-store";

// BYOD: provide your own transport
const myTransport: StatementTransport = {
  subscribe(filter, onStatements, onError) {
    // Set up subscription, call onStatements with Statement[] batches
    return { unsubscribe: () => {} };
  },
  async signAndSubmit(statement, credentials) {
    // Sign and submit the statement
  },
  // Optional: query is only needed if you want polling fallback
  async query(filter) {
    return [];
  },
  destroy() {
    // Clean up resources
  },
};

const client = new StatementStoreClient({
  appName: "my-app",
  transport: myTransport,
});
```

The built-in transports are:
- **HostTransport** -- uses the Host API's native binary protocol (inside containers). Subscriptions replay initial state, so no `query()` method.
- **RpcTransport** -- uses `@polkadot-api/substrate-client` with `@novasamatech/sdk-statement` over WebSocket (outside containers). Supports `query()` for polling fallback.

`createTransport({ endpoint? })` is the factory that auto-detects: Host API first, then falls back to RPC.

## Error Handling

All errors extend `StatementStoreError`, so you can catch everything with a single `instanceof` check:

```ts
import {
  StatementStoreError,
  StatementConnectionError,
  StatementDataTooLargeError,
} from "@polkadot-apps/statement-store";

try {
  await client.publish(largeData);
} catch (e) {
  if (e instanceof StatementDataTooLargeError) {
    console.error(`Data too large: ${e.actualSize}/${e.maxSize} bytes`);
  } else if (e instanceof StatementConnectionError) {
    console.error("Not connected");
  } else if (e instanceof StatementStoreError) {
    console.error("Statement store error:", e.message);
  }
}
```

## Common Mistakes

1. **Exceeding the 512-byte data limit.** The statement store is for signaling, not bulk data. If you need to send more than 512 bytes, send a reference (hash, URL) and fetch the full data separately.

2. **Passing a raw signer object to `connect()` instead of `ConnectionCredentials`.** The `connect()` method requires `{ mode: "host", accountId }` or `{ mode: "local", signer }`. There is a deprecated overload that accepts a bare `StatementSignerWithKey`, but always prefer the explicit `ConnectionCredentials` form.

3. **Using `PolkadotSigner` from polkadot-api.** The local mode signer is a `StatementSignerWithKey` with a raw `publicKey: Uint8Array` (32 bytes) and `sign` function returning a raw 64-byte Sr25519 signature. A `PolkadotSigner` from polkadot-api has a completely different interface and will fail.

4. **Using host mode outside a container.** Host mode (`{ mode: "host" }`) requires the Host API from product-sdk, which is only available inside containers. Outside containers, use `{ mode: "local", signer }`.

5. **Forgetting to call `destroy()`.** The client keeps WebSocket connections open, timers running, and subscriptions active. Always destroy when done. In frameworks, clean up in unmount/cleanup handlers.

6. **Not awaiting `connect()`.** Publishing or querying before the connect promise resolves throws `StatementConnectionError`.

7. **Expecting statements to persist indefinitely.** Statements have a TTL (default 30 seconds). They are ephemeral by design. Use the `ttlSeconds` option to extend if needed, but the store is not a database.

8. **Creating multiple clients for the same app.** Each `StatementStoreClient` opens its own transport connection. Share a single client instance across your application and use `subscribe()` with different `topic2` filters for scoping.

9. **Ignoring the `ChannelStore` for presence-like patterns.** If you need last-write-wins semantics (presence, cursor position, status), use `ChannelStore` instead of manually managing channels with the raw client.

## Reference Files

- [Statement Store API](references/statement-store-api.md) - Full API surface: classes, functions, types, constants, errors
