# @polkadot-apps/utils

Encoding utilities and token formatting for the `@polkadot-apps` ecosystem.

## Install

```bash
pnpm add @polkadot-apps/utils
```

## Quick start

### Encoding

General-purpose byte encoding/decoding functions for working with hex strings, UTF-8 text, and byte arrays.

```typescript
import { bytesToHex, hexToBytes, utf8ToBytes, concatBytes } from "@polkadot-apps/utils";

const hex = bytesToHex(new Uint8Array([0xab, 0xcd])); // "abcd"
const bytes = hexToBytes("abcd"); // Uint8Array [0xab, 0xcd]
const text = utf8ToBytes("hello"); // Uint8Array [104, 101, 108, 108, 111]
const combined = concatBytes(header, payload);
```

### Hashing

Deterministic 32-byte hash functions used across the Polkadot ecosystem.

```typescript
import { blake2b256, sha256, keccak256, bytesToHex } from "@polkadot-apps/utils";

const hash = blake2b256(new TextEncoder().encode("hello"));
console.log(bytesToHex(hash)); // 64-char hex string

// SHA2-256 (bulletin-deploy default)
const sha = sha256(data);

// Keccak-256 (Ethereum compatibility)
const kek = keccak256(data);
```

### Token formatting

Convert between raw planck values (the smallest indivisible token unit on Substrate chains) and human-readable decimal strings.

```typescript
import { formatPlanck, parseToPlanck } from "@polkadot-apps/utils";

// Format planck to human-readable (default: 10 decimals for DOT)
formatPlanck(10_000_000_000n);       // "1.0"
formatPlanck(15_000_000_000n);       // "1.5"
formatPlanck(12_345_678_900n);       // "1.23456789"
formatPlanck(0n);                     // "0.0"

// Parse human-readable to planck
parseToPlanck("1.5");                // 15_000_000_000n
parseToPlanck("100");                // 1_000_000_000_000n

// Custom decimals for other chains
formatPlanck(1_000_000_000_000n, 12); // "1.0"
parseToPlanck("1.0", 12);             // 1_000_000_000_000n
```

### Display formatting

Format planck values for display with locale-aware thousand separators, configurable decimal precision, and optional token symbol.

```typescript
import { formatBalance } from "@polkadot-apps/utils";

formatBalance(10_000_000_000n);                              // "1"
formatBalance(15_000_000_000n, { symbol: "DOT" });           // "1.5 DOT"
formatBalance(10_000_000_000_000n, { symbol: "DOT" });       // "1,000 DOT"
formatBalance(12_345_678_900n, { maxDecimals: 2 });          // "1.23"
formatBalance(0n, { symbol: "DOT" });                        // "0 DOT"

// Custom chain decimals and locale
formatBalance(1_000_000_000_000n, { decimals: 12, symbol: "KSM", locale: "de-DE" });
```

Unlike the `Number()` approach used in some apps, `formatBalance` preserves full BigInt precision for balances of any size.

### Balance querying

Query on-chain balances with a typed convenience wrapper. Works with any PAPI typed API via structural typing — no extra dependencies.

```typescript
import { getBalance, formatBalance } from "@polkadot-apps/utils";

const balance = await getBalance(api.assetHub, aliceAddress);
console.log(formatBalance(balance.free, { symbol: "DOT" }));       // "1,000.5 DOT"
console.log(formatBalance(balance.reserved, { symbol: "DOT" }));   // "50 DOT"
```

## API

### Encoding

| Function | Signature | Returns |
|---|---|---|
| `bytesToHex` | `(bytes: Uint8Array)` | `string` (lowercase, no `0x` prefix) |
| `hexToBytes` | `(hex: string)` | `Uint8Array` (no `0x` prefix expected) |
| `utf8ToBytes` | `(str: string)` | `Uint8Array` |
| `concatBytes` | `(...arrays: Uint8Array[])` | `Uint8Array` |

### Hashing

| Function | Signature | Returns | Description |
|---|---|---|---|
| `blake2b256` | `(data: Uint8Array)` | `Uint8Array` (32 bytes) | BLAKE2b-256 — Polkadot default |
| `sha256` | `(data: Uint8Array)` | `Uint8Array` (32 bytes) | SHA2-256 — bulletin-deploy default |
| `keccak256` | `(data: Uint8Array)` | `Uint8Array` (32 bytes) | Keccak-256 — Ethereum compatibility |

### Token formatting

| Function | Signature | Returns |
|---|---|---|
| `formatPlanck` | `(planck: bigint, decimals?: number)` | `string` |
| `parseToPlanck` | `(amount: string, decimals?: number)` | `bigint` |
| `formatBalance` | `(planck: bigint, options?: FormatBalanceOptions)` | `string` |

### Balance querying

| Function | Signature | Returns |
|---|---|---|
| `getBalance` | `(api: BalanceApi, address: string)` | `Promise<AccountBalance>` |

**`formatPlanck(planck, decimals = 10)`**

Convert a planck bigint to a human-readable decimal string. Trailing zeros are trimmed but at least one fractional digit is always shown (e.g. `"1.0"`, not `"1"`).

- Throws `RangeError` if `planck < 0n`.
- Throws `RangeError` if `decimals` is not a non-negative integer.

**`parseToPlanck(amount, decimals = 10)`**

Parse a decimal string into its planck bigint representation. If the fractional part exceeds `decimals`, excess digits are truncated with a warning.

- Throws `Error` if `amount` is empty or contains invalid characters.
- Throws `RangeError` if `amount` is negative or `decimals` is invalid.

**`formatBalance(planck, options?)`**

Format a planck value for display with locale-aware thousand separators. Builds on `formatPlanck` for BigInt precision.

Options: `{ decimals?: number, maxDecimals?: number, symbol?: string, locale?: string }`. Defaults: `decimals = 10`, `maxDecimals = 4`, no symbol, user's locale.

- Throws `RangeError` if `planck < 0n` or `decimals` is invalid (delegated to `formatPlanck`).

**`getBalance(api, address): Promise<AccountBalance>`**

Query the free, reserved, and frozen balances for an address. Returns `{ free: bigint, reserved: bigint, frozen: bigint }`. Uses structural typing — works with any PAPI typed API that has `System.Account`.

## Common mistakes

- **Passing a `0x`-prefixed string to `hexToBytes`.** The `@noble/hashes` implementation expects raw hex without a prefix. Strip it first: `hexToBytes(hex.slice(2))`.
- **Using `formatPlanck` with the wrong `decimals` for a chain.** DOT uses 10, KSM uses 12, many parachains use 18. Always check the chain's token metadata.
- **Assuming `parseToPlanck` rounds excess decimals.** It truncates, not rounds. `parseToPlanck("1.999999999999", 10)` gives the same result as `parseToPlanck("1.9999999999", 10)`.
- **Using `Number()` to format large balances.** `Number(raw) / 10**decimals` loses precision for values > 2^53 planck (~900 DOT). Use `formatBalance` which preserves full BigInt precision.
- **Passing the ChainAPI wrapper to `getBalance`.** Pass the chain-specific TypedApi (e.g., `api.assetHub`), not the multi-chain `ChainAPI` object.

## License

Apache-2.0
