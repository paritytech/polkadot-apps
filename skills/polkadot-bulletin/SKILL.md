---
name: polkadot-bulletin
description: >
  Use when uploading or retrieving data on the Polkadot Bulletin Chain, working with
  CID-based decentralized storage, IPFS gateway access, or the BulletinClient SDK.
  Covers upload, batch upload, fetch, query, CID computation, and gateway utilities.
---

# Polkadot Bulletin Chain SDK

`@polkadot-apps/bulletin` is a TypeScript SDK for uploading and retrieving data on the Polkadot Bulletin Chain -- a purpose-built parachain for decentralized data storage. Data is content-addressed using CIDv1 (blake2b-256 hash, raw codec) and retrievable via IPFS gateways.

## Key Concepts

- **Content-addressed storage**: Data is identified by its CID (Content Identifier), computed deterministically from the bytes via blake2b-256.
- **Two upload paths**: Inside a host container (Polkadot Desktop/Mobile), uploads go through the host preimage API automatically. Standalone, a `PolkadotSigner` or dev signer is used to submit a `TransactionStorage.store` extrinsic.
- **Two query paths**: Inside a host container, queries use the host preimage lookup (with caching). Standalone, data is fetched directly from an IPFS gateway.
- **Environments**: `"polkadot"`, `"kusama"`, `"paseo"` -- currently only `"paseo"` has a live gateway.

## Quick Start: Upload and Fetch

```ts
import { BulletinClient } from "@polkadot-apps/bulletin";

// Create a client for the Paseo test network
const bulletin = await BulletinClient.create("paseo");

// Upload data (MUST be Uint8Array, not a string)
const data = new TextEncoder().encode(JSON.stringify({ title: "Hello Bulletin" }));
const result = await bulletin.upload(data);
console.log("CID:", result.cid);

// Fetch it back as JSON
const content = await bulletin.fetchJson<{ title: string }>(result.cid);
console.log(content.title); // "Hello Bulletin"
```

> **WARNING**: `upload()` expects `Uint8Array`, not strings. Always convert with `new TextEncoder().encode(...)`. Passing a string will cause a type error or unexpected behavior.

## BulletinClient

The `BulletinClient` class bundles a typed Bulletin API and IPFS gateway URL so you do not need to pass them on every call. Both upload and query paths auto-resolve based on the runtime environment.

### Creating a Client

```ts
import { BulletinClient } from "@polkadot-apps/bulletin";

// From an environment name (resolves API via chain-client, gateway from known list)
const client = await BulletinClient.create("paseo");

// From explicit API and gateway (custom setups, testing)
import { getGateway } from "@polkadot-apps/bulletin";
const custom = BulletinClient.from(myApi, "https://my-gateway.example/ipfs/");
```

### Uploading Data

```ts
// Basic upload -- signer is auto-resolved
const data = new TextEncoder().encode("raw file content");
const result = await client.upload(data);
// result.cid -- CIDv1 string
// result.kind -- "transaction" | "preimage"
// result.gatewayUrl -- present because client has gateway

// With explicit signer and options
import type { PolkadotSigner } from "polkadot-api";
const result2 = await client.upload(data, mySigner, {
  waitFor: "finalized",
  timeoutMs: 60_000,
  onStatus: (status) => console.log(status),
});
```

### Batch Upload

```ts
const items = [
  { data: new TextEncoder().encode("file A"), label: "a.txt" },
  { data: new TextEncoder().encode("file B"), label: "b.txt" },
];

const results = await client.batchUpload(items, undefined, {
  onProgress: (completed, total, current) => {
    console.log(`${completed}/${total}: ${current.label} ${current.success ? "OK" : "FAILED"}`);
  },
});

// Individual failures do NOT abort the batch
for (const r of results) {
  if (r.success) {
    console.log(`${r.label}: ${r.cid}`);
  } else {
    console.error(`${r.label}: ${r.error}`);
  }
}
```

### Fetching Data

```ts
// Raw bytes
const bytes = await client.fetchBytes(cid);

// Parsed JSON (generic type parameter)
const metadata = await client.fetchJson<{ name: string; size: number }>(cid);

// With options
const bytes2 = await client.fetchBytes(cid, {
  timeoutMs: 10_000,
  lookupTimeoutMs: 5_000,  // host path only
});
```

### Utility Methods

```ts
// Compute CID without uploading (static, no instance needed)
const cid = BulletinClient.computeCid(new TextEncoder().encode("data"));

// Reconstruct CID from on-chain hex hash (static, no instance needed)
const cidFromHash = BulletinClient.hashToCid("0x1a2b3c...");

// Check if CID exists on the gateway
const exists = await client.cidExists(cid);

// Build gateway URL
const url = client.gatewayUrl(cid);
// e.g., "https://paseo-ipfs.polkadot.io/ipfs/bafk..."
```

## Standalone Functions

For advanced use cases where you manage the API and gateway yourself, all operations are available as standalone functions.

### Upload Functions

```ts
import { upload, batchUpload } from "@polkadot-apps/bulletin";
import type { BulletinApi } from "@polkadot-apps/bulletin";

// Single upload
const result = await upload(api, new TextEncoder().encode("data"), signer, {
  gateway: "https://paseo-ipfs.polkadot.io/ipfs/",
  waitFor: "finalized",
  timeoutMs: 300_000,
  onStatus: (status) => console.log(status),
});

// Batch upload
const results = await batchUpload(api, items, signer, {
  gateway: "https://paseo-ipfs.polkadot.io/ipfs/",
  onProgress: (completed, total, current) => { /* ... */ },
});
```

### CID Functions

```ts
import { computeCid, cidToPreimageKey, hashToCid, HashAlgorithm, CidCodec } from "@polkadot-apps/bulletin";

const cid = computeCid(new TextEncoder().encode("hello"));
const hexKey = cidToPreimageKey(cid); // "0x..." (64-char hex)
const reconstructed = hashToCid(hexKey); // back to CID from on-chain hash

// SHA2-256 content (e.g., stored via bulletin-deploy)
const sha256Cid = hashToCid(hexKey, HashAlgorithm.Sha2_256);
// DAG-PB manifest
const manifestCid = hashToCid(hexKey, HashAlgorithm.Blake2b256, CidCodec.DagPb);
```

### Gateway Functions

```ts
import { getGateway, gatewayUrl, cidExists, fetchBytes, fetchJson } from "@polkadot-apps/bulletin";

const gw = getGateway("paseo"); // "https://paseo-ipfs.polkadot.io/ipfs/"
const url = gatewayUrl(cid, gw); // full URL

const exists = await cidExists(cid, gw);
const bytes = await fetchBytes(cid, gw, { timeoutMs: 10_000 });
const json = await fetchJson<MyType>(cid, gw);
```

### Query Functions (Auto-Resolving)

```ts
import { queryBytes, queryJson, resolveQueryStrategy } from "@polkadot-apps/bulletin";

// Auto-resolve query path and fetch
const bytes = await queryBytes(cid, gateway);
const data = await queryJson<MyType>(cid, gateway, { timeoutMs: 15_000 });

// Pre-resolve strategy for reuse across calls
const strategy = await resolveQueryStrategy();
// strategy.kind is "host-lookup" or "gateway"
```

### Upload Strategy Resolution

```ts
import { resolveUploadStrategy } from "@polkadot-apps/bulletin";

const strategy = await resolveUploadStrategy(); // auto-detect
// strategy.kind is "preimage" or "signer"

const explicit = await resolveUploadStrategy(mySigner); // always "signer"
```

## Upload Result Handling

Results are discriminated unions -- use `result.kind` to narrow the type:

```ts
const result = await client.upload(data);

if (result.kind === "transaction") {
  console.log("Block hash:", result.blockHash);
} else {
  console.log("Preimage key:", result.preimageKey);
}

// Common fields: result.cid, result.gatewayUrl (if gateway was provided)
```

Batch results add `success` and `label` fields:

```ts
for (const r of results) {
  if (!r.success) {
    console.error(r.label, r.error);
    continue;
  }
  if (r.kind === "transaction") {
    console.log(r.label, r.blockHash);
  } else {
    console.log(r.label, r.preimageKey);
  }
}
```

## Common Mistakes

1. **Passing a string to upload instead of Uint8Array**:
   ```ts
   // WRONG -- will not compile or will behave unexpectedly
   await client.upload("hello");

   // CORRECT
   await client.upload(new TextEncoder().encode("hello"));
   ```

2. **Forgetting that only `"paseo"` has a live gateway**:
   ```ts
   // THROWS: "Bulletin gateway for 'polkadot' is not yet available"
   getGateway("polkadot");
   ```

3. **Not handling batch failures**: `batchUpload` does NOT throw on individual item failures. Always check `result.success` for each item.

4. **Omitting signer in standalone (non-host) mode**: When no signer is passed and you are not inside a host container, the SDK falls back to Alice's dev signer. This only works on test networks. For production, always provide a signer.

## Reference

See [references/bulletin-api.md](references/bulletin-api.md) for full type signatures and API surface.
