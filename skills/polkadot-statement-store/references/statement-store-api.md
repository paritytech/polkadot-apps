# Statement Store API Reference

Package: `@polkadot-apps/statement-store`

## Classes

### StatementStoreClient

High-level client for the Polkadot Statement Store. Handles topic management, signing delegation (host or local), and resilient delivery (subscription + polling fallback).

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
async connect(credentials: ConnectionCredentials): Promise<void>
```

Connect to the statement store and start receiving statements. Establishes the transport connection (Host API first, then endpoint fallback), starts a real-time subscription on the application's topic, and begins the polling fallback (if enabled and the transport supports queries). Duplicate concurrent calls are deduplicated. No-op if already connected. Throws `StatementConnectionError` if the transport cannot be established.

There is also a deprecated overload that accepts a bare `StatementSignerWithKey` -- this is internally converted to `{ mode: "local", signer }`.

---

```ts
async publish<T>(data: T, options?: PublishOptions): Promise<boolean>
```

Publish typed data to the statement store. Encodes data as JSON, builds a `Statement` object with configured topics, TTL, channel, and expiry, then delegates to the transport's `signAndSubmit()` method. In host mode, the host creates the proof; in local mode, `getStatementSigner` from sdk-statement signs with Sr25519. Returns `true` on success, `false` on rejection or transport error (errors are caught and logged, not thrown). Throws `StatementConnectionError` if not connected. Throws `StatementDataTooLargeError` if encoded data exceeds 512 bytes.

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
}): Promise<ReceivedStatement<T>[]>
```

Query existing statements from the store. Only available when the transport supports queries (RPC mode). In host mode, the subscription replays existing statements automatically, so this returns an empty array. Throws `StatementConnectionError` if not connected.

---

```ts
isConnected(): boolean
```

Whether the client is connected and ready to publish/subscribe.

---

```ts
getPublicKeyHex(): string
```

Get the signer's public key as a hex string with `0x` prefix. Only returns a value in local mode. Returns empty string if not connected or in host mode.

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
function serializeTopicFilter(filter: TopicFilter): SdkTopicFilter
```

Serialize a `TopicFilter` into the format expected by `@novasamatech/sdk-statement`. Converts `TopicHash` arrays to hex-string arrays.

---

## Data Functions

```ts
import { encodeData, decodeData, toHex, fromHex } from "@polkadot-apps/statement-store";
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
import { createTransport } from "@polkadot-apps/statement-store";
```

### createTransport

```ts
async function createTransport(config: { endpoint?: string }): Promise<StatementTransport>
```

Create a statement store transport. Strategy:
1. Try the Host API via `@polkadot-apps/host` -- uses the container's native statement store protocol (binary, not JSON-RPC). Returns a `HostTransport`.
2. Fall back to a direct WebSocket connection using `@polkadot-api/substrate-client` with `@novasamatech/sdk-statement`. Returns an `RpcTransport`.
3. Throw `StatementConnectionError` if neither works.

The `endpoint` defaults to `DEFAULT_BULLETIN_ENDPOINT` from `@polkadot-apps/host`.

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

Encoding or decoding failed. Corrupt data or invalid JSON.

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

Failed to connect to the transport. WebSocket unreachable or Host API unavailable.

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

### Re-exports from @novasamatech/sdk-statement

```ts
import type {
  Statement,
  SignedStatement,
  UnsignedStatement,
  Proof,
  SubmitResult,
  SdkTopicFilter,
} from "@polkadot-apps/statement-store";
```

#### Statement

The core statement type from `@novasamatech/sdk-statement`. Represents a statement on the network. Key fields:

```ts
interface Statement {
  expiry?: bigint;
  topics: `0x${string}`[];
  channel?: `0x${string}`;
  decryptionKey?: `0x${string}`;
  data?: Uint8Array;
  proof?: Proof;
}
```

#### SignedStatement

A statement that has been signed and includes a `proof` field.

#### UnsignedStatement

A statement without a proof, before signing.

#### Proof

The authenticity proof attached to a signed statement:

```ts
interface Proof {
  type: "sr25519";
  value: {
    signature: `0x${string}`;
    signer: `0x${string}`;
  };
}
```

#### SubmitResult

Result from submitting a statement:

```ts
interface SubmitResult {
  status: "new" | "known" | "rejected";
  reason?: string;
}
```

#### SdkTopicFilter

Re-exported as `SdkTopicFilter` (aliased from `TopicFilter` in sdk-statement to avoid name collision):

```ts
type SdkTopicFilter = "any" | { matchAll: string[] } | { matchAny: string[] }
```

The serialized form with hex-encoded topic strings, used by the transport layer.

### Package-specific Types

```ts
import type {
  TopicHash,
  ChannelHash,
  TopicFilter,
  ConnectionCredentials,
  StatementStoreConfig,
  PublishOptions,
  ReceivedStatement,
  StatementSigner,
  StatementSignerWithKey,
  StatementTransport,
  Unsubscribable,
} from "@polkadot-apps/statement-store";
```

#### TopicHash

```ts
type TopicHash = Uint8Array & { readonly __brand: "TopicHash" }
```

A 32-byte blake2b-256 hash used as a statement topic. Create with `createTopic()`.

#### ChannelHash

```ts
type ChannelHash = Uint8Array & { readonly __brand: "ChannelHash" }
```

A 32-byte blake2b-256 hash used as a channel identifier. Create with `createChannel()`.

#### TopicFilter

```ts
type TopicFilter = "any" | { matchAll: TopicHash[] } | { matchAny: TopicHash[] }
```

Filter for statement subscriptions and queries. `"any"` matches all; `matchAll` requires all topics present; `matchAny` requires at least one.

#### ConnectionCredentials

```ts
type ConnectionCredentials =
  | { mode: "host"; accountId: [string, number] }
  | { mode: "local"; signer: StatementSignerWithKey };
```

Credentials for connecting to the statement store:
- **Host mode**: Inside a container. `accountId` is a `[ss58Address, chainPrefix]` tuple. Proof creation is delegated to the host API.
- **Local mode**: Outside a container. `signer` provides an Sr25519 key pair for signing statements locally.

#### StatementStoreConfig

```ts
interface StatementStoreConfig {
  appName: string;
  endpoint?: string;
  pollIntervalMs?: number;    // default: 10_000
  defaultTtlSeconds?: number; // default: 30
  enablePolling?: boolean;    // default: true
  transport?: StatementTransport;  // BYOD transport (skips auto-detection)
}
```

Configuration for `StatementStoreClient`. When `transport` is provided, auto-detection is skipped.

#### PublishOptions

```ts
interface PublishOptions {
  channel?: string;
  topic2?: string;
  ttlSeconds?: number;
  decryptionKey?: Uint8Array;
}
```

Options for publishing a single statement. `channel` and `topic2` are human-readable strings (hashed internally with blake2b).

#### ReceivedStatement\<T\>

```ts
interface ReceivedStatement<T = unknown> {
  data: T;
  signerHex?: string;
  channelHex?: string;
  topics: string[];
  expiry?: bigint;
  raw: Statement;
}
```

A received statement with typed data and metadata:
- `data` -- the parsed JSON payload.
- `signerHex` -- signer's public key as a hex string (extracted from `proof.value.signer`), if present.
- `channelHex` -- channel as a hex string, if present.
- `topics` -- array of topic hex strings.
- `expiry` -- combined value (upper 32 bits = timestamp, lower 32 bits = sequence number).
- `raw` -- the full `Statement` from `@novasamatech/sdk-statement`.

#### StatementSigner

```ts
type StatementSigner = (message: Uint8Array) => Uint8Array | Promise<Uint8Array>
```

A function that signs a message with an Sr25519 key. Takes signature material bytes, returns a 64-byte signature.

#### StatementSignerWithKey

```ts
interface StatementSignerWithKey {
  publicKey: Uint8Array;  // 32-byte Sr25519 public key
  sign: StatementSigner;
}
```

An Sr25519 signer with its associated public key. Used in `ConnectionCredentials` for local mode.

#### StatementTransport

```ts
interface StatementTransport {
  subscribe(
    filter: SdkTopicFilter,
    onStatements: (statements: Statement[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribable;

  signAndSubmit(
    statement: Statement,
    credentials: ConnectionCredentials,
  ): Promise<void>;

  query?(filter: SdkTopicFilter): Promise<Statement[]>;

  destroy(): void;
}
```

Low-level transport interface for statement store communication:
- `subscribe` -- subscribe to statements matching a topic filter. Receives batches of `Statement[]`.
- `signAndSubmit` -- sign and submit a statement. Host mode delegates proof creation to the host; local mode signs with `getStatementSigner` from sdk-statement.
- `query` -- (optional) query existing statements. Only available on `RpcTransport`. When absent, the client skips polling.
- `destroy` -- release all resources.

#### Unsubscribable

```ts
interface Unsubscribable {
  unsubscribe: () => void;
}
```

Handle returned by subscription methods.

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
