# Utils API Reference

Package: `@polkadot-apps/utils`

## Table of Contents

- [Encoding](#encoding)
  - [bytesToHex](#bytestohex)
  - [hexToBytes](#hextobytes)
  - [utf8ToBytes](#utf8tobytes)
  - [concatBytes](#concatbytes)
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
