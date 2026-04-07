# @polkadot-apps/address

Substrate and EVM address utilities -- SS58/H160 encoding, validation, and conversion.

## Install

```bash
pnpm add @polkadot-apps/address
# or
npm install @polkadot-apps/address
```

`polkadot-api` and `@polkadot-api/substrate-bindings` are required dependencies and are installed automatically.

## Quick Start

```typescript
import {
  isValidSs58,
  ss58Encode,
  ss58Decode,
  ss58ToH160,
} from "@polkadot-apps/address";

// Validate an SS58 address
isValidSs58("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"); // true

// Decode to raw public key and network prefix
const { publicKey, prefix } = ss58Decode(
  "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
);

// Encode a public key back to SS58
const address = ss58Encode(publicKey, 0); // Polkadot mainnet prefix

// Convert an SS58 address to its H160 (EVM) representation
const evmAddress = ss58ToH160(
  "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
);
```

## SS58 Operations

### Validate

```typescript
import { isValidSs58 } from "@polkadot-apps/address";

isValidSs58("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"); // true
isValidSs58("not-an-address"); // false
```

### Decode and Encode

```typescript
import { ss58Decode, ss58Encode } from "@polkadot-apps/address";

const { publicKey, prefix } = ss58Decode(
  "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
);
// publicKey: Uint8Array(32), prefix: 42

const address = ss58Encode(publicKey); // generic Substrate (prefix 42)
const polkadotAddress = ss58Encode(publicKey, 0); // Polkadot mainnet
```

### Re-encode for a Different Network

```typescript
import {
  normalizeSs58,
  toGenericSs58,
  toPolkadotSs58,
} from "@polkadot-apps/address";

// Re-encode with an arbitrary prefix
const kusama = normalizeSs58(
  "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
  2,
);

// Convenience helpers
const generic = toGenericSs58(address); // prefix 42
const polkadot = toPolkadotSs58(address); // prefix 0
```

### Raw AccountId Bytes

```typescript
import { accountIdBytes, accountIdFromBytes } from "@polkadot-apps/address";

// Decode SS58 to 32-byte AccountId
const bytes = accountIdBytes(
  "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
);

// Encode 32-byte public key to SS58
const addr = accountIdFromBytes(bytes, 0);
```

## H160 / EVM Operations

### Validate

```typescript
import { isValidH160 } from "@polkadot-apps/address";

isValidH160("0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18"); // true
isValidH160("5Grwva..."); // false
```

### Derive H160 from a Public Key

`deriveH160` applies keccak256 to native Substrate public keys and strips the `0xEE` padding for EVM-derived accounts.

```typescript
import { deriveH160 } from "@polkadot-apps/address";

const evmAddress = deriveH160(publicKey);
// "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18"
```

### Convert Between SS58 and H160

```typescript
import { ss58ToH160, h160ToSs58, toH160 } from "@polkadot-apps/address";

// SS58 -> H160
const evm = ss58ToH160("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY");

// H160 -> SS58 (pads with 0xEE)
const substrate = h160ToSs58(
  "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
  0,
);

// Accept either format, always return H160
const h160 = toH160("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY");
const same = toH160("0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18");
```

## Display Utilities

### Truncate for UI

```typescript
import { truncateAddress } from "@polkadot-apps/address";

truncateAddress("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY");
// "5Grwva...utQY"

truncateAddress("0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18", 8, 6);
// "0x742d35...f2bD18"
```

### Compare Addresses

```typescript
import { addressesEqual } from "@polkadot-apps/address";

// Case-insensitive comparison for H160
addressesEqual(
  "0x742d35cc6634c0532925a3b844bc9e7595f2bd18",
  "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
); // true
```

## API

### SS58

| Function | Signature | Description |
|---|---|---|
| `isValidSs58` | `(address: string) => boolean` | Validate an SS58 address. |
| `ss58Decode` | `(address: string) => { publicKey: Uint8Array; prefix: number }` | Decode SS58 to public key and network prefix. |
| `ss58Encode` | `(publicKey: Uint8Array, prefix?: number) => SS58String` | Encode a public key to SS58. Default prefix is 42 (generic Substrate). |
| `normalizeSs58` | `(address: string, prefix?: number) => SS58String \| null` | Re-encode an SS58 address with a different prefix. Returns `null` on invalid input. |
| `toGenericSs58` | `(address: string) => SS58String \| null` | Convert to generic Substrate format (prefix 42). |
| `toPolkadotSs58` | `(address: string) => SS58String \| null` | Convert to Polkadot mainnet format (prefix 0). |
| `accountIdFromBytes` | `(publicKey: Uint8Array, prefix?: number) => SS58String` | Encode a 32-byte public key to SS58. |
| `accountIdBytes` | `(address: string) => Uint8Array` | Decode an SS58 address to a 32-byte AccountId. |

### H160 / EVM

| Function | Signature | Description |
|---|---|---|
| `deriveH160` | `(publicKey: Uint8Array) => string` | Derive an H160 EVM address from a public key. Uses keccak256 for native accounts; strips 0xEE padding for EVM-derived accounts. |
| `ss58ToH160` | `(address: string) => string` | Convert an SS58 address to H160. |
| `h160ToSs58` | `(evmAddress: string, prefix?: number) => SS58String` | Convert an H160 address to SS58. Pads with 0xEE. |
| `toH160` | `(address: string) => string` | Convert any address (SS58 or H160) to H160. |
| `isValidH160` | `(address: string) => boolean` | Validate an H160 address. |

### Display

| Function | Signature | Description |
|---|---|---|
| `truncateAddress` | `(address: string, startChars?: number, endChars?: number) => string` | Truncate an address for display. Defaults to 6 start characters and 4 end characters. |
| `addressesEqual` | `(a: string, b: string) => boolean` | Compare two addresses for equality. Case-insensitive for H160 addresses. |

## Types

```typescript
/** An SS58-encoded Substrate address. */
type SS58String = string;

/** A hex-encoded string (re-exported from polkadot-api). */
type HexString = string;
```

Both types are re-exported from `polkadot-api`.

## License

Apache-2.0
