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
import { bulletin as bulletinDescriptor } from "@polkadot-apps/descriptors";

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

Fetch raw bytes from the IPFS gateway by CID.

```ts
const bytes = await bulletin.fetchBytes("bafk...");
```

#### `bulletin.fetchJson<T>(cid, options?)`

Fetch and parse JSON from the IPFS gateway by CID.

```ts
const metadata = await bulletin.fetchJson<{ name: string }>("bafk...");
```

#### `bulletin.cidExists(cid)`

Check if a CID exists on the gateway (HEAD request). Returns `false` on any error or timeout.

#### `bulletin.gatewayUrl(cid)`

Build the full gateway URL for a CID.

#### `BulletinClient.computeCid(data)`

Compute the CID for data without uploading. Static method — no client instance needed.

```ts
const cid = BulletinClient.computeCid(new TextEncoder().encode("hello"));
```

### Standalone functions

The same operations are available as standalone functions for lower-level usage:

```ts
import { upload, batchUpload, computeCid, fetchBytes, fetchJson, cidExists, getGateway, gatewayUrl } from "@polkadot-apps/bulletin";
```

#### `upload(api, data, signer?, options?)`

Upload data using an explicit `BulletinApi` instance.

#### `batchUpload(api, items, signer?, options?)`

Batch upload using an explicit `BulletinApi` instance.

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

## Types

### `UploadResult`

Discriminated union on `kind`:

```ts
type UploadResult =
    | { kind: "transaction"; cid: string; blockHash: string; gatewayUrl?: string }
    | { kind: "preimage"; cid: string; preimageKey: string; gatewayUrl?: string };
```

### `BatchUploadResult`

```ts
interface BatchUploadResult {
    label: string;
    cid: string;
    success: boolean;
    blockHash?: string;    // present on successful transaction uploads
    preimageKey?: string;  // present on successful preimage uploads
    gatewayUrl?: string;
    error?: string;        // present when success is false
}
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

## CID format

All CIDs are **CIDv1** with:
- Hash function: blake2b-256
- Codec: raw
- Base encoding: base32-lower (starts with `b`)

This matches the Bulletin Chain's on-chain CID computation, ensuring the locally computed CID always matches what the chain stores.

## License

Apache-2.0
