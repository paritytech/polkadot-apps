# @polkadot-apps/tx API Reference

## Functions

### submitAndWatch

Submit a transaction and watch its lifecycle through signing, broadcasting, block inclusion, and (optionally) finalization.

```ts
function submitAndWatch(
  tx: SubmittableTransaction,
  signer: PolkadotSigner,
  options?: SubmitOptions,
): Promise<TxResult>
```

**Parameters:**
- `tx` - A transaction object with `signSubmitAndWatch`. Works with raw PAPI transactions and Ink SDK `AsyncTransaction` wrappers (resolved automatically via the `.waited` Promise).
- `signer` - The `PolkadotSigner` to use. Can come from a wallet extension, Host API, or `createDevSigner`.
- `options` - Optional `SubmitOptions`.

**Throws:**
- `TxTimeoutError` - If the transaction does not reach the target state within `timeoutMs`.
- `TxDispatchError` - If the on-chain dispatch fails (e.g., insufficient balance, contract revert).
- `TxSigningRejectedError` - If the user rejects signing in their wallet.

**Behavior:**
- Default `waitFor` is `"best-block"` (resolves when included in a best block).
- When `waitFor` is `"best-block"`, the subscription stays alive after resolving to detect reorgs. If finalization reveals a failure after best-block success, a warning is logged (the Promise is already resolved).
- Automatically resolves Ink SDK `AsyncTransaction` wrappers (objects with a `.waited` Promise).

---

### batchSubmitAndWatch

Batch multiple transactions into a single Substrate Utility batch and submit with lifecycle tracking.

```ts
function batchSubmitAndWatch(
  calls: BatchableCall[],
  api: BatchApi,
  signer: PolkadotSigner,
  options?: BatchSubmitOptions,
): Promise<TxResult>
```

**Parameters:**
- `calls` - Array of transactions, AsyncTransactions, or raw decoded calls. Each call's `.decodedCall` is extracted automatically; Ink SDK `AsyncTransaction` wrappers (with `.waited`) are resolved transparently; raw decoded call objects are passed through as-is.
- `api` - A typed API with `tx.Utility.batch_all/batch/force_batch`. Works structurally with any chain that has the Utility pallet.
- `signer` - The `PolkadotSigner` to use.
- `options` - Optional `BatchSubmitOptions` (extends `SubmitOptions` with `mode`).

**Throws:**
- `TxBatchError` - If `calls` is empty, or if an AsyncTransaction resolves without `.decodedCall`.
- `TxTimeoutError` - If the batch transaction does not reach the target state within `timeoutMs`.
- `TxDispatchError` - If the on-chain dispatch fails.
- `TxSigningRejectedError` - If the user rejects signing in their wallet.

**Behavior:**
- Default `mode` is `"batch_all"` (atomic, all-or-nothing).
- All calls are resolved in parallel via `Promise.all` before constructing the batch.
- Delegates to `submitAndWatch` for the actual submission, so all `SubmitOptions` (waitFor, timeoutMs, mortalityPeriod, onStatus) are forwarded.
- `TxBatchError` is non-retryable by `withRetry` (deterministic construction failure).

---

### createDevSigner

Create a `PolkadotSigner` for a standard Substrate dev account.

```ts
function createDevSigner(name: DevAccountName): PolkadotSigner
```

**Parameters:**
- `name` - Dev account name: `"Alice"` | `"Bob"` | `"Charlie"` | `"Dave"` | `"Eve"` | `"Ferdie"`

Uses the well-known Substrate dev mnemonic (`DEV_PHRASE`) with Sr25519 key derivation at the path `//{Name}`. These accounts are pre-funded on dev/test chains.

> **WARNING: Only for local development, scripts, and testing. Never use in production.**

---

### getDevPublicKey

Get the public key bytes for a dev account.

```ts
function getDevPublicKey(name: DevAccountName): Uint8Array
```

Returns the 32-byte Sr25519 public key. Useful for address derivation or identity checks in tests.

---

### extractTransaction

Validate an Ink SDK dry-run result and extract the submittable transaction.

```ts
function extractTransaction(result: {
  success: boolean;
  value?: unknown;
  error?: unknown;
}): SubmittableTransaction
```

**Throws:** `TxDryRunError` if the dry run failed or the result has no `send()` method.

Works with:
- `contract.query("method", { origin, data })` (Ink SDK)
- `contract.write("method", args, origin)` (patched SDK wrappers)
- Any object with `{ success: boolean; value?: { send?(): SubmittableTransaction } }`

---

### applyWeightBuffer

Apply a safety buffer to weight estimates from a dry-run result.

```ts
function applyWeightBuffer(weight: Weight, options?: { percent?: number }): Weight
```

**Parameters:**
- `weight` - The `weight_required` from a `ReviveApi.call` or `ReviveApi.eth_transact` dry-run.
- `options.percent` - Buffer percentage. Default: `25`.

Returns a new `Weight` with both `ref_time` and `proof_size` scaled up by the buffer percentage. Does not mutate the original.

---

### withRetry

Wrap an async function with retry logic and exponential backoff.

```ts
function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>
```

**Parameters:**
- `fn` - The async function to retry.
- `options` - Optional `RetryOptions`.

Only retries transient errors (network disconnects, temporary RPC failures). The following are rethrown immediately without retry:
- `TxBatchError` - Deterministic batch construction failure.
- `TxDispatchError` - Deterministic on-chain failure.
- `TxSigningRejectedError` - Explicit user intent.
- `TxTimeoutError` - Already waited the full duration.

---

### calculateDelay

Calculate delay with exponential backoff and jitter.

```ts
function calculateDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number
```

Formula: `min(baseDelay * 2^attempt, maxDelay) * random(0.5, 1.0)`

Jitter prevents thundering-herd when multiple clients retry simultaneously.

---

### ensureAccountMapped

Ensure an account's SS58 address is mapped to its H160 EVM address on-chain.

```ts
function ensureAccountMapped(
  address: string,
  signer: PolkadotSigner,
  checker: MappingChecker,
  api: ReviveApi,
  options?: EnsureAccountMappedOptions,
): Promise<TxResult | null>
```

**Parameters:**
- `address` - The SS58 address to check/map.
- `signer` - The signer for the account (must match the address).
- `checker` - An object with `addressIsMapped()` (e.g., from `createInkSdk(client)`).
- `api` - A typed API with `tx.Revive.map_account()`.
- `options` - Optional timeout and status callback.

**Returns:** The `TxResult` if mapping was performed, or `null` if already mapped.

**Throws:**
- `TxAccountMappingError` - If the mapping check fails.
- `TxDispatchError` - If the `map_account` transaction fails on-chain.
- `TxTimeoutError` - If the mapping transaction times out.

Idempotent -- safe to call multiple times. Required before EVM contract interactions on Asset Hub.

---

### isAccountMapped

Check if an address is mapped on-chain.

```ts
function isAccountMapped(address: string, checker: MappingChecker): Promise<boolean>
```

Convenience wrapper around `checker.addressIsMapped()` with error handling.

**Throws:** `TxAccountMappingError` on failure.

---

### formatDispatchError

Extract a human-readable error from a transaction result's dispatch error.

```ts
function formatDispatchError(result: { ok: boolean; dispatchError?: unknown }): string
```

Walks the PAPI dispatch error chain (e.g., `Module.Revive.ContractReverted`) to build a string like `"Revive.ContractReverted"`. Returns `""` if the result is ok, or `"unknown error"` if the error cannot be decoded.

---

### formatDryRunError

Extract a human-readable error from a failed dry-run result.

```ts
function formatDryRunError(result: {
  success?: boolean;
  value?: unknown;
  error?: unknown;
}): string
```

Handles multiple error shapes:
1. Revert reason: `{ value: { revertReason: "InsufficientBalance" } }`
2. Nested dispatch errors: `{ value: { type: "Module", value: { type: "Revive", value: { type: "..." } } } }`
3. ReviveApi Message: `{ value: { type: "Message", value: "..." } }`
4. ReviveApi Data: `{ value: { type: "Data", value: "0x..." } }`
5. Wrapped raw errors: `{ value: { raw: { ... } } }`
6. Generic error field: `{ error: { type: "ContractTrapped" } }`

---

### isSigningRejection

Check if an error looks like a user-rejected signing request.

```ts
function isSigningRejection(error: unknown): boolean
```

Checks for common patterns: "cancelled", "rejected", "denied", "user refused". Non-Error values always return `false`.

---

## Error Classes

### TxError (base)

```ts
class TxError extends Error {
  constructor(message: string, options?: ErrorOptions)
}
```

Base class for all transaction errors. Use `instanceof TxError` to catch any tx-related error.

### TxTimeoutError

```ts
class TxTimeoutError extends TxError {
  readonly timeoutMs: number;
  constructor(timeoutMs: number)
}
```

The transaction did not finalize within the configured timeout. It may still be processing on-chain.

### TxDispatchError

```ts
class TxDispatchError extends TxError {
  readonly dispatchError: unknown;
  readonly formatted: string;
  constructor(dispatchError: unknown, formatted: string)
}
```

The transaction was included on-chain but the dispatch failed. `formatted` is a human-readable string (e.g., `"Revive.ContractReverted"`).

### TxSigningRejectedError

```ts
class TxSigningRejectedError extends TxError {
  constructor()
}
```

The user rejected the signing request in their wallet.

### TxDryRunError

```ts
class TxDryRunError extends TxError {
  readonly raw: unknown;
  readonly formatted: string;
  readonly revertReason?: string;
  constructor(raw: unknown, formatted: string, revertReason?: string)
}
```

A dry-run simulation failed before the transaction was submitted on-chain. `revertReason` is the Solidity revert reason if the contract provided one.

### TxBatchError

```ts
class TxBatchError extends TxError {
  constructor(message: string)
}
```

Error specific to batch transaction construction. Thrown when `calls` is empty or when an AsyncTransaction resolves without a `.decodedCall` property. Non-retryable by `withRetry`.

### TxAccountMappingError

```ts
class TxAccountMappingError extends Error {
  constructor(message: string, options?: ErrorOptions)
}
```

Error thrown when account mapping check or transaction fails.

---

## Types

### TxStatus

```ts
type TxStatus = "signing" | "broadcasting" | "in-block" | "finalized" | "error";
```

Transaction lifecycle status for UI callbacks.

### WaitFor

```ts
type WaitFor = "best-block" | "finalized";
```

When to resolve the submission promise.

### TxResult

```ts
interface TxResult {
  txHash: string;
  ok: boolean;
  block: { hash: string; number: number; index: number };
  events: unknown[];
  dispatchError?: unknown;
}
```

### SubmitOptions

```ts
interface SubmitOptions {
  waitFor?: WaitFor;              // Default: "best-block"
  timeoutMs?: number;             // Default: 300_000 (5 minutes)
  mortalityPeriod?: number;       // Default: 256 (~43 minutes on Polkadot)
  onStatus?: (status: TxStatus) => void;
}
```

### RetryOptions

```ts
interface RetryOptions {
  maxAttempts?: number;    // Default: 3
  baseDelayMs?: number;    // Default: 1_000
  maxDelayMs?: number;     // Default: 15_000
}
```

### Weight

```ts
interface Weight {
  ref_time: bigint;
  proof_size: bigint;
}
```

Substrate weight representing computational and storage resources.

### DevAccountName

```ts
type DevAccountName = "Alice" | "Bob" | "Charlie" | "Dave" | "Eve" | "Ferdie";
```

### SubmittableTransaction

```ts
interface SubmittableTransaction {
  signSubmitAndWatch: (
    signer: PolkadotSigner,
    options?: { mortality?: { mortal: boolean; period: number } },
  ) => {
    subscribe: (handlers: {
      next: (event: TxEvent) => void;
      error: (error: Error) => void;
    }) => { unsubscribe: () => void };
  };
  waited?: Promise<SubmittableTransaction>;
  decodedCall?: unknown;
}
```

Structural type for any transaction object that supports Observable-based sign-submit-and-watch. Works with raw PAPI transactions and Ink SDK resolved transactions.

### TxEvent

```ts
type TxEvent =
  | { type: "signed"; txHash: string }
  | { type: "broadcasted"; txHash: string }
  | {
      type: "txBestBlocksState";
      txHash: string;
      found: boolean;
      ok?: boolean;
      events?: unknown[];
      block?: { hash: string; number: number; index: number };
      dispatchError?: unknown;
    }
  | {
      type: "finalized";
      txHash: string;
      ok: boolean;
      events: unknown[];
      block: { hash: string; number: number; index: number };
      dispatchError?: unknown;
    };
```

### MappingChecker

```ts
interface MappingChecker {
  addressIsMapped(address: string): Promise<boolean>;
}
```

Minimal interface for checking if an address is mapped on-chain. The Ink SDK's `createInkSdk(client)` returns an object with this method.

### ReviveApi

```ts
interface ReviveApi {
  tx: {
    Revive: {
      map_account(): SubmittableTransaction;
    };
  };
}
```

Minimal typed API shape for `Revive.map_account()`.

### EnsureAccountMappedOptions

```ts
interface EnsureAccountMappedOptions {
  timeoutMs?: number;  // Default: 60_000 (1 minute)
  onStatus?: (status: "checking" | "mapping" | "mapped" | "already-mapped") => void;
}
```

### BatchMode

```ts
type BatchMode = "batch_all" | "batch" | "force_batch";
```

Batch execution mode corresponding to Substrate's Utility pallet.

### BatchableCall

```ts
type BatchableCall = SubmittableTransaction | { decodedCall: unknown } | Record<string, unknown>;
```

A transaction or decoded call that can be included in a batch. Accepts PAPI transactions (`.decodedCall` extracted), Ink SDK AsyncTransactions (`.waited` resolved), or raw decoded call objects (must be objects, not primitives).

### BatchSubmitOptions

```ts
interface BatchSubmitOptions extends SubmitOptions {
  mode?: BatchMode;  // Default: "batch_all" (atomic, all-or-nothing)
}
```

### BatchApi

```ts
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

Minimal structural type for a PAPI typed API with the Utility pallet. Works with any chain that has the Utility pallet without importing chain-specific descriptors.
