---
name: polkadot-transactions
description: >
  Submit transactions, connect wallets, manage signers, and handle keys in polkadot-apps.
  Use when: submitting transactions, connecting browser wallet extensions (Talisman, Polkadot.js,
  SubWallet), integrating Host API signing (Polkadot Desktop/Mobile), managing multi-provider
  wallet accounts, deriving keys, or creating dev signers for testnet.
  Covers @polkadot-apps/tx (submit/watch), @polkadot-apps/signer (wallet connection, account
  management, multi-provider signing), and @polkadot-apps/keys (key derivation, session keys).
---

# Polkadot Transactions, Signing, and Key Management

This skill covers three packages that work together for submitting on-chain transactions:

| Package | Import | Purpose |
|---------|--------|---------|
| tx | `@polkadot-apps/tx` | Submit, watch, retry transactions |
| signer | `@polkadot-apps/signer` | Manage signing accounts across providers |
| keys | `@polkadot-apps/keys` | Derive keys, accounts, and session keys |

## Quick Start: Submit a Transaction in 10 Lines

```ts
import { createDevSigner, submitAndWatch } from "@polkadot-apps/tx";
import type { TxStatus, TxResult } from "@polkadot-apps/tx";

// 1. Get a signer (dev signer for testnet)
const alice = createDevSigner("Alice");

// 2. Build a transaction (from PAPI typed API)
// Note: `dest` is a MultiAddress enum — pass as { type: "Id", value: ss58Address }
const tx = api.tx.Balances.transfer_keep_alive({
  dest: { type: "Id", value: recipientAddress },
  value: 1_000_000_000_000n,
});

// 3. Submit and watch
const result = await submitAndWatch(tx, alice);
// result: { txHash, ok, block: { hash, number, index }, events, dispatchError? }
console.log(result.ok ? "Success" : "Failed", result.block.hash);
```

> **WARNING: Dev signers (`createDevSigner`) use well-known private keys. They are for local development and testnets ONLY. Never use in production.**

## Three Distinct Signer Types

> **WARNING: Three different signer-related types exist in this codebase. Do not confuse them.**

| Type | Package | What It Is |
|------|---------|------------|
| `PolkadotSigner` | `polkadot-api` | Low-level signer passed to `submitAndWatch()`. Signs extrinsics. |
| `SignerAccount` | `@polkadot-apps/signer` | Account wrapper with address, publicKey, source, and `getSigner()` that returns a `PolkadotSigner`. |
| `SignerManager` | `@polkadot-apps/signer` | Orchestrator that discovers accounts from multiple providers and manages selection state. |

How they connect:

```
SignerManager.connect() -> SignerAccount[] -> account.getSigner() -> PolkadotSigner -> submitAndWatch(tx, signer)
```

## Transaction Lifecycle

### 1. Build the Transaction

From a PAPI typed API:
```ts
const tx = api.tx.Balances.transfer_keep_alive({ dest, value });
```

From an Ink SDK contract (dry-run first):
```ts
import { extractTransaction } from "@polkadot-apps/tx";

const dryRun = await contract.query("mint", { origin, data: { name, price } });
const tx = extractTransaction(dryRun); // Throws TxDryRunError on failure
```

### 2. (Optional) Apply Weight Buffer for ReviveApi Calls

```ts
import { applyWeightBuffer } from "@polkadot-apps/tx";

const dryRun = await api.apis.ReviveApi.call(origin, dest, value, undefined, undefined, data);
const tx = api.tx.Revive.call({
  dest, value, data,
  weight_limit: applyWeightBuffer(dryRun.weight_required), // +25% safety margin
  storage_deposit_limit: dryRun.storage_deposit.value,
});
```

### 3. Sign and Submit

```ts
import { submitAndWatch } from "@polkadot-apps/tx";

// TxStatus = "signing" | "broadcasting" | "in-block" | "finalized" | "error"
const result = await submitAndWatch(tx, signer, {
  waitFor: "best-block",     // or "finalized" (slower but safer)
  timeoutMs: 300_000,        // 5 minutes default
  mortalityPeriod: 256,      // ~43 minutes on Polkadot
  onStatus: (status: TxStatus) => updateUI(status),
});
// result: TxResult { txHash, ok, block: { hash, number, index }, events, dispatchError? }
```

### 4. (Optional) Retry Transient Failures

```ts
import { withRetry, submitAndWatch } from "@polkadot-apps/tx";

const result = await withRetry(
  () => submitAndWatch(tx, signer),
  { maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 15_000 },
);
```

`withRetry` only retries transient errors (network disconnects, RPC failures). It does NOT retry:
- `TxDispatchError` (on-chain failure like insufficient balance)
- `TxSigningRejectedError` (user rejected in wallet)
- `TxTimeoutError` (already waited full duration)

### 5. (Optional) Ensure Account Mapping for EVM Contracts

```ts
import { ensureAccountMapped } from "@polkadot-apps/tx";

// Required before EVM contract interactions on Asset Hub
await ensureAccountMapped(address, signer, inkSdk, api);
```

## Error Handling

All tx errors extend `TxError`. Catch them hierarchically:

```ts
import {
  TxError, TxTimeoutError, TxDispatchError,
  TxSigningRejectedError, TxDryRunError,
} from "@polkadot-apps/tx";

try {
  const result = await submitAndWatch(tx, signer);
} catch (e) {
  if (e instanceof TxSigningRejectedError) {
    // User rejected signing in wallet
  } else if (e instanceof TxDispatchError) {
    console.log(e.formatted); // e.g., "Balances.InsufficientBalance"
  } else if (e instanceof TxTimeoutError) {
    console.log(`Timed out after ${e.timeoutMs}ms`);
  } else if (e instanceof TxDryRunError) {
    console.log(e.revertReason); // Solidity revert reason if available
    console.log(e.formatted);    // Structured error string
  } else if (e instanceof TxError) {
    // Catch-all for any tx error
  }
}
```

For signer errors, all extend `SignerError`:

```ts
import { SignerError, isHostError, isExtensionError } from "@polkadot-apps/signer";

const result = await manager.connect();
if (!result.ok) {
  if (isHostError(result.error)) { /* Host API issue */ }
  if (isExtensionError(result.error)) { /* Extension issue */ }
}
```

## Dev Signers for Testnet

```ts
import { createDevSigner, getDevPublicKey } from "@polkadot-apps/tx";

// Available names: "Alice" | "Bob" | "Charlie" | "Dave" | "Eve" | "Ferdie"
const alice = createDevSigner("Alice");
const alicePubKey = getDevPublicKey("Alice"); // 32-byte Uint8Array

// Use directly with submitAndWatch
const result = await submitAndWatch(tx, alice);
```

These use the well-known Substrate dev mnemonic with Sr25519 derivation at `//Name`.

## SignerManager: Multi-Provider Account Management

```ts
import { SignerManager } from "@polkadot-apps/signer";

const manager = new SignerManager({
  ss58Prefix: 42,
  hostTimeout: 10_000,
  extensionTimeout: 1_000,
  maxRetries: 3,
  dappName: "my-app",
  persistence: localStorage,  // or null to disable
});

// Subscribe to state changes (framework-agnostic)
const unsub = manager.subscribe((state) => {
  console.log(state.status, state.accounts, state.selectedAccount);
});

// Auto-detect: tries Host API (in container) or extensions (in browser)
const result = await manager.connect();
// Or connect to a specific provider:
// await manager.connect("dev");
// await manager.connect("extension");
// await manager.connect("host");

if (result.ok) {
  // Select an account
  manager.selectAccount(result.value[0].address);

  // Get PolkadotSigner for the selected account
  const signer = manager.getSigner(); // PolkadotSigner | null

  // Use with submitAndWatch
  if (signer) {
    const txResult = await submitAndWatch(tx, signer);
  }
}

// Sign raw bytes (for key derivation, proofs, etc.)
const sigResult = await manager.signRaw(new Uint8Array([1, 2, 3]));

// Host-only: product accounts and Ring VRF
const productAccount = await manager.getProductAccount("myapp.dot");
const alias = await manager.getProductAccountAlias("myapp.dot");

// Cleanup
manager.destroy();
```

## KeyManager: Hierarchical Key Derivation

```ts
import { KeyManager } from "@polkadot-apps/keys";

// Create from a signature (master key via HKDF-SHA256)
const km = KeyManager.fromSignature(signatureBytes, signerAddress);

// Or from raw 32-byte key material
const km2 = KeyManager.fromRawKey(rawKeyBytes);

// Derive a symmetric key for encryption
const encKey = km.deriveSymmetricKey("doc:123");

// Derive a Substrate account
const account = km.deriveAccount("app-account", 42); // ss58Prefix
// account.signer, account.ss58Address, account.h160Address, account.publicKey

// Derive NaCl keypairs for encryption and signing
const kp = km.deriveKeypairs();
// kp.encryption.publicKey, kp.encryption.secretKey (Curve25519)
// kp.signing.publicKey, kp.signing.secretKey (Ed25519)

// Export for persistence
const raw = km.exportKey();
```

## SessionKeyManager: Mnemonic-Based Session Keys

```ts
import { SessionKeyManager } from "@polkadot-apps/keys";
import { createKvStore } from "@polkadot-apps/storage";

const store = await createKvStore({ prefix: "session-key" });
const skm = new SessionKeyManager({ store, name: "default" });

// Create or load a session key
const info = await skm.getOrCreate();
// info.mnemonic - BIP39 mnemonic (persist this)
// info.account  - DerivedAccount with signer, addresses, publicKey

// Load existing
const existing = await skm.get(); // null if not stored

// From explicit mnemonic (no storage)
const fromMnemonic = skm.fromMnemonic("abandon abandon ...");

// Clear stored key
await skm.clear();
```

## seedToAccount: Low-Level Account Derivation

```ts
import { seedToAccount } from "@polkadot-apps/keys";

const account = seedToAccount(
  mnemonic,           // BIP39 mnemonic
  "//0",              // derivation path (default "//0")
  42,                 // SS58 prefix (default 42)
  "sr25519",          // key type: "sr25519" | "ed25519" (default "sr25519")
);
// Returns: DerivedAccount { publicKey, ss58Address, h160Address, signer }
```

## Common Mistakes

1. **Using dev signers in production** - `createDevSigner` uses the well-known dev mnemonic. Anyone can recreate these keys. Use `SignerManager` with extension or host providers for real users.

2. **Confusing signer types** - `submitAndWatch` needs a `PolkadotSigner` (from `polkadot-api`), not a `SignerAccount`. Call `account.getSigner()` to get the `PolkadotSigner` from a `SignerAccount`.

3. **Missing `await` on `submitAndWatch`** - It returns a Promise. Forgetting `await` means you do not see errors or the result.

4. **Not handling `TxDispatchError`** - A transaction can be included on-chain but still fail. Always check `result.ok` or catch `TxDispatchError`.

5. **Retrying non-retryable errors** - Do not wrap `withRetry` around the full flow if you want to handle dispatch errors specially. `withRetry` already skips non-retryable errors, but your error handling should account for this.

6. **Forgetting account mapping** - EVM contract interactions on Asset Hub require calling `ensureAccountMapped` first. It is idempotent so safe to call every time.

## Reference Files

- [tx-api.md](references/tx-api.md) - Full `@polkadot-apps/tx` API reference
- [signer-api.md](references/signer-api.md) - Full `@polkadot-apps/signer` API reference
- [keys-api.md](references/keys-api.md) - Full `@polkadot-apps/keys` API reference
