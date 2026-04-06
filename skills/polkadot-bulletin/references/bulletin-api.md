# Bulletin API Reference

Package: `@polkadot-apps/bulletin`

Source: `packages/bulletin/src/`

---

## BulletinClient Class

Ergonomic entry point that bundles a typed Bulletin API and IPFS gateway URL.

### Properties

```ts
readonly api: BulletinApi;
readonly gateway: string;
```

### Static Methods

#### `BulletinClient.create(env)`

Create from an environment name. Resolves API via `@polkadot-apps/chain-client`, gateway from known list.

```ts
static async create(env: Environment): Promise<BulletinClient>
```

```ts
const client = await BulletinClient.create("paseo");
```

#### `BulletinClient.from(api, gateway)`

Create from an explicit API and gateway (custom setups, testing).

```ts
static from(api: BulletinApi, gateway: string): BulletinClient
```

```ts
const client = BulletinClient.from(myApi, "https://my-gw.example/ipfs/");
```

#### `BulletinClient.computeCid(data)`

Compute CID without uploading. Static -- no instance needed.

```ts
static computeCid(data: Uint8Array): string
```

```ts
const cid = BulletinClient.computeCid(new TextEncoder().encode("data"));
```

#### `BulletinClient.hashToCid(hexHash, hashCode?, codec?)`

Reconstruct a CID from an on-chain hex hash. Static -- no instance needed. Supports all Bulletin Chain hash algorithms and codecs.

```ts
static hashToCid(hexHash: `0x${string}`, hashCode?: HashAlgorithm, codec?: CidCodec): string
```

```ts
import { HashAlgorithm } from "@polkadot-apps/bulletin";

const cid = BulletinClient.hashToCid("0x1a2b3c...");
const sha256Cid = BulletinClient.hashToCid("0x1a2b3c...", HashAlgorithm.Sha2_256);
const url = client.gatewayUrl(cid); // IPFS gateway link
```

### Instance Methods

#### `client.upload(data, signer?, options?)`

Upload data to the Bulletin Chain. Signer is auto-resolved when omitted.

```ts
async upload(
    data: Uint8Array,
    signer?: PolkadotSigner,
    options?: Omit<UploadOptions, "gateway">,
): Promise<UploadResult>
```

```ts
const result = await client.upload(new TextEncoder().encode("hello"));
// result.cid, result.kind, result.gatewayUrl
```

#### `client.batchUpload(items, signer?, options?)`

Upload multiple items sequentially. Individual failures do not abort the batch.

```ts
async batchUpload(
    items: BatchUploadItem[],
    signer?: PolkadotSigner,
    options?: Omit<BatchUploadOptions, "gateway">,
): Promise<BatchUploadResult[]>
```

```ts
const results = await client.batchUpload([
  { data: new TextEncoder().encode("a"), label: "file-a" },
  { data: new TextEncoder().encode("b"), label: "file-b" },
]);
```

#### `client.checkAuthorization(address)`

Pre-flight check: query whether an account is authorized to store data. Use before `upload()` to provide clear UX.

```ts
async checkAuthorization(address: string): Promise<AuthorizationStatus>
```

```ts
const auth = await client.checkAuthorization(myAddress);
if (!auth.authorized) { /* not authorized */ }
if (auth.remainingBytes < BigInt(fileBytes.length)) { /* insufficient quota */ }
// auth.remainingTransactions, auth.remainingBytes, auth.expiration
```

#### `client.fetchBytes(cid, options?)`

Fetch raw bytes by CID. Auto-resolves query path (host lookup or gateway).

```ts
async fetchBytes(cid: string, options?: QueryOptions): Promise<Uint8Array>
```

```ts
const bytes = await client.fetchBytes("bafk...");
```

#### `client.fetchJson<T>(cid, options?)`

Fetch and parse JSON by CID.

```ts
async fetchJson<T>(cid: string, options?: QueryOptions): Promise<T>
```

```ts
const data = await client.fetchJson<{ name: string }>("bafk...");
```

#### `client.cidExists(cid)`

Check if a CID exists on the gateway (HEAD request).

```ts
async cidExists(cid: string): Promise<boolean>
```

#### `client.gatewayUrl(cid)`

Build the full gateway URL for a CID.

```ts
gatewayUrl(cid: string): string
```

---

## Standalone Functions

### Upload

#### `upload(api, data, signer?, options?)`

Upload data to the Bulletin Chain.

```ts
async function upload(
    api: BulletinApi,
    data: Uint8Array,
    signer?: PolkadotSigner,
    options?: UploadOptions,
): Promise<UploadResult>
```

- When `signer` is provided, submits a `TransactionStorage.store` transaction directly.
- When omitted, auto-resolves: host preimage API inside a container, Alice dev signer standalone.
- Computes CIDv1 (blake2b-256, raw codec) locally.

```ts
import { upload } from "@polkadot-apps/bulletin";

const result = await upload(api, new TextEncoder().encode("data"), signer, {
  gateway: "https://paseo-ipfs.polkadot.io/ipfs/",
  waitFor: "finalized",
  timeoutMs: 300_000,
  onStatus: (status) => console.log(status),
});
```

#### `batchUpload(api, items, signer?, options?)`

Upload multiple items sequentially. Bulletin Chain requires sequential submission (nonce ordering). Individual failures are captured -- the batch does not abort.

```ts
async function batchUpload(
    api: BulletinApi,
    items: BatchUploadItem[],
    signer?: PolkadotSigner,
    options?: BatchUploadOptions,
): Promise<BatchUploadResult[]>
```

```ts
import { batchUpload } from "@polkadot-apps/bulletin";

const results = await batchUpload(api, [
  { data: new TextEncoder().encode("a"), label: "file-a" },
  { data: new TextEncoder().encode("b"), label: "file-b" },
], signer, {
  gateway: "https://paseo-ipfs.polkadot.io/ipfs/",
  onProgress: (completed, total, current) => {
    console.log(`${completed}/${total}: ${current.label}`);
  },
});
```

### Authorization

#### `checkAuthorization(api, address)`

Pre-flight check: query whether an account is authorized to store data on the Bulletin Chain.

```ts
async function checkAuthorization(
  api: BulletinApi,
  address: string,
): Promise<AuthorizationStatus>
```

Returns `{ authorized, remainingTransactions, remainingBytes, expiration }`.

```ts
import { checkAuthorization } from "@polkadot-apps/bulletin";

const auth = await checkAuthorization(api, address);
```

### CID

#### `computeCid(data)`

Compute the CIDv1 (blake2b-256, raw codec) for arbitrary data. Deterministic.

```ts
function computeCid(data: Uint8Array): string
```

```ts
import { computeCid } from "@polkadot-apps/bulletin";

const cid = computeCid(new TextEncoder().encode("hello bulletin"));
// Returns base32-lower CIDv1 string like "bafk..."
```

#### `cidToPreimageKey(cid)`

Extract the content hash digest from a CIDv1 string and return it as a `0x`-prefixed hex string (the preimage key format used by the host API). Accepts any hash algorithm supported by the Bulletin Chain (blake2b-256, sha2-256, keccak-256).

```ts
function cidToPreimageKey(cid: string): `0x${string}`
```

- Throws if the CID is not CIDv1 or uses an unsupported hash algorithm.

```ts
import { cidToPreimageKey } from "@polkadot-apps/bulletin";

const key = cidToPreimageKey(cid);
// "0x" + 64 hex characters
```

#### `hashToCid(hexHash, hashCode?, codec?)`

Reconstruct a CIDv1 from a `0x`-prefixed 32-byte hex hash — the reverse of `cidToPreimageKey`. Use when converting on-chain hashes to IPFS gateway URLs.

Supports all hash algorithms and codecs used by the Bulletin Chain. Defaults to blake2b-256 + raw (matching `computeCid`).

```ts
function hashToCid(
  hexHash: `0x${string}`,
  hashCode?: HashAlgorithm,  // default: HashAlgorithm.Blake2b256
  codec?: CidCodec,          // default: CidCodec.Raw
): string
```

- Throws if `hexHash` is not exactly 66 characters, or if hash/codec is unsupported.

```ts
import { hashToCid, HashAlgorithm, CidCodec, gatewayUrl, getGateway } from "@polkadot-apps/bulletin";

// Default (blake2b-256, raw)
const cid = hashToCid("0x1a2b3c...");

// SHA2-256 content (e.g., from bulletin-deploy)
const cid2 = hashToCid("0x1a2b3c...", HashAlgorithm.Sha2_256);

// DAG-PB manifest
const cid3 = hashToCid(manifestHash, HashAlgorithm.Blake2b256, CidCodec.DagPb);

const url = gatewayUrl(cid, getGateway("paseo"));
```

#### `HashAlgorithm` / `CidCodec`

Constants for hash algorithms and codecs supported by the Bulletin Chain:

```ts
HashAlgorithm.Blake2b256  // 0xb220 — default
HashAlgorithm.Sha2_256    // 0x12   — bulletin-deploy default
HashAlgorithm.Keccak256   // 0x1b   — Ethereum compat

CidCodec.Raw     // 0x55 — single-chunk data (default)
CidCodec.DagPb   // 0x70 — multi-chunk manifests
CidCodec.DagCbor // 0x71 — DAG-CBOR encoding
```

### Gateway

#### `getGateway(env)`

Get the IPFS gateway URL for an environment. Throws if not yet available.

```ts
function getGateway(env: Environment): string
```

Currently available: `"paseo"` returns `"https://paseo-ipfs.polkadot.io/ipfs/"`. `"polkadot"` and `"kusama"` throw.

```ts
import { getGateway } from "@polkadot-apps/bulletin";

const gw = getGateway("paseo");
```

#### `gatewayUrl(cid, gateway)`

Build the full gateway URL for a CID.

```ts
function gatewayUrl(cid: string, gateway: string): string
```

```ts
import { gatewayUrl } from "@polkadot-apps/bulletin";

const url = gatewayUrl("bafkabc", "https://paseo-ipfs.polkadot.io/ipfs/");
// "https://paseo-ipfs.polkadot.io/ipfs/bafkabc"
```

#### `cidExists(cid, gateway, options?)`

Check if a CID exists on the gateway (HEAD request). Returns `false` on any error or timeout.

```ts
async function cidExists(
    cid: string,
    gateway: string,
    options?: FetchOptions,
): Promise<boolean>
```

```ts
import { cidExists } from "@polkadot-apps/bulletin";

const exists = await cidExists("bafk...", gw, { timeoutMs: 10_000 });
```

#### `fetchBytes(cid, gateway, options?)`

Fetch raw bytes from the gateway via HTTP.

```ts
async function fetchBytes(
    cid: string,
    gateway: string,
    options?: FetchOptions,
): Promise<Uint8Array>
```

- Throws if the gateway returns a non-OK status.
- Default timeout: 30,000ms.

```ts
import { fetchBytes } from "@polkadot-apps/bulletin";

const bytes = await fetchBytes("bafk...", gw, { timeoutMs: 10_000 });
```

#### `fetchJson<T>(cid, gateway, options?)`

Fetch and parse JSON from the gateway.

```ts
async function fetchJson<T>(
    cid: string,
    gateway: string,
    options?: FetchOptions,
): Promise<T>
```

```ts
import { fetchJson } from "@polkadot-apps/bulletin";

const data = await fetchJson<{ name: string }>("bafk...", gw);
```

### Query (Auto-Resolving)

#### `queryBytes(cid, gateway, options?)`

Fetch raw bytes for a CID, auto-resolving the query path (host lookup inside container, gateway standalone).

```ts
async function queryBytes(
    cid: string,
    gateway: string,
    options?: QueryOptions,
): Promise<Uint8Array>
```

```ts
import { queryBytes } from "@polkadot-apps/bulletin";

const bytes = await queryBytes("bafk...", "https://paseo-ipfs.polkadot.io/ipfs/");
```

#### `queryJson<T>(cid, gateway, options?)`

Fetch and parse JSON for a CID, auto-resolving the query path.

```ts
async function queryJson<T>(
    cid: string,
    gateway: string,
    options?: QueryOptions,
): Promise<T>
```

```ts
import { queryJson } from "@polkadot-apps/bulletin";

const data = await queryJson<{ key: string }>("bafk...", gw, { timeoutMs: 15_000 });
```

### Strategy Resolution

#### `resolveQueryStrategy()`

Determine the query strategy. Returns `"host-lookup"` inside a host container with SDK, `"gateway"` otherwise.

```ts
async function resolveQueryStrategy(): Promise<QueryStrategy>
```

```ts
import { resolveQueryStrategy } from "@polkadot-apps/bulletin";

const strategy = await resolveQueryStrategy();
if (strategy.kind === "host-lookup") {
  const bytes = await strategy.lookup(cid, 5000);
}
```

#### `resolveUploadStrategy(explicitSigner?)`

Determine the upload strategy. Resolution order:
1. Explicit signer provided -> `"signer"` with that signer.
2. Inside host container with SDK -> `"preimage"` (host signs automatically).
3. Standalone -> `"signer"` with Alice dev signer (test networks only).

```ts
async function resolveUploadStrategy(
    explicitSigner?: PolkadotSigner,
): Promise<UploadStrategy>
```

```ts
import { resolveUploadStrategy } from "@polkadot-apps/bulletin";

const strategy = await resolveUploadStrategy();
// strategy.kind is "preimage" or "signer"
```

---

## Types

### `BulletinApi`

Typed API for the Bulletin Chain, derived from PAPI descriptors.

```ts
type BulletinApi = TypedApi<typeof bulletin>
```

### `Environment`

```ts
type Environment = "polkadot" | "kusama" | "paseo"
```

### `UploadOptions`

```ts
interface UploadOptions {
    /** IPFS gateway base URL. If provided, result includes gatewayUrl. */
    gateway?: string;
    /** "best-block" (default) or "finalized". Transaction path only. */
    waitFor?: WaitFor;
    /** Timeout in ms. Default: 300_000 (5 min). Transaction path only. */
    timeoutMs?: number;
    /** Lifecycle status callback. Transaction path only. */
    onStatus?: (status: TxStatus) => void;
}
```

### `UploadResult`

Discriminated union on `kind`:

```ts
type UploadResult =
    | { kind: "transaction"; cid: string; blockHash: string; gatewayUrl?: string }
    | { kind: "preimage"; cid: string; preimageKey: string; gatewayUrl?: string }
```

### `BatchUploadItem`

```ts
interface BatchUploadItem {
    data: Uint8Array;
    label: string;
}
```

### `BatchUploadResult`

Discriminated union on `kind` and `success`:

```ts
type BatchUploadResult =
    | { kind: "transaction"; success: true; label: string; cid: string; blockHash: string; gatewayUrl?: string }
    | { kind: "preimage"; success: true; label: string; cid: string; preimageKey: string; gatewayUrl?: string }
    | { kind: "transaction" | "preimage"; success: false; label: string; cid: string; error: string; gatewayUrl?: string }
```

### `BatchUploadOptions`

```ts
interface BatchUploadOptions extends UploadOptions {
    /** Called after each item completes (success or failure). */
    onProgress?: (completed: number, total: number, current: BatchUploadResult) => void;
}
```

### `FetchOptions`

```ts
interface FetchOptions {
    /** Timeout in ms. Default: 30_000. */
    timeoutMs?: number;
}
```

### `QueryOptions`

```ts
interface QueryOptions extends FetchOptions {
    /** Timeout for host preimage lookup subscription in ms. Default: 30_000. */
    lookupTimeoutMs?: number;
}
```

### `UploadStrategy`

```ts
type UploadStrategy =
    | { kind: "preimage"; submit: (data: Uint8Array) => Promise<string> }
    | { kind: "signer"; signer: PolkadotSigner }
```

### `QueryStrategy`

```ts
type QueryStrategy =
    | { kind: "host-lookup"; lookup: (cid: string, timeoutMs?: number) => Promise<Uint8Array> }
    | { kind: "gateway" }
```
