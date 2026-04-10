# @polkadot-apps/tx

Transaction submission, lifecycle watching, and dev signers for Polkadot chains.

## Install

```bash
pnpm add @polkadot-apps/tx
```

**Peer dependency**: `polkadot-api` must be installed in your project.

```bash
pnpm add polkadot-api
```

## Quick start

```typescript
import { submitAndWatch, createDevSigner } from "@polkadot-apps/tx";

const signer = createDevSigner("Alice");

const result = await submitAndWatch(tx, signer, {
  waitFor: "finalized",
  onStatus: (status) => console.log(status),
});

console.log(result.txHash, result.ok);
```

## Batch transactions

Submit multiple transactions as a single atomic batch. Uses Substrate's `Utility.batch_all` by default (all-or-nothing).

```typescript
import { batchSubmitAndWatch } from "@polkadot-apps/tx";

const tx1 = api.tx.Balances.transfer_keep_alive({ dest: addr1, value: 1_000n });
const tx2 = api.tx.Balances.transfer_keep_alive({ dest: addr2, value: 2_000n });
const tx3 = api.tx.System.remark({ remark: Binary.fromText("hello") });

const result = await batchSubmitAndWatch([tx1, tx2, tx3], api, signer, {
  onStatus: (status) => console.log(status),
});
```

Three batch modes are available:

| Mode | Behavior |
|------|----------|
| `"batch_all"` (default) | Atomic. Reverts all calls if any single call fails. |
| `"batch"` | Best-effort. Stops at first failure but earlier successful calls are not reverted. |
| `"force_batch"` | Like `batch` but continues after failures (never aborts early). |

```typescript
// Non-atomic: some calls may fail while others succeed
const result = await batchSubmitAndWatch(calls, api, signer, { mode: "batch" });
```

> **WARNING:** In `"batch"` and `"force_batch"` modes, `result.ok` is `true` even when individual calls fail. Inspect `result.events` for `Utility.ItemFailed` events to detect individual failures. Only `"batch_all"` guarantees that `result.ok === false` when any call fails.

Calls can be PAPI transactions (`.decodedCall` extracted automatically), Ink SDK `AsyncTransaction` wrappers (`.waited` resolved automatically), or raw decoded calls.

```typescript
// Mix of raw decoded calls and transactions
const calls = [
  api.tx.Balances.transfer_keep_alive({ dest, value: 1_000n }),     // PAPI tx
  extractTransaction(await contract.query("mint", { origin, data })), // Ink SDK
  someDecodedCallObject,                                              // raw
];
const result = await batchSubmitAndWatch(calls, api, signer);
```

## Transaction lifecycle

`submitAndWatch` drives a transaction through its full lifecycle: signing, broadcasting, block inclusion, and optional finalization. You choose when to resolve the returned promise with the `waitFor` option.

```typescript
import { submitAndWatch } from "@polkadot-apps/tx";

const result = await submitAndWatch(tx, signer, {
  waitFor: "best-block",   // resolve at best-block inclusion (default)
  timeoutMs: 300_000,      // 5-minute timeout (default)
  mortalityPeriod: 256,    // ~43 minutes on Polkadot (default)
  onStatus: (status) => {
    // "signing" -> "broadcasting" -> "in-block" -> "finalized"
    updateUI(status);
  },
});

if (!result.ok) {
  console.error("Dispatch failed:", result.dispatchError);
}
```

The function accepts both raw PAPI transactions and Ink SDK `AsyncTransaction` wrappers. Ink SDK wrappers are resolved automatically via the `.waited` promise.

## Dev signers

Create signers from the well-known Substrate dev mnemonic for local testing. All keys derive at `//Name` using sr25519.

```typescript
import { createDevSigner, getDevPublicKey } from "@polkadot-apps/tx";

const alice = createDevSigner("Alice");
const bobPubKey = getDevPublicKey("Bob"); // Uint8Array (32 bytes)
```

Available names: `"Alice"`, `"Bob"`, `"Charlie"`, `"Dave"`, `"Eve"`, `"Ferdie"`.

## Dry-run and weight buffers

Extract a submittable transaction from an Ink SDK dry-run result and apply a safety buffer to weight estimates before submission.

```typescript
import { extractTransaction, applyWeightBuffer } from "@polkadot-apps/tx";

const dryRunResult = await contract.query.myMethod(args);
const tx = extractTransaction(dryRunResult);

const buffered = applyWeightBuffer(dryRunResult.weight_required, {
  percent: 25, // default: 25%
});
```

## Account mapping

Map an SS58 address to an H160 address on Asset Hub. The operation is idempotent -- it returns `null` when the account is already mapped.

```typescript
import { ensureAccountMapped, isAccountMapped } from "@polkadot-apps/tx";

const mapped = await isAccountMapped(address, checker);

if (!mapped) {
  const result = await ensureAccountMapped(address, signer, checker, api);
  // result is TxResult or null (if already mapped)
}
```

## Retry logic

`withRetry` wraps any async function with exponential backoff and jitter. It does **not** retry `TxDispatchError`, `TxBatchError`, `TxSigningRejectedError`, or `TxTimeoutError` -- these represent terminal conditions that retrying cannot fix.

```typescript
import { withRetry, calculateDelay } from "@polkadot-apps/tx";

const result = await withRetry(() => submitAndWatch(tx, signer), {
  maxAttempts: 3,     // total attempts including the first (default)
  baseDelayMs: 1_000, // initial backoff (default)
  maxDelayMs: 15_000, // backoff cap (default)
});

// Calculate delay directly for custom retry strategies
const delay = calculateDelay(2, 1_000, 15_000);
```

## Error handling

All errors extend a common `TxError` base class. Use the specific error types and utility functions to handle failures precisely.

```typescript
import {
  TxTimeoutError,
  TxDispatchError,
  TxSigningRejectedError,
  TxDryRunError,
  TxAccountMappingError,
  formatDispatchError,
  formatDryRunError,
  isSigningRejection,
} from "@polkadot-apps/tx";

try {
  await submitAndWatch(tx, signer);
} catch (error) {
  if (isSigningRejection(error)) {
    console.log("User cancelled signing");
  } else if (error instanceof TxDispatchError) {
    console.error(error.formatted, error.dispatchError);
  } else if (error instanceof TxTimeoutError) {
    console.error(`Timed out after ${error.timeoutMs}ms`);
  } else if (error instanceof TxDryRunError) {
    console.error(error.formatted, error.revertReason);
  }
}
```

## API

### `submitAndWatch(tx, signer, options?): Promise<TxResult>`

Submit a transaction and watch its lifecycle through to inclusion or finalization.

| Parameter | Type | Description |
|-----------|------|-------------|
| `tx` | `SubmittableTransaction` | Transaction with `signSubmitAndWatch`. Raw PAPI or Ink SDK. |
| `signer` | `PolkadotSigner` | Signer from a wallet, Host API, or `createDevSigner`. |
| `options` | `SubmitOptions` | Optional. See below. |

**Throws**: `TxTimeoutError`, `TxDispatchError`, `TxSigningRejectedError`.

### `batchSubmitAndWatch(calls, api, signer, options?): Promise<TxResult>`

Batch multiple transactions into a single Substrate Utility batch and submit with lifecycle tracking.

| Parameter | Type | Description |
|-----------|------|-------------|
| `calls` | `BatchableCall[]` | Transactions, AsyncTransactions, or raw decoded calls. |
| `api` | `BatchApi` | Typed API with `tx.Utility.batch_all/batch/force_batch`. |
| `signer` | `PolkadotSigner` | Signer from a wallet, Host API, or `createDevSigner`. |
| `options` | `BatchSubmitOptions` | Optional. Extends `SubmitOptions` with `mode`. |

**Throws**: `TxBatchError` (empty calls), `TxTimeoutError`, `TxDispatchError`, `TxSigningRejectedError`.

### `createDevSigner(name): PolkadotSigner`

Create a signer from the well-known dev mnemonic at `//Name` (sr25519).

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `DevAccountName` | One of `"Alice"`, `"Bob"`, `"Charlie"`, `"Dave"`, `"Eve"`, `"Ferdie"`. |

### `getDevPublicKey(name): Uint8Array`

Return the 32-byte public key for a dev account.

### `withRetry<T>(fn, options?): Promise<T>`

Retry an async function with exponential backoff and jitter. Does not retry `TxBatchError`, `TxDispatchError`, `TxSigningRejectedError`, or `TxTimeoutError`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `fn` | `() => Promise<T>` | Async function to retry. |
| `options` | `RetryOptions` | Optional retry configuration. |

### `calculateDelay(attempt, baseDelayMs, maxDelayMs): number`

Compute the backoff delay for a given attempt number, with jitter.

### `extractTransaction(result): SubmittableTransaction`

Extract a submittable transaction from an Ink SDK dry-run result.

### `applyWeightBuffer(weight, options?): Weight`

Apply a percentage safety buffer to a weight estimate. Default buffer is 25%.

### `ensureAccountMapped(address, signer, checker, api, options?): Promise<TxResult | null>`

Map an SS58 address to H160 on Asset Hub. Returns `null` if the account is already mapped.

### `isAccountMapped(address, checker): Promise<boolean>`

Check whether an SS58 address is already mapped to an H160 address.

### Error utilities

| Function | Signature | Description |
|----------|-----------|-------------|
| `formatDispatchError` | `(result) => string` | Format a dispatch error into a readable string. |
| `formatDryRunError` | `(result) => string` | Format a dry-run error into a readable string. |
| `isSigningRejection` | `(error) => boolean` | Check if an error is a signing rejection. |

## Types

```typescript
type TxStatus = "signing" | "broadcasting" | "in-block" | "finalized" | "error";

type WaitFor = "best-block" | "finalized";

interface TxResult {
  txHash: string;
  ok: boolean;
  block: { hash: string; number: number; index: number };
  events: unknown[];
  dispatchError?: unknown;
}

interface SubmitOptions {
  waitFor?: WaitFor;          // default: "best-block"
  timeoutMs?: number;         // default: 300_000
  mortalityPeriod?: number;   // default: 256
  onStatus?: (status: TxStatus) => void;
}

interface RetryOptions {
  maxAttempts?: number;   // default: 3
  baseDelayMs?: number;   // default: 1_000
  maxDelayMs?: number;    // default: 15_000
}

type DevAccountName = "Alice" | "Bob" | "Charlie" | "Dave" | "Eve" | "Ferdie";

interface Weight {
  ref_time: bigint;
  proof_size: bigint;
}

type BatchMode = "batch_all" | "batch" | "force_batch";

interface BatchSubmitOptions extends SubmitOptions {
  mode?: BatchMode;  // default: "batch_all"
}

interface BatchApi {
  tx: {
    Utility: {
      batch(args: { calls: unknown[] }): SubmittableTransaction;
      batch_all(args: { calls: unknown[] }): SubmittableTransaction;
      force_batch(args: { calls: unknown[] }): SubmittableTransaction;
    };
  };
}
```

### Error classes

| Class | Extends | Key properties |
|-------|---------|---------------|
| `TxError` | `Error` | Base class for all tx errors. |
| `TxTimeoutError` | `TxError` | `timeoutMs: number` |
| `TxDispatchError` | `TxError` | `dispatchError: unknown`, `formatted: string` |
| `TxSigningRejectedError` | `TxError` | User rejected signing. |
| `TxDryRunError` | `TxError` | `raw: unknown`, `formatted: string`, `revertReason?: string` |
| `TxBatchError` | `TxError` | Batch construction failed (e.g., empty calls). |
| `TxAccountMappingError` | `TxError` | Account mapping failed. |

## License

Apache-2.0
