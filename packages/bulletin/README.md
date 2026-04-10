# @polkadot-apps/bulletin

TypeScript SDK for uploading and retrieving data on the [Bulletin Chain](https://wiki.polkadot.network/docs/learn-guides-bulletin-chain) — a Polkadot system parachain designed for on-chain data storage with IPFS-compatible content addressing.

## Install

```bash
npm install @polkadot-apps/bulletin
# or
pnpm add @polkadot-apps/bulletin
```

### Peer dependencies

- `polkadot-api` (required)
- `@novasamatech/product-sdk` (optional — needed only when running inside a host container like Polkadot Desktop or the Polkadot mobile app)

## Quick start

```ts
import { BulletinClient } from "@polkadot-apps/bulletin";

const bulletin = await BulletinClient.create("paseo");

// Upload — signer is auto-resolved (see "Signer resolution" below)
const result = await bulletin.upload(new TextEncoder().encode("hello world"));
console.log(result.cid); // CIDv1 string

// Read back
const data = await bulletin.fetchBytes(result.cid);
```

## Signer resolution

When no signer is passed to `upload()` or `batchUpload()`, the SDK auto-detects the environment and picks the best strategy:

| Environment | Strategy | What happens |
|---|---|---|
| Inside host container (Polkadot Desktop / Mobile) | Host preimage API | The host app signs and submits the transaction automatically — no user interaction. |
| Standalone (browser, Node, scripts) | Dev signer (Alice) | Uses the well-known Substrate dev account, pre-funded on test chains. |
| Explicit signer provided | Direct transaction | Builds and signs a `TransactionStorage.store` extrinsic with the given signer. |

You can always pass an explicit signer to override auto-resolution:

```ts
import { createDevSigner } from "@polkadot-apps/tx";

const alice = createDevSigner("Alice");
const result = await bulletin.upload(data, alice);
```

## Query resolution

When fetching data with `fetchBytes()`, `fetchJson()`, or their standalone equivalents (`queryBytes`, `queryJson`), the SDK auto-detects the environment:

| Environment | Strategy | What happens |
|---|---|---|
| Inside host container (Polkadot Desktop / Mobile) | Host preimage lookup | The host checks its local cache first, then polls the IPFS gateway with automatic retry. Data uploaded by *any* signer is available — the lookup is upload-path-agnostic. |
| Standalone (browser, Node, scripts) | Direct IPFS gateway | Standard HTTP fetch from the configured IPFS gateway URL. |

The query path is transparent — `bulletin.fetchBytes(cid)` works identically in both environments, but benefits from host-managed caching when available.

## API

### `BulletinClient`

High-level client that bundles a typed Bulletin API and an IPFS gateway URL.

#### `BulletinClient.create(env)`

Create a client for an environment. Resolves the chain connection and gateway automatically.

```ts
const bulletin = await BulletinClient.create("paseo");
```

**Parameters:**
- `env` — `"paseo"` | `"polkadot"` | `"kusama"`

#### `BulletinClient.from(api, gateway)`

Create a client from an explicit API instance and gateway URL. Useful for custom setups and testing.

```ts
import { bulletin as bulletinDescriptor } from "@polkadot-apps/descriptors/bulletin";

const api = client.getTypedApi(bulletinDescriptor);
const bulletin = BulletinClient.from(api, "https://paseo-ipfs.polkadot.io/ipfs/");
```

#### `bulletin.upload(data, signer?, options?)`

Upload data to the Bulletin Chain. Returns a discriminated union — use `result.kind` to determine the upload path.

```ts
const result = await bulletin.upload(fileBytes);

if (result.kind === "transaction") {
    console.log("Block hash:", result.blockHash);
} else {
    console.log("Preimage key:", result.preimageKey);
}
console.log("CID:", result.cid);
console.log("Gateway URL:", result.gatewayUrl);
```

**Parameters:**
- `data` — `Uint8Array` of raw bytes to store
- `signer` — optional `PolkadotSigner`; auto-resolved when omitted
- `options` — optional `UploadOptions`:
  - `waitFor` — `"best-block"` (default) or `"finalized"`
  - `timeoutMs` — timeout in ms (default: 300,000)
  - `onStatus` — lifecycle callback for UI progress

#### `bulletin.batchUpload(items, signer?, options?)`

Upload multiple items sequentially. The Bulletin Chain requires sequential submission for nonce ordering. Individual failures are captured per-item — the batch does not abort.

```ts
const items = [
    { data: new TextEncoder().encode("doc-1"), label: "document-1" },
    { data: new TextEncoder().encode("doc-2"), label: "document-2" },
];

const results = await bulletin.batchUpload(items, undefined, {
    onProgress: (completed, total, current) => {
        console.log(`${completed}/${total}: ${current.label} — ${current.success ? "ok" : current.error}`);
    },
});
```

**Parameters:**
- `items` — array of `{ data: Uint8Array, label: string }`
- `signer` — optional `PolkadotSigner`; auto-resolved when omitted
- `options` — optional `BatchUploadOptions` (extends `UploadOptions`):
  - `onProgress(completed, total, current)` — called after each item

#### `bulletin.fetchBytes(cid, options?)`

Fetch raw bytes by CID. Auto-resolves the query path (see "Query resolution" above).

```ts
const bytes = await bulletin.fetchBytes("bafk...");

// With host lookup timeout override:
const bytes2 = await bulletin.fetchBytes("bafk...", { lookupTimeoutMs: 10_000 });
```

**Parameters:**
- `cid` — CIDv1 string
- `options` — optional `QueryOptions`:
  - `timeoutMs` — timeout for gateway fetch in ms (default: 30,000)
  - `lookupTimeoutMs` — timeout for host preimage lookup in ms (default: 30,000; host path only)

#### `bulletin.fetchJson<T>(cid, options?)`

Fetch and parse JSON by CID. Auto-resolves the query path (same as `fetchBytes`).

```ts
const metadata = await bulletin.fetchJson<{ name: string }>("bafk...");
```

#### `bulletin.checkAuthorization(address)`

Check whether an account is authorized to store data. Use as a pre-flight check before `upload()` to show "not authorized" or "insufficient quota" instead of letting the transaction fail.

```ts
const auth = await bulletin.checkAuthorization(myAddress);
if (!auth.authorized) {
    console.error("Account is not authorized for bulletin storage");
} else if (auth.remainingBytes < BigInt(fileBytes.length)) {
    console.error(`Insufficient quota: ${auth.remainingBytes} bytes remaining`);
}
```

**Parameters:**
- `address` — SS58-encoded account address

**Returns:** `AuthorizationStatus` with `authorized`, `remainingTransactions`, `remainingBytes`, `expiration`.

#### `bulletin.cidExists(cid)`

Check if a CID exists on the gateway (HEAD request). Returns `false` on any error or timeout.

#### `bulletin.gatewayUrl(cid)`

Build the full gateway URL for a CID.

#### `BulletinClient.computeCid(data)`

Compute the CID for data without uploading. Static method — no client instance needed.

```ts
const cid = BulletinClient.computeCid(new TextEncoder().encode("hello"));
```

#### `BulletinClient.hashToCid(hexHash, hashCode?, codec?)`

Reconstruct a CID from a `0x`-prefixed hex hash stored on-chain. Static method — no client instance needed. Supports all hash algorithms and codecs used by the Bulletin Chain.

```ts
import { HashAlgorithm, CidCodec } from "@polkadot-apps/bulletin";

// Default (blake2b-256, raw)
const cid = BulletinClient.hashToCid("0x1a2b3c...");

// SHA2-256 content from bulletin-deploy
const cid2 = BulletinClient.hashToCid("0x1a2b3c...", HashAlgorithm.Sha2_256);

const url = bulletin.gatewayUrl(cid);
```

### Standalone functions

The same operations are available as standalone functions for lower-level usage:

```ts
import {
    upload, batchUpload, checkAuthorization,
    computeCid, cidToPreimageKey, hashToCid,
    HashAlgorithm, CidCodec,
    fetchBytes, fetchJson, cidExists,
    queryBytes, queryJson, resolveQueryStrategy,
    getGateway, gatewayUrl,
} from "@polkadot-apps/bulletin";
```

#### `upload(api, data, signer?, options?)`

Upload data using an explicit `BulletinApi` instance.

#### `batchUpload(api, items, signer?, options?)`

Batch upload using an explicit `BulletinApi` instance.

#### `checkAuthorization(api, address)`

Check whether an account is authorized to store data. Standalone equivalent of `bulletin.checkAuthorization()`.

```ts
import { checkAuthorization } from "@polkadot-apps/bulletin";

const auth = await checkAuthorization(api, address);
```

#### `computeCid(data)`

Compute a CIDv1 (blake2b-256, raw codec) for arbitrary bytes. Deterministic — same input always produces the same CID.

#### `getGateway(env)`

Get the IPFS gateway URL for an environment.

#### `resolveUploadStrategy(signer?)`

Resolve which upload strategy will be used. Returns a discriminated union:

```ts
import { resolveUploadStrategy } from "@polkadot-apps/bulletin";

const strategy = await resolveUploadStrategy();
console.log(strategy.kind); // "preimage" or "signer"
```

#### `queryBytes(cid, gateway, options?)`

Fetch raw bytes with auto-resolved query strategy. Equivalent to `BulletinClient.fetchBytes` but as a standalone function requiring an explicit gateway URL.

#### `queryJson<T>(cid, gateway, options?)`

Fetch and parse JSON with auto-resolved query strategy.

#### `cidToPreimageKey(cid)`

Extract the content hash digest from a CIDv1 string and return it as a `0x`-prefixed hex string — the preimage key format used by the host API. Accepts any hash algorithm supported by the Bulletin Chain (blake2b-256, sha2-256, keccak-256).

```ts
import { computeCid, cidToPreimageKey } from "@polkadot-apps/bulletin";

const cid = computeCid(data);
const key = cidToPreimageKey(cid); // "0x1a2b3c..."
```

#### `hashToCid(hexHash, hashCode?, codec?)`

Reconstruct a CIDv1 from a `0x`-prefixed hex hash — the reverse of `cidToPreimageKey`. Use this when you have on-chain hashes and need to build IPFS gateway URLs.

The Bulletin Chain supports multiple hash algorithms and codecs — pass the values that match the on-chain `TransactionInfo` to get the correct CID. Defaults to blake2b-256 + raw (matching `computeCid`).

```ts
import { hashToCid, HashAlgorithm, CidCodec, gatewayUrl, getGateway } from "@polkadot-apps/bulletin";

// Default (blake2b-256, raw) — matches computeCid output
const cid = hashToCid(onChainHash);

// SHA2-256 content stored via bulletin-deploy
const cid2 = hashToCid(onChainHash, HashAlgorithm.Sha2_256);

// DAG-PB manifest with blake2b-256
const cid3 = hashToCid(manifestHash, HashAlgorithm.Blake2b256, CidCodec.DagPb);

const url = gatewayUrl(cid, getGateway("paseo"));
```

#### `HashAlgorithm`

Hash algorithms supported by the Bulletin Chain (multihash codes):

| Constant | Value | Description |
|---|---|---|
| `HashAlgorithm.Blake2b256` | `0xb220` | Default for polkadot-apps and chain SDK |
| `HashAlgorithm.Sha2_256` | `0x12` | Default for bulletin-deploy |
| `HashAlgorithm.Keccak256` | `0x1b` | Ethereum compatibility |

#### `CidCodec`

CID codecs supported by the Bulletin Chain (multicodec codes):

| Constant | Value | Description |
|---|---|---|
| `CidCodec.Raw` | `0x55` | Raw binary — default for single-chunk data |
| `CidCodec.DagPb` | `0x70` | DAG-PB — multi-chunk manifests / directories |
| `CidCodec.DagCbor` | `0x71` | DAG-CBOR — alternative DAG encoding |

#### `resolveQueryStrategy()`

Resolve which query strategy will be used. Returns a discriminated union:

```ts
import { resolveQueryStrategy } from "@polkadot-apps/bulletin";

const strategy = await resolveQueryStrategy();
console.log(strategy.kind); // "host-lookup" or "gateway"
```

## Types

### `AuthorizationStatus`

```ts
interface AuthorizationStatus {
    authorized: boolean;           // Whether an authorization entry exists
    remainingTransactions: number; // Remaining tx slots (0 if not authorized)
    remainingBytes: bigint;        // Remaining bytes (0n if not authorized)
    expiration: number;            // Expiration block number (0 if not authorized)
}
```

### `UploadResult`

Discriminated union on `kind`:

```ts
type UploadResult =
    | { kind: "transaction"; cid: string; blockHash: string; gatewayUrl?: string }
    | { kind: "preimage"; cid: string; preimageKey: string; gatewayUrl?: string };
```

### `BatchUploadResult`

Discriminated union on `kind` and `success`:

```ts
type BatchUploadResult =
    | { kind: "transaction"; success: true; label: string; cid: string; blockHash: string; gatewayUrl?: string }
    | { kind: "preimage"; success: true; label: string; cid: string; preimageKey: string; gatewayUrl?: string }
    | { kind: "transaction" | "preimage"; success: false; label: string; cid: string; error: string; gatewayUrl?: string };
```

### `UploadStrategy`

```ts
type UploadStrategy =
    | { kind: "preimage"; submit: (data: Uint8Array) => Promise<string> }
    | { kind: "signer"; signer: PolkadotSigner };
```

### `Environment`

```ts
type Environment = "polkadot" | "kusama" | "paseo";
```

### `QueryStrategy`

```ts
type QueryStrategy =
    | { kind: "host-lookup"; lookup: (cid: string, timeoutMs?: number) => Promise<Uint8Array> }
    | { kind: "gateway" };
```

### `QueryOptions`

```ts
interface QueryOptions extends FetchOptions {
    /** Timeout for host preimage lookup in ms (default: 30,000). Host path only. */
    lookupTimeoutMs?: number;
}
```

## CID format

All CIDs are **CIDv1** with:
- Hash function: blake2b-256
- Codec: raw
- Base encoding: base32-lower (starts with `b`)

This matches the Bulletin Chain's on-chain CID computation, ensuring the locally computed CID always matches what the chain stores.

## License

Apache-2.0
