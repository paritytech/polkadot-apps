# Utils API Reference

Package: `@polkadot-apps/utils`

## Table of Contents

- [Encoding](#encoding)
  - [bytesToHex](#bytestohex)
  - [hexToBytes](#hextobytes)
  - [utf8ToBytes](#utf8tobytes)
  - [concatBytes](#concatbytes)
- [Hashing](#hashing)
  - [blake2b256](#blake2b256)
  - [sha256](#sha256)
  - [keccak256](#keccak256)
- [Token Formatting](#token-formatting)
  - [formatPlanck](#formatplanck)
  - [parseToPlanck](#parsetoplanck)

---

## Encoding

General-purpose byte encoding/decoding utilities. Re-exported from `@noble/hashes/utils`.

### bytesToHex

Convert a `Uint8Array` to its lowercase hexadecimal string representation (no `0x` prefix).

```ts
function bytesToHex(bytes: Uint8Array): string
```

```ts
import { bytesToHex } from "@polkadot-apps/utils";
bytesToHex(new Uint8Array([0xab, 0xcd])); // "abcd"
```

---

### hexToBytes

Decode a hexadecimal string into a `Uint8Array` (no `0x` prefix expected).

```ts
function hexToBytes(hex: string): Uint8Array
```

```ts
import { hexToBytes } from "@polkadot-apps/utils";
hexToBytes("abcd"); // Uint8Array [0xab, 0xcd]
```

---

### utf8ToBytes

Encode a UTF-8 string into a `Uint8Array`.

```ts
function utf8ToBytes(str: string): Uint8Array
```

```ts
import { utf8ToBytes } from "@polkadot-apps/utils";
utf8ToBytes("hello"); // Uint8Array [104, 101, 108, 108, 111]
```

---

### concatBytes

Concatenate multiple `Uint8Array` instances into a single `Uint8Array`.

```ts
function concatBytes(...arrays: Uint8Array[]): Uint8Array
```

```ts
import { concatBytes } from "@polkadot-apps/utils";
const combined = concatBytes(header, payload, footer);
```

---

## Hashing

Deterministic 32-byte hash functions. Thin wrappers over `@noble/hashes` — consumers don't need to add `@noble/hashes` as a direct dependency.

### blake2b256

Compute a 32-byte BLAKE2b-256 hash. Default hash algorithm for the Polkadot ecosystem and the Bulletin Chain.

```ts
function blake2b256(data: Uint8Array): Uint8Array
```

```ts
import { blake2b256 } from "@polkadot-apps/utils";
const hash = blake2b256(new TextEncoder().encode("hello")); // 32 bytes
```

---

### sha256

Compute a 32-byte SHA2-256 hash. Used by bulletin-deploy and supported by the Bulletin Chain.

```ts
function sha256(data: Uint8Array): Uint8Array
```

```ts
import { sha256 } from "@polkadot-apps/utils";
const hash = sha256(new TextEncoder().encode("hello")); // 32 bytes
```

---

### keccak256

Compute a 32-byte Keccak-256 hash. Used for Ethereum-compatible operations and supported by the Bulletin Chain.

```ts
function keccak256(data: Uint8Array): Uint8Array
```

```ts
import { keccak256 } from "@polkadot-apps/utils";
const hash = keccak256(new TextEncoder().encode("hello")); // 32 bytes
```

---

## Token Formatting

Convert between raw planck values (smallest indivisible token units on Substrate chains) and human-readable decimal strings.

### formatPlanck

Convert a planck bigint to a human-readable decimal string. Trailing zeros are trimmed but at least one fractional digit is always shown.

```ts
function formatPlanck(planck: bigint, decimals?: number): string
```

**Parameters:**
- `planck` - The raw planck value. Must be non-negative.
- `decimals` - Number of decimal places for the token (default: 10 for DOT).

**Returns:** A decimal string (e.g. `"1.5"`, `"0.0001"`, `"0.0"`).

**Throws:**
- `RangeError` if `planck < 0n`.
- `RangeError` if `decimals` is not a non-negative integer.

```ts
import { formatPlanck } from "@polkadot-apps/utils";

formatPlanck(10_000_000_000n);        // "1.0"       (DOT, 10 decimals)
formatPlanck(15_000_000_000n);        // "1.5"
formatPlanck(12_345_678_900n);        // "1.23456789"
formatPlanck(0n);                      // "0.0"
formatPlanck(1n);                      // "0.0000000001"
formatPlanck(1_000_000_000_000n, 12); // "1.0"       (KSM, 12 decimals)
formatPlanck(42n, 0);                  // "42.0"
```

---

### parseToPlanck

Parse a human-readable decimal string into its planck bigint representation. If the fractional part has more digits than `decimals`, excess digits are truncated (not rounded) with a warning log.

```ts
function parseToPlanck(amount: string, decimals?: number): bigint
```

**Parameters:**
- `amount` - A non-negative decimal string (e.g. `"1.5"`, `"100"`, `"0.001"`).
- `decimals` - Number of decimal places for the token (default: 10 for DOT).

**Returns:** The planck value as a bigint.

**Throws:**
- `Error` if `amount` is empty or contains invalid characters.
- `RangeError` if `amount` is negative or `decimals` is invalid.

```ts
import { parseToPlanck } from "@polkadot-apps/utils";

parseToPlanck("1.5");         // 15_000_000_000n  (DOT, 10 decimals)
parseToPlanck("100");          // 1_000_000_000_000n
parseToPlanck("0.0000000001"); // 1n
parseToPlanck("1.0", 12);     // 1_000_000_000_000n (KSM, 12 decimals)
parseToPlanck("42", 0);       // 42n
```

---

### formatBalance

Format a planck value for display with locale-aware thousand separators, configurable decimal precision, and optional token symbol. Builds on `formatPlanck` for full BigInt precision.

```ts
function formatBalance(planck: bigint, options?: FormatBalanceOptions): string
```

**Parameters:**
- `planck` - The raw planck value. Must be non-negative.
- `options` - Optional `FormatBalanceOptions`.

**Returns:** A display-ready string (e.g. `"1,000.5 DOT"`).

**Throws:**
- `RangeError` if `planck < 0n` or `decimals` is invalid (delegated to `formatPlanck`).

```ts
import { formatBalance } from "@polkadot-apps/utils";

formatBalance(10_000_000_000n);                              // "1"
formatBalance(15_000_000_000n, { symbol: "DOT" });           // "1.5 DOT"
formatBalance(10_000_000_000_000n, { symbol: "DOT" });       // "1,000 DOT"
formatBalance(12_345_678_900n, { maxDecimals: 2 });          // "1.23"
formatBalance(0n, { symbol: "DOT" });                        // "0 DOT"
formatBalance(1_000_000_000_000n, { decimals: 12, symbol: "KSM" }); // "1 KSM"
```

### FormatBalanceOptions

```ts
interface FormatBalanceOptions {
  decimals?: number;     // Default: 10 (DOT)
  maxDecimals?: number;  // Default: 4
  symbol?: string;       // Token symbol to append (e.g., "DOT")
  locale?: string;       // BCP 47 locale for thousand separators
}
```

---

## Balance Querying

### getBalance

Query the free, reserved, and frozen balances for an on-chain address. Typed convenience wrapper around `System.Account.getValue`.

```ts
function getBalance(api: BalanceApi, address: string): Promise<AccountBalance>
```

**Parameters:**
- `api` - A PAPI typed API with `query.System.Account`. Pass the chain-specific API (e.g., `client.assetHub`), not the `ChainClient` wrapper.
- `address` - The SS58 address to query.

**Returns:** `AccountBalance` with `free`, `reserved`, and `frozen` fields (all `bigint` in planck).

```ts
import { getBalance, formatBalance } from "@polkadot-apps/utils";

const balance = await getBalance(client.assetHub, aliceAddress);
console.log(formatBalance(balance.free, { symbol: "DOT" }));     // "1,000.5 DOT"
console.log(formatBalance(balance.reserved, { symbol: "DOT" })); // "50 DOT"
console.log(balance.frozen);                                      // 0n
```

### AccountBalance

```ts
interface AccountBalance {
  free: bigint;      // Available (transferable) balance in planck
  reserved: bigint;  // Reserved (locked) balance in planck
  frozen: bigint;    // Frozen (non-transferable) balance in planck
}
```

### BalanceApi

```ts
interface BalanceApi {
  query: {
    System: {
      Account: {
        getValue(address: string): Promise<{
          data: { free: bigint; reserved: bigint; frozen: bigint };
        }>;
      };
    };
  };
}
```

Minimal structural type for a PAPI typed API with `System.Account`. Works with any chain without importing chain-specific descriptors.
