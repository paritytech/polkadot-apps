# Address API Reference

Package: `@polkadot-apps/address`

## Table of Contents

- [SS58 Functions](#ss58-functions)
  - [isValidSs58](#isvalidss58)
  - [ss58Decode](#ss58decode)
  - [ss58Encode](#ss58encode)
  - [normalizeSs58](#normalizess58)
  - [toGenericSs58](#togenericss58)
  - [toPolkadotSs58](#topolkadotss58)
  - [accountIdFromBytes](#accountidfrombytes)
  - [accountIdBytes](#accountidbytes)
- [H160 Functions](#h160-functions)
  - [deriveH160](#deriveh160)
  - [ss58ToH160](#ss58toh160)
  - [h160ToSs58](#h160toss58)
  - [toH160](#toh160)
  - [isValidH160](#isvalidh160)
- [Display Functions](#display-functions)
  - [truncateAddress](#truncateaddress)
  - [addressesEqual](#addressesequal)
- [Re-exported Types](#re-exported-types)

---

## SS58 Functions

### isValidSs58

Validate whether a string is a valid SS58 address.

```ts
function isValidSs58(address: string): boolean
```

**Parameters:**
- `address` - The string to validate.

**Returns:** `true` if the address is a valid SS58 encoding, `false` otherwise.

```ts
import { isValidSs58 } from "@polkadot-apps/address";

isValidSs58("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"); // true
isValidSs58("not-an-address"); // false
isValidSs58("0x1234");         // false
```

---

### ss58Decode

Decode an SS58 address into its raw public key bytes and network prefix.

```ts
function ss58Decode(address: string): { publicKey: Uint8Array; prefix: number }
```

**Parameters:**
- `address` - A valid SS58 address string.

**Returns:** Object with `publicKey` (raw bytes) and `prefix` (network identifier).

**Throws:** If the address is not a valid SS58 encoding.

```ts
import { ss58Decode } from "@polkadot-apps/address";

const { publicKey, prefix } = ss58Decode("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY");
// publicKey: Uint8Array(32) [0xd4, 0x35, ...]
// prefix: 42
```

---

### ss58Encode

Encode raw public key bytes into an SS58 address with the given prefix. Defaults to prefix 42 (generic Substrate).

```ts
function ss58Encode(publicKey: Uint8Array, prefix?: number): SS58String
```

**Parameters:**
- `publicKey` - Raw public key bytes.
- `prefix` - Network prefix (default: `42`).

**Returns:** The SS58-encoded address string.

```ts
import { ss58Encode } from "@polkadot-apps/address";

const address = ss58Encode(publicKeyBytes);       // prefix 42
const polkadot = ss58Encode(publicKeyBytes, 0);   // Polkadot prefix
```

---

### normalizeSs58

Re-encode an SS58 address with a different network prefix. Returns `null` if the input is not a valid SS58 address.

```ts
function normalizeSs58(address: string, prefix?: number): SS58String | null
```

**Parameters:**
- `address` - An SS58 address string.
- `prefix` - Target network prefix (default: `42`).

**Returns:** Re-encoded address, or `null` on invalid input.

```ts
import { normalizeSs58 } from "@polkadot-apps/address";

const polkadot = normalizeSs58("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY", 0);
// "15oF4uVJw..."
normalizeSs58("garbage"); // null
```

---

### toGenericSs58

Convert any SS58 address to generic Substrate format (prefix 42). Returns `null` if the input is invalid.

```ts
function toGenericSs58(address: string): SS58String | null
```

**Parameters:**
- `address` - An SS58 address string at any prefix.

**Returns:** Address re-encoded at prefix 42, or `null`.

```ts
import { toGenericSs58 } from "@polkadot-apps/address";

const generic = toGenericSs58(polkadotAddress); // "5Grwva..."
```

---

### toPolkadotSs58

Convert any SS58 address to Polkadot format (prefix 0). Returns `null` if the input is invalid.

```ts
function toPolkadotSs58(address: string): SS58String | null
```

**Parameters:**
- `address` - An SS58 address string at any prefix.

**Returns:** Address re-encoded at prefix 0, or `null`.

```ts
import { toPolkadotSs58 } from "@polkadot-apps/address";

const polkadot = toPolkadotSs58("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY");
```

---

### accountIdFromBytes

Encode an SS58 address from a 32-byte public key using polkadot-api's AccountId codec. Inverse of `accountIdBytes()`.

```ts
function accountIdFromBytes(publicKey: Uint8Array, prefix?: number): SS58String
```

**Parameters:**
- `publicKey` - 32-byte public key.
- `prefix` - Network prefix (default: `42`).

**Returns:** SS58-encoded address string.

```ts
import { accountIdFromBytes } from "@polkadot-apps/address";

const address = accountIdFromBytes(publicKeyBytes);     // prefix 42
const polkadot = accountIdFromBytes(publicKeyBytes, 0); // prefix 0
```

---

### accountIdBytes

Decode an SS58 address to its 32-byte AccountId using polkadot-api's AccountId codec. Inverse of `accountIdFromBytes()`.

```ts
function accountIdBytes(address: string): Uint8Array
```

**Parameters:**
- `address` - An SS58 address string.

**Returns:** 32-byte AccountId as `Uint8Array`.

```ts
import { accountIdBytes } from "@polkadot-apps/address";

const bytes = accountIdBytes("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY");
// Uint8Array(32) [0xd4, 0x35, ...]
```

---

## H160 Functions

### deriveH160

Derive the H160 EVM address from a 32-byte Substrate public key.

Uses Asset Hub pallet-revive derivation rules:
- If the account was EVM-derived (last 12 bytes are all `0xEE`): strip padding to recover original H160.
- If native Substrate account: `keccak256(publicKey)`, take last 20 bytes. One-way mapping.

```ts
function deriveH160(publicKey: Uint8Array): `0x${string}`
```

**Parameters:**
- `publicKey` - 32-byte Substrate public key.

**Returns:** `0x`-prefixed H160 address string.

**Throws:** If `publicKey` is not exactly 32 bytes.

```ts
import { deriveH160 } from "@polkadot-apps/address";

const evmAddr = deriveH160(publicKeyBytes);
// "0x9621dde636de098b43efb0fa9b61facfe328f99d"
```

---

### ss58ToH160

Convert an SS58 address to its H160 EVM address. Handles both native Substrate accounts (keccak256 path) and EVM-derived accounts (0xEE padding strip).

```ts
function ss58ToH160(address: string): `0x${string}`
```

**Parameters:**
- `address` - A valid SS58 address string.

**Returns:** `0x`-prefixed H160 address.

```ts
import { ss58ToH160 } from "@polkadot-apps/address";

const evm = ss58ToH160("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY");
// "0x9621dde636de098b43efb0fa9b61facfe328f99d"
```

---

### h160ToSs58

Convert an H160 EVM address to its corresponding SS58 address. Constructs an "EVM-derived" AccountId32 by padding the H160 with `0xEE` bytes. These accounts are implicitly mapped in pallet-revive.

```ts
function h160ToSs58(evmAddress: string, prefix?: number): SS58String
```

**Parameters:**
- `evmAddress` - `0x`-prefixed 40-hex-char EVM address.
- `prefix` - SS58 network prefix (default: `42`).

**Returns:** SS58-encoded address.

**Throws:** If `evmAddress` is not a valid H160 format.

```ts
import { h160ToSs58 } from "@polkadot-apps/address";

const ss58 = h160ToSs58("0x9621dde636de098b43efb0fa9b61facfe328f99d");
const polkadot = h160ToSs58("0x9621dde636de098b43efb0fa9b61facfe328f99d", 0);
```

---

### toH160

Convert any address (SS58 or H160) to an H160 EVM address. If already H160 format (`0x`-prefixed, 42 chars), return as-is preserving original casing.

```ts
function toH160(address: string): `0x${string}`
```

**Parameters:**
- `address` - Either an SS58 string or an `0x`-prefixed H160 string.

**Returns:** `0x`-prefixed H160 address.

```ts
import { toH160 } from "@polkadot-apps/address";

toH160("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY");
// "0x9621dde636de098b43efb0fa9b61facfe328f99d"

toH160("0x9621DDE636DE098B43EFB0FA9B61FACFE328F99D");
// "0x9621DDE636DE098B43EFB0FA9B61FACFE328F99D" (passthrough, casing preserved)
```

---

### isValidH160

Validate whether a string is a valid H160 (20-byte hex) address.

```ts
function isValidH160(address: string): boolean
```

**Parameters:**
- `address` - The string to validate.

**Returns:** `true` if it matches `/^0x[a-fA-F0-9]{40}$/`.

```ts
import { isValidH160 } from "@polkadot-apps/address";

isValidH160("0x9621dde636de098b43efb0fa9b61facfe328f99d"); // true
isValidH160("0x1234");        // false
isValidH160("no-0x-prefix");  // false
```

---

## Display Functions

### truncateAddress

Truncate an address for display purposes.

```ts
function truncateAddress(address: string, startChars?: number, endChars?: number): string
```

**Parameters:**
- `address` - Full address (SS58 or H160).
- `startChars` - Characters to show at the start (default: `6`).
- `endChars` - Characters to show at the end (default: `4`).

**Returns:** Truncated string like `"5Grwva...utQY"`. Returns the original string if shorter than `startChars + endChars + 3`. Returns `""` for empty input.

```ts
import { truncateAddress } from "@polkadot-apps/address";

truncateAddress("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY");
// "5Grwva...utQY"

truncateAddress("0x9621dde636de098b43efb0fa9b61facfe328f99d", 6, 4);
// "0x9621...f99d"

truncateAddress("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY", 4, 3);
// "5Grw...tQY"
```

---

### addressesEqual

Compare two addresses for equality.

- H160 (`0x`-prefixed) addresses are compared case-insensitively.
- SS58 addresses are compared exactly (base58 is case-sensitive).
- Mixed types (SS58 vs H160) always return `false`. Use `ss58ToH160()` to normalize first.
- SS58 at different prefixes (same key, different network) returns `false`. Use `normalizeSs58()` first.

```ts
function addressesEqual(a: string, b: string): boolean
```

**Parameters:**
- `a` - First address.
- `b` - Second address.

**Returns:** `true` if the addresses are equal according to the rules above.

```ts
import { addressesEqual } from "@polkadot-apps/address";

addressesEqual(
  "0x9621DDE636DE098B43EFB0FA9B61FACFE328F99D",
  "0x9621dde636de098b43efb0fa9b61facfe328f99d",
); // true (H160 case-insensitive)

addressesEqual(ss58Addr, evmAddr); // false (mixed types)
```

---

## Re-exported Types

These types are re-exported from `@polkadot-api/substrate-bindings`:

```ts
export type { SS58String, HexString } from "@polkadot-api/substrate-bindings";
```

- `SS58String` - Branded string type for SS58 addresses.
- `HexString` - Branded string type for hex-encoded data.
