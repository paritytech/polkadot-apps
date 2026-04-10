# @polkadot-apps/crypto

Cryptographic primitives for Polkadot apps -- symmetric encryption, key derivation, and NaCl operations.

## Install

```bash
pnpm add @polkadot-apps/crypto
```

No peer dependencies. This package bundles `@noble/ciphers`, `@noble/hashes`, and `tweetnacl`.

## Quick start

```typescript
import {
  xchachaEncrypt,
  xchachaDecrypt,
  randomBytes,
} from "@polkadot-apps/crypto";

const key = randomBytes(32);
const { ciphertext, nonce } = xchachaEncrypt(data, key);
const plaintext = xchachaDecrypt(ciphertext, key, nonce);
```

## Symmetric encryption

All symmetric functions accept a 32-byte key and return `{ ciphertext: Uint8Array, nonce: Uint8Array }` on encrypt. Text variants accept a `string` and return one on decrypt. Packed variants concatenate `nonce || ciphertext` into a single `Uint8Array`.

### Algorithm comparison

| Algorithm | Nonce size | Key size | Safe random-nonce limit | When to use |
|---|---|---|---|---|
| AES-256-GCM | 12 bytes | 32 bytes | ~2^32 messages per key | Hardware-accelerated environments, interop with Web Crypto |
| ChaCha20-Poly1305 | 12 bytes | 32 bytes | ~2^32 messages per key | Software-only environments, constant-time guarantees |
| XChaCha20-Poly1305 | 24 bytes | 32 bytes | ~2^96 messages per key | **Recommended default.** Safe for unlimited random nonces |

### AES-256-GCM

```typescript
import {
  aesGcmEncrypt,
  aesGcmDecrypt,
  aesGcmEncryptText,
  aesGcmDecryptText,
  aesGcmEncryptPacked,
  aesGcmDecryptPacked,
  randomBytes,
} from "@polkadot-apps/crypto";

const key = randomBytes(32);

// Binary
const { ciphertext, nonce } = aesGcmEncrypt(data, key);
const plain = aesGcmDecrypt(ciphertext, key, nonce);

// Text
const { ciphertext: ct, nonce: n } = aesGcmEncryptText("hello", key);
const str = aesGcmDecryptText(ct, key, n);

// Packed (nonce || ciphertext in one buffer)
const packed = aesGcmEncryptPacked(data, key);
const unpacked = aesGcmDecryptPacked(packed, key);
```

### ChaCha20-Poly1305

```typescript
import {
  chachaEncrypt,
  chachaDecrypt,
  chachaEncryptText,
  chachaDecryptText,
  randomBytes,
} from "@polkadot-apps/crypto";

const key = randomBytes(32);

const { ciphertext, nonce } = chachaEncrypt(data, key);
const plain = chachaDecrypt(ciphertext, key, nonce);

const { ciphertext: ct, nonce: n } = chachaEncryptText("hello", key);
const str = chachaDecryptText(ct, key, n);
```

### XChaCha20-Poly1305 (recommended)

The 24-byte nonce makes random nonce generation safe for virtually unlimited encryptions under the same key.

```typescript
import {
  xchachaEncrypt,
  xchachaDecrypt,
  xchachaEncryptText,
  xchachaDecryptText,
  xchachaEncryptPacked,
  xchachaDecryptPacked,
  randomBytes,
} from "@polkadot-apps/crypto";

const key = randomBytes(32);

// Binary
const { ciphertext, nonce } = xchachaEncrypt(data, key);
const plain = xchachaDecrypt(ciphertext, key, nonce);

// Text
const { ciphertext: ct, nonce: n } = xchachaEncryptText("hello", key);
const str = xchachaDecryptText(ct, key, n);

// Packed (nonce || ciphertext in one buffer)
const packed = xchachaEncryptPacked(data, key);
const unpacked = xchachaDecryptPacked(packed, key);
```

## Asymmetric encryption (NaCl)

### Sealed box (anonymous sender)

Uses an ephemeral keypair so the recipient cannot identify the sender. Output format: `ephemeralPubKey(32) || nonce(24) || ciphertext`.

```typescript
import { sealedBoxEncrypt, sealedBoxDecrypt, nacl } from "@polkadot-apps/crypto";

const recipient = nacl.box.keyPair();
const sealed = sealedBoxEncrypt(message, recipient.publicKey);
const plaintext = sealedBoxDecrypt(sealed, recipient.secretKey);
```

### Box (authenticated, both parties known)

Uses X25519 key agreement and XSalsa20-Poly1305 encryption. Output format: `nonce(24) || ciphertext`.

```typescript
import { boxEncrypt, boxDecrypt, nacl } from "@polkadot-apps/crypto";

const alice = nacl.box.keyPair();
const bob = nacl.box.keyPair();

const packed = boxEncrypt(message, bob.publicKey, alice.secretKey);
const plaintext = boxDecrypt(packed, alice.publicKey, bob.secretKey);
```

## Key derivation

HKDF-SHA256 (RFC 5869). `deriveKey` is a convenience wrapper that outputs 32 bytes. For custom output lengths or hash functions, use the re-exported `hkdf`, `extract`, and `expand` primitives directly.

```typescript
import { deriveKey, randomBytes } from "@polkadot-apps/crypto";

const masterKey = randomBytes(32);
const encryptionKey = deriveKey(masterKey, "myapp-v1", "document-encryption");
```

## Utilities

```typescript
import { randomBytes } from "@polkadot-apps/crypto";

const bytes = randomBytes(32);
```

> **Migration note:** `bytesToHex`, `hexToBytes`, `utf8ToBytes`, and `concatBytes` have moved to
> [`@polkadot-apps/utils`](../utils/README.md). Import them from there instead.

## API

### AES-256-GCM

| Function | Signature | Returns |
|---|---|---|
| `aesGcmEncrypt` | `(data: Uint8Array, key: Uint8Array)` | `{ ciphertext: Uint8Array, nonce: Uint8Array }` |
| `aesGcmDecrypt` | `(ciphertext: Uint8Array, key: Uint8Array, nonce: Uint8Array)` | `Uint8Array` |
| `aesGcmEncryptText` | `(plaintext: string, key: Uint8Array)` | `{ ciphertext: Uint8Array, nonce: Uint8Array }` |
| `aesGcmDecryptText` | `(ciphertext: Uint8Array, key: Uint8Array, nonce: Uint8Array)` | `string` |
| `aesGcmEncryptPacked` | `(data: Uint8Array, key: Uint8Array)` | `Uint8Array` |
| `aesGcmDecryptPacked` | `(packed: Uint8Array, key: Uint8Array)` | `Uint8Array` |

### ChaCha20-Poly1305

| Function | Signature | Returns |
|---|---|---|
| `chachaEncrypt` | `(data: Uint8Array, key: Uint8Array)` | `{ ciphertext: Uint8Array, nonce: Uint8Array }` |
| `chachaDecrypt` | `(ciphertext: Uint8Array, key: Uint8Array, nonce: Uint8Array)` | `Uint8Array` |
| `chachaEncryptText` | `(plaintext: string, key: Uint8Array)` | `{ ciphertext: Uint8Array, nonce: Uint8Array }` |
| `chachaDecryptText` | `(ciphertext: Uint8Array, key: Uint8Array, nonce: Uint8Array)` | `string` |

### XChaCha20-Poly1305

| Function | Signature | Returns |
|---|---|---|
| `xchachaEncrypt` | `(data: Uint8Array, key: Uint8Array)` | `{ ciphertext: Uint8Array, nonce: Uint8Array }` |
| `xchachaDecrypt` | `(ciphertext: Uint8Array, key: Uint8Array, nonce: Uint8Array)` | `Uint8Array` |
| `xchachaEncryptText` | `(plaintext: string, key: Uint8Array)` | `{ ciphertext: Uint8Array, nonce: Uint8Array }` |
| `xchachaDecryptText` | `(ciphertext: Uint8Array, key: Uint8Array, nonce: Uint8Array)` | `string` |
| `xchachaEncryptPacked` | `(data: Uint8Array, key: Uint8Array)` | `Uint8Array` |
| `xchachaDecryptPacked` | `(packed: Uint8Array, key: Uint8Array)` | `Uint8Array` |

### NaCl asymmetric

| Function | Signature | Returns |
|---|---|---|
| `sealedBoxEncrypt` | `(message: Uint8Array, recipientPublicKey: Uint8Array)` | `Uint8Array` |
| `sealedBoxDecrypt` | `(sealed: Uint8Array, recipientSecretKey: Uint8Array)` | `Uint8Array` |
| `boxEncrypt` | `(message: Uint8Array, recipientPublicKey: Uint8Array, senderSecretKey: Uint8Array)` | `Uint8Array` |
| `boxDecrypt` | `(packed: Uint8Array, senderPublicKey: Uint8Array, recipientSecretKey: Uint8Array)` | `Uint8Array` |
| `nacl` | Re-exported `tweetnacl` library | `typeof tweetnacl` |

### Key derivation

| Function | Signature | Returns |
|---|---|---|
| `deriveKey` | `(ikm: Uint8Array, salt: Uint8Array \| string, info: Uint8Array \| string)` | `Uint8Array` (32 bytes) |
| `hkdf` | Re-exported from `@noble/hashes/hkdf` | -- |
| `extract` | Re-exported from `@noble/hashes/hkdf` | -- |
| `expand` | Re-exported from `@noble/hashes/hkdf` | -- |

### Utilities

| Function | Signature | Returns |
|---|---|---|
| `randomBytes` | `(length: number)` | `Uint8Array` |

## Types

```typescript
type SymmetricAlgorithm =
  | "aes-256-gcm"
  | "chacha20-poly1305"
  | "xchacha20-poly1305";

type KemAlgorithm =
  | "x25519"
  | "ml-kem-768"         // post-quantum, future
  | "x25519-ml-kem-768"; // hybrid, future

interface EncryptedPayload {
  algorithm: SymmetricAlgorithm;
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  kem?: KemAlgorithm;
}
```

## License

Apache-2.0
