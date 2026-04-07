# Statement Store API Reference

Package: `@polkadot-apps/statement-store`

## Classes

### StatementStoreClient

High-level client for the Polkadot Statement Store. Handles SCALE encoding, Sr25519 signing, topic management, and resilient delivery (subscription + polling fallback).

```ts
import { StatementStoreClient } from "@polkadot-apps/statement-store";
```

#### Constructor

```ts
constructor(config: StatementStoreConfig)
```

Creates a new client. Does not connect -- call `connect()` to establish the transport.

#### Methods

```ts
async connect(signer: StatementSignerWithKey): Promise<void>
```

Connect to the statement store and start receiving statements. Establishes the transport connection (chain-client bulletin first, then endpoint fallback), starts a real-time subscription on the application's topic, fetches existing statements via polling, and begins the polling fallback (if enabled). Duplicate concurrent calls are deduplicated. No-op if already connected. Throws `StatementConnectionError` if the transport cannot be established.

---

```ts
async publish<T>(data: T, options?: PublishOptions): Promise<boolean>
```

Publish typed data to the statement store. Encodes data as JSON, builds a SCALE-encoded statement with configured topics and TTL, signs it with Sr25519, and submits to the network. Returns `true` if accepted (`"new"` or `"known"`), `false` if rejected. Transport errors are caught and logged (returns `false`). Throws `StatementConnectionError` if not connected. Throws `StatementDataTooLargeError` if encoded data exceeds 512 bytes.

---

```ts
subscribe<T>(
  callback: (statement: ReceivedStatement<T>) => void,
  options?: { topic2?: string },
): Unsubscribable
```

Subscribe to incoming statements on this application's topic. Receives both real-time subscription events and polling results. Statements are deduplicated by channel + expiry. When `options.topic2` is provided, only statements matching that secondary topic are delivered.

---

```ts
async query<T>(options?: {
  topic2?: string;
  decryptionKey?: Uint8Array;
}): Promise<ReceivedStatement<T>[]>
```

Query existing statements from the store. Useful for catching up on state published before the subscription started. If `decryptionKey` is omitted but `topic2` is provided, the decryption key is derived from the topic2 hash. Throws `StatementConnectionError` if not connected.

---

```ts
isConnected(): boolean
```

Whether the client is connected and ready to publish/subscribe.

---

```ts
getPublicKeyHex(): string
```

Get the signer's public key as a hex string with `0x` prefix. Returns empty string if not connected.

---

```ts
destroy(): void
```

Destroy the client. Stops polling, unsubscribes, closes the transport, and clears all state. Safe to call multiple times. The client cannot be reused after destruction.

---

### ChannelStore\<T\>

Higher-level abstraction providing last-write-wins channel semantics over the statement store. Each channel name maps to a single value; newer timestamps replace older ones.

```ts
import { ChannelStore } from "@polkadot-apps/statement-store";
```

The type parameter `T` must extend `{ timestamp?: number }`.

#### Constructor

```ts
constructor(client: StatementStoreClient, options?: { topic2?: string })
```

Creates a channel store backed by a connected `StatementStoreClient`. Immediately subscribes to incoming statements.

#### Methods

```ts
async write(channelName: string, value: T): Promise<boolean>
```

Write a value to a named channel. If the value lacks a `timestamp`, `Date.now()` is added automatically. Returns `true` if accepted by the network.

---

```ts
read(channelName: string): T | undefined
```

Read the latest value for a channel by its human-readable name. Returns `undefined` if no value has been received.

---

```ts
readAll(): ReadonlyMap<string, T>
```

Read all channel values. Keys are hex-encoded channel hashes (not human-readable names).

---

```ts
get size: number
```

Number of channels currently tracked.

---

```ts
onChange(
  callback: (channelName: string, value: T, previous: T | undefined) => void,
): Unsubscribable
```

Subscribe to channel value changes. Fires for both network-received and locally-written updates.

---

```ts
destroy(): void
```

Destroy the channel store and clean up subscriptions. Does **not** destroy the underlying client.

---

## Topic Functions

```ts
import {
  createTopic,
  createChannel,
  serializeTopicFilter,
  topicToHex,
  topicsEqual,
} from "@polkadot-apps/statement-store";
```

### createTopic

```ts
function createTopic(name: string): TopicHash
```

Create a 32-byte topic hash from a human-readable string using blake2b-256.

### createChannel

```ts
function createChannel(name: string): ChannelHash
```

Create a 32-byte channel hash from a human-readable channel name using blake2b-256. Identical algorithm to `createTopic` but returns a differently branded type.

### topicToHex

```ts
function topicToHex(hash: Uint8Array): string
```

Convert a topic or channel hash to a hex string with `0x` prefix.

### topicsEqual

```ts
function topicsEqual(a: Uint8Array, b: Uint8Array): boolean
```

Compare two topic or channel hashes for byte equality. Returns `false` if lengths differ.

### serializeTopicFilter

```ts
function serializeTopicFilter(filter: TopicFilter): SerializedTopicFilter
```

Serialize a `TopicFilter` into the JSON-RPC format expected by statement store nodes. Converts topic hashes to hex strings.

---

## Codec Functions

```ts
import {
  encodeData,
  decodeData,
  encodeStatement,
  decodeStatement,
  createSignatureMaterial,
  toHex,
  fromHex,
} from "@polkadot-apps/statement-store";
```

### encodeData

```ts
function encodeData<T>(value: T): Uint8Array
```

Encode a value as a JSON-serialized UTF-8 byte payload. Throws `StatementDataTooLargeError` if the result exceeds `MAX_STATEMENT_SIZE` (512 bytes).

### decodeData

```ts
function decodeData<T>(bytes: Uint8Array): T
```

Decode a JSON-serialized data payload from UTF-8 bytes. Throws `StatementEncodingError` if the bytes are not valid UTF-8 or valid JSON.

### encodeStatement

```ts
function encodeStatement(
  fields: StatementFields,
  signer: Uint8Array,
  signature: Uint8Array,
): Uint8Array
```

Encode a complete SCALE-encoded statement with all fields including the Sr25519 authenticity proof. `signer` is a 32-byte public key, `signature` is a 64-byte Sr25519 signature.

### decodeStatement

```ts
function decodeStatement(hex: string): DecodedStatement
```

Decode a SCALE-encoded statement from a hex string (with or without `0x` prefix). Parses all known field tags (0, 2, 3, 4, 5, 6, 8). Throws `StatementEncodingError` on unknown tags or structural corruption.

### createSignatureMaterial

```ts
function createSignatureMaterial(fields: StatementFields): Uint8Array
```

Create the byte sequence that gets signed with Sr25519. Includes all fields except the proof itself. Field tags: 2=expiry, 3=decryptionKey, 4=topic1, 5=topic2, 6=channel, 8=data.

### toHex

```ts
function toHex(bytes: Uint8Array): string
```

Convert bytes to a hex string with `0x` prefix.

### fromHex

```ts
function fromHex(hex: string): Uint8Array
```

Convert a hex string (with or without `0x` prefix) to bytes.

---

## Transport

```ts
import { RpcTransport, createTransport } from "@polkadot-apps/statement-store";
import type { RpcClient } from "@polkadot-apps/statement-store";
```

### createTransport

```ts
async function createTransport(config: { endpoint?: string }): Promise<StatementTransport>
```

Create a statement store transport. Strategy:
1. Try chain-client's bulletin chain connection (Host API routing in containers).
2. Fall back to direct WebSocket using the provided `endpoint`.
3. Throw `StatementConnectionError` if neither works.

### RpcTransport

```ts
class RpcTransport implements StatementTransport
```

Statement store transport using JSON-RPC over WebSocket.

#### Constructor

```ts
constructor(client: RpcClient, ownsClient: boolean)
```

- `client`: The RPC client for communication.
- `ownsClient`: If `true`, `destroy()` also destroys the client. Set `false` when sharing a client from chain-client.

#### Methods

```ts
subscribe(
  filter: TopicFilter,
  onStatement: (statementHex: string) => void,
  onError: (error: Error) => void,
): Unsubscribable
```

Subscribe via `statement_subscribeStatement` RPC. Handles raw hex, `StatementEvent`, and nested wrapper formats.

```ts
async submit(statementHex: string): Promise<SubmitStatus>
```

Submit via `statement_submit` RPC. Returns `"new"`, `"known"`, or `"rejected"`.

```ts
async query(topics: TopicHash[], decryptionKey?: string): Promise<string[]>
```

Query via RPC with graceful fallback: `statement_posted` -> `statement_broadcasts` -> `statement_dump`.

```ts
destroy(): void
```

Destroy the transport. Only destroys the RPC client if `ownsClient` is `true`.

### RpcClient (interface)

```ts
interface RpcClient {
  request: (method: string, params: unknown[]) => Promise<unknown>;
  _request: <T, S>(
    method: string,
    params: unknown[],
    callbacks: {
      onSuccess: (
        subscriptionId: T,
        followSubscription: (
          id: T,
          handlers: { next: (event: S) => void; error: (e: Error) => void },
        ) => void,
      ) => void;
      onError: (error: Error) => void;
    },
  ) => () => void;
  destroy: () => void;
}
```

A PolkadotClient-compatible interface for raw RPC operations.

---

## Error Classes

All errors extend `StatementStoreError`, which extends `Error`.

```ts
import {
  StatementStoreError,
  StatementEncodingError,
  StatementSubmitError,
  StatementSubscriptionError,
  StatementConnectionError,
  StatementDataTooLargeError,
} from "@polkadot-apps/statement-store";
```

### StatementStoreError

```ts
class StatementStoreError extends Error {
  constructor(message: string, options?: ErrorOptions)
}
```

Base class for all statement store errors. Use `instanceof StatementStoreError` to catch any error from this package.

### StatementEncodingError

```ts
class StatementEncodingError extends StatementStoreError {
  constructor(message: string, options?: ErrorOptions)
}
```

SCALE encoding or decoding failed. Corrupt data, unknown field tags, or invalid JSON.

### StatementSubmitError

```ts
class StatementSubmitError extends StatementStoreError {
  readonly detail: unknown;
  constructor(detail: unknown)
}
```

Statement store node rejected a submitted statement. `detail` contains the raw RPC response.

### StatementSubscriptionError

```ts
class StatementSubscriptionError extends StatementStoreError {
  constructor(message: string, options?: ErrorOptions)
}
```

Failed to set up or maintain a subscription. Non-fatal -- the client falls back to polling.

### StatementConnectionError

```ts
class StatementConnectionError extends StatementStoreError {
  constructor(message: string, options?: ErrorOptions)
}
```

Failed to connect to the transport. WebSocket unreachable or chain-client bulletin not connected.

### StatementDataTooLargeError

```ts
class StatementDataTooLargeError extends StatementStoreError {
  readonly actualSize: number;
  readonly maxSize: number;
  constructor(actualSize: number, maxSize?: number)
}
```

Statement data payload exceeds `MAX_STATEMENT_SIZE`. Default `maxSize` is 512. Inspect `actualSize` to see how much over the limit you are.

---

## Types

```ts
import type {
  TopicHash,
  ChannelHash,
  StatementFields,
  DecodedStatement,
  TopicFilter,
  SerializedTopicFilter,
  StatementStoreConfig,
  PublishOptions,
  ReceivedStatement,
  StatementSigner,
  StatementSignerWithKey,
  SubmitStatus,
  StatementTransport,
  Unsubscribable,
  StatementEvent,
} from "@polkadot-apps/statement-store";
```

### TopicHash

```ts
type TopicHash = Uint8Array & { readonly __brand: "TopicHash" }
```

A 32-byte blake2b-256 hash used as a statement topic. Create with `createTopic()`.

### ChannelHash

```ts
type ChannelHash = Uint8Array & { readonly __brand: "ChannelHash" }
```

A 32-byte blake2b-256 hash used as a channel identifier. Create with `createChannel()`.

### StatementFields

```ts
interface StatementFields {
  expirationTimestamp: number;
  sequenceNumber: number;
  decryptionKey?: Uint8Array;
  channel?: Uint8Array;
  topic1?: Uint8Array;
  topic2?: Uint8Array;
  data?: Uint8Array;
}
```

Raw statement fields before signing. Maps to SCALE-encoded on-chain format.

### DecodedStatement

```ts
interface DecodedStatement {
  signer?: Uint8Array;
  expiry?: bigint;
  decryptionKey?: Uint8Array;
  topic1?: Uint8Array;
  topic2?: Uint8Array;
  channel?: Uint8Array;
  data?: Uint8Array;
}
```

Statement decoded from the network. `signer` is a 32-byte Sr25519 public key. `expiry` encodes timestamp in upper 32 bits and sequence number in lower 32 bits.

### TopicFilter

```ts
type TopicFilter = "any" | { matchAll: TopicHash[] } | { matchAny: TopicHash[] }
```

Filter for subscriptions and queries. `"any"` matches all; `matchAll` requires all topics present; `matchAny` requires at least one.

### SerializedTopicFilter

```ts
type SerializedTopicFilter = "any" | { matchAll: string[] } | { matchAny: string[] }
```

JSON-RPC serialized form with hex-encoded topic strings.

### StatementStoreConfig

```ts
interface StatementStoreConfig {
  appName: string;
  endpoint?: string;
  pollIntervalMs?: number;    // default: 10_000
  defaultTtlSeconds?: number; // default: 30
  enablePolling?: boolean;    // default: true
}
```

Configuration for `StatementStoreClient`.

### PublishOptions

```ts
interface PublishOptions {
  channel?: string;
  topic2?: string;
  ttlSeconds?: number;
  decryptionKey?: Uint8Array;
}
```

Options for publishing a single statement. `channel` and `topic2` are human-readable strings (hashed internally with blake2b).

### ReceivedStatement\<T\>

```ts
interface ReceivedStatement<T = unknown> {
  data: T;
  signer?: Uint8Array;
  channel?: Uint8Array;
  topic1?: Uint8Array;
  topic2?: Uint8Array;
  expiry?: bigint;
  raw: DecodedStatement;
}
```

A received statement with typed data and metadata. `data` is the parsed JSON payload.

### StatementSigner

```ts
type StatementSigner = (message: Uint8Array) => Uint8Array | Promise<Uint8Array>
```

A function that signs a message with an Sr25519 key. Takes signature material bytes, returns a 64-byte signature.

### StatementSignerWithKey

```ts
interface StatementSignerWithKey {
  publicKey: Uint8Array;  // 32-byte Sr25519 public key
  sign: StatementSigner;
}
```

An Sr25519 signer with its associated public key. Required by `StatementStoreClient.connect()`.

### SubmitStatus

```ts
type SubmitStatus = "new" | "known" | "rejected"
```

Result status from submitting a statement via RPC.

### StatementTransport

```ts
interface StatementTransport {
  subscribe(
    filter: TopicFilter,
    onStatement: (statementHex: string) => void,
    onError: (error: Error) => void,
  ): Unsubscribable;
  submit(statementHex: string): Promise<SubmitStatus>;
  query(topics: TopicHash[], decryptionKey?: string): Promise<string[]>;
  destroy(): void;
}
```

Low-level transport interface. Most consumers should use `StatementStoreClient` instead.

### Unsubscribable

```ts
interface Unsubscribable {
  unsubscribe: () => void;
}
```

Handle returned by subscription methods.

### StatementEvent

```ts
interface StatementEvent {
  statements: string[];
  remaining?: number;
}
```

Batched event format from the subscription API. `remaining` indicates statements still in initial sync.

---

## Constants

```ts
import {
  MAX_STATEMENT_SIZE,
  MAX_USER_TOTAL,
  DEFAULT_TTL_SECONDS,
  DEFAULT_POLL_INTERVAL_MS,
} from "@polkadot-apps/statement-store";
```

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_STATEMENT_SIZE` | `512` | Maximum size of a single statement's data payload in bytes |
| `MAX_USER_TOTAL` | `1024` | Maximum total storage per user in bytes |
| `DEFAULT_TTL_SECONDS` | `30` | Default time-to-live for published statements in seconds |
| `DEFAULT_POLL_INTERVAL_MS` | `10_000` | Default polling interval in milliseconds for the fallback poller |
