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

## API

### Encoding

| Function | Signature | Returns |
|---|---|---|
| `bytesToHex` | `(bytes: Uint8Array)` | `string` (lowercase, no `0x` prefix) |
| `hexToBytes` | `(hex: string)` | `Uint8Array` (no `0x` prefix expected) |
| `utf8ToBytes` | `(str: string)` | `Uint8Array` |
| `concatBytes` | `(...arrays: Uint8Array[])` | `Uint8Array` |

### Token formatting

| Function | Signature | Returns |
|---|---|---|
| `formatPlanck` | `(planck: bigint, decimals?: number)` | `string` |
| `parseToPlanck` | `(amount: string, decimals?: number)` | `bigint` |

**`formatPlanck(planck, decimals = 10)`**

Convert a planck bigint to a human-readable decimal string. Trailing zeros are trimmed but at least one fractional digit is always shown (e.g. `"1.0"`, not `"1"`).

- Throws `RangeError` if `planck < 0n`.
- Throws `RangeError` if `decimals` is not a non-negative integer.

**`parseToPlanck(amount, decimals = 10)`**

Parse a decimal string into its planck bigint representation. If the fractional part exceeds `decimals`, excess digits are truncated with a warning.

- Throws `Error` if `amount` is empty or contains invalid characters.
- Throws `RangeError` if `amount` is negative or `decimals` is invalid.

## Common mistakes

- **Passing a `0x`-prefixed string to `hexToBytes`.** The `@noble/hashes` implementation expects raw hex without a prefix. Strip it first: `hexToBytes(hex.slice(2))`.
- **Using `formatPlanck` with the wrong `decimals` for a chain.** DOT uses 10, KSM uses 12, many parachains use 18. Always check the chain's token metadata.
- **Assuming `parseToPlanck` rounds excess decimals.** It truncates, not rounds. `parseToPlanck("1.999999999999", 10)` gives the same result as `parseToPlanck("1.9999999999", 10)`.

## License

Apache-2.0
