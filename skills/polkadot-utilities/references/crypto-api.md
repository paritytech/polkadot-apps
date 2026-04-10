# Crypto API Reference

Package: `@polkadot-apps/crypto`

## Table of Contents

- [AES-256-GCM](#aes-256-gcm)
  - [aesGcmEncrypt](#aesgcmencrypt)
  - [aesGcmDecrypt](#aesgcmdecrypt)
  - [aesGcmEncryptText](#aesgcmencrypttext)
  - [aesGcmDecryptText](#aesgcmdecrypttext)
  - [aesGcmEncryptPacked](#aesgcmencryptpacked)
  - [aesGcmDecryptPacked](#aesgcmdecryptpacked)
- [ChaCha20-Poly1305](#chacha20-poly1305)
  - [chachaEncrypt](#chachaencrypt)
  - [chachaDecrypt](#chachadecrypt)
  - [chachaEncryptText](#chachaencrypttext)
  - [chachaDecryptText](#chachadecrypttext)
- [XChaCha20-Poly1305](#xchacha20-poly1305)
  - [xchachaEncrypt](#xchachaencrypt)
  - [xchachaDecrypt](#xchaachadecrypt)
  - [xchachaEncryptText](#xchachaencrypttext)
  - [xchachaDecryptText](#xchachadecrypttext)
  - [xchachaEncryptPacked](#xchachaencryptpacked)
  - [xchachaDecryptPacked](#xchachadecryptpacked)
- [HKDF Key Derivation](#hkdf-key-derivation)
  - [deriveKey](#derivekey)
  - [hkdf, extract, expand](#hkdf-extract-expand)
- [NaCl Asymmetric Encryption](#nacl-asymmetric-encryption)
  - [sealedBoxEncrypt](#sealedboxencrypt)
  - [sealedBoxDecrypt](#sealedboxdecrypt)
  - [boxEncrypt](#boxencrypt)
  - [boxDecrypt](#boxdecrypt)
  - [nacl (re-export)](#nacl-re-export)
- [Encoding Utilities](#encoding-utilities)
  - [randomBytes](#randombytes)
  - [bytesToHex](#bytestohex)
  - [hexToBytes](#hextobytes)
  - [utf8ToBytes](#utf8tobytes)
  - [concatBytes](#concatbytes)
- [Types](#types)

---

## AES-256-GCM

### aesGcmEncrypt

Encrypt binary data with AES-256-GCM. Generates a random 12-byte nonce. Ciphertext includes the 16-byte GCM authentication tag.

```ts
function aesGcmEncrypt(
  data: Uint8Array,
  key: Uint8Array,
): { ciphertext: Uint8Array; nonce: Uint8Array }
```

**Parameters:**
- `data` - Binary data to encrypt.
- `key` - 32-byte AES-256 key.

**Returns:** Object with `ciphertext` and `nonce`.

**Throws:** If `key` is not exactly 32 bytes.

```ts
import { aesGcmEncrypt, aesGcmDecrypt, randomBytes } from "@polkadot-apps/crypto";

const key = randomBytes(32);
const { ciphertext, nonce } = aesGcmEncrypt(data, key);
const plaintext = aesGcmDecrypt(ciphertext, key, nonce);
```

---

### aesGcmDecrypt

Decrypt binary data with AES-256-GCM.

```ts
function aesGcmDecrypt(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
): Uint8Array
```

**Parameters:**
- `ciphertext` - Data to decrypt (includes 16-byte GCM auth tag).
- `key` - 32-byte AES-256 key.
- `nonce` - 12-byte nonce used during encryption.

**Returns:** Decrypted plaintext.

**Throws:** If `key` is not 32 bytes, or if decryption/authentication fails.

---

### aesGcmEncryptText

Encrypt a UTF-8 string with AES-256-GCM. Convenience wrapper that encodes the string to bytes before encrypting.

```ts
function aesGcmEncryptText(
  plaintext: string,
  key: Uint8Array,
): { ciphertext: Uint8Array; nonce: Uint8Array }
```

**Parameters:**
- `plaintext` - The string to encrypt.
- `key` - 32-byte AES-256 key.

**Returns:** Object with `ciphertext` and `nonce`.

**Throws:** If `key` is not exactly 32 bytes.

---

### aesGcmDecryptText

Decrypt AES-256-GCM ciphertext back to a UTF-8 string.

```ts
function aesGcmDecryptText(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
): string
```

**Parameters:**
- `ciphertext` - Data to decrypt.
- `key` - 32-byte AES-256 key.
- `nonce` - 12-byte nonce used during encryption.

**Returns:** Decrypted plaintext string.

**Throws:** If decryption or authentication fails.

```ts
import { aesGcmEncryptText, aesGcmDecryptText, randomBytes } from "@polkadot-apps/crypto";

const key = randomBytes(32);
const { ciphertext, nonce } = aesGcmEncryptText("hello world", key);
const text = aesGcmDecryptText(ciphertext, key, nonce); // "hello world"
```

---

### aesGcmEncryptPacked

Encrypt binary data with AES-256-GCM, returning a single packed buffer. Output format: `nonce(12) || ciphertext`.

```ts
function aesGcmEncryptPacked(data: Uint8Array, key: Uint8Array): Uint8Array
```

**Parameters:**
- `data` - Binary data to encrypt.
- `key` - 32-byte AES-256 key.

**Returns:** Single `Uint8Array` with nonce prepended to ciphertext.

**Throws:** If `key` is not exactly 32 bytes.

---

### aesGcmDecryptPacked

Decrypt a packed AES-256-GCM buffer. Input format: `nonce(12) || ciphertext`.

```ts
function aesGcmDecryptPacked(packed: Uint8Array, key: Uint8Array): Uint8Array
```

**Parameters:**
- `packed` - The packed buffer to decrypt.
- `key` - 32-byte AES-256 key.

**Returns:** Decrypted plaintext.

**Throws:** If packed data is too short, key is invalid, or authentication fails.

```ts
import { aesGcmEncryptPacked, aesGcmDecryptPacked, randomBytes } from "@polkadot-apps/crypto";

const key = randomBytes(32);
const packed = aesGcmEncryptPacked(data, key);
const plaintext = aesGcmDecryptPacked(packed, key);
```

---

## ChaCha20-Poly1305

12-byte nonce variant (RFC 8439). Safe for ~2^32 encryptions per key. For high-volume random-nonce use, prefer XChaCha20-Poly1305.

### chachaEncrypt

Encrypt binary data with ChaCha20-Poly1305.

```ts
function chachaEncrypt(
  data: Uint8Array,
  key: Uint8Array,
): { ciphertext: Uint8Array; nonce: Uint8Array }
```

**Parameters:**
- `data` - Binary data to encrypt.
- `key` - 32-byte encryption key.

**Returns:** Object with `ciphertext` (includes 16-byte Poly1305 tag) and 12-byte `nonce`.

**Throws:** If `key` is not exactly 32 bytes.

```ts
import { chachaEncrypt, chachaDecrypt, randomBytes } from "@polkadot-apps/crypto";

const key = randomBytes(32);
const { ciphertext, nonce } = chachaEncrypt(data, key);
const plaintext = chachaDecrypt(ciphertext, key, nonce);
```

---

### chachaDecrypt

Decrypt binary data with ChaCha20-Poly1305.

```ts
function chachaDecrypt(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
): Uint8Array
```

**Parameters:**
- `ciphertext` - Data to decrypt (includes 16-byte Poly1305 tag).
- `key` - 32-byte encryption key.
- `nonce` - 12-byte nonce used during encryption.

**Returns:** Decrypted plaintext.

**Throws:** If `key` is not 32 bytes, or if decryption/authentication fails.

---

### chachaEncryptText

Encrypt a UTF-8 string with ChaCha20-Poly1305.

```ts
function chachaEncryptText(
  plaintext: string,
  key: Uint8Array,
): { ciphertext: Uint8Array; nonce: Uint8Array }
```

---

### chachaDecryptText

Decrypt ChaCha20-Poly1305 ciphertext back to a UTF-8 string.

```ts
function chachaDecryptText(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
): string
```

---

## XChaCha20-Poly1305

24-byte nonce variant. **Recommended** symmetric cipher for most use cases due to negligible nonce collision probability (~2^96 nonce space).

### xchachaEncrypt

Encrypt binary data with XChaCha20-Poly1305.

```ts
function xchachaEncrypt(
  data: Uint8Array,
  key: Uint8Array,
): { ciphertext: Uint8Array; nonce: Uint8Array }
```

**Parameters:**
- `data` - Binary data to encrypt.
- `key` - 32-byte encryption key.

**Returns:** Object with `ciphertext` (includes 16-byte tag) and 24-byte `nonce`.

**Throws:** If `key` is not exactly 32 bytes.

```ts
import { xchachaEncrypt, xchachaDecrypt, randomBytes } from "@polkadot-apps/crypto";

const key = randomBytes(32);
const { ciphertext, nonce } = xchachaEncrypt(data, key);
const plaintext = xchachaDecrypt(ciphertext, key, nonce);
```

---

### xchachaDecrypt

Decrypt binary data with XChaCha20-Poly1305.

```ts
function xchachaDecrypt(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
): Uint8Array
```

**Parameters:**
- `ciphertext` - Data to decrypt (includes 16-byte Poly1305 tag).
- `key` - 32-byte encryption key.
- `nonce` - 24-byte nonce used during encryption.

**Returns:** Decrypted plaintext.

**Throws:** If `key` is not 32 bytes, or if decryption/authentication fails.

---

### xchachaEncryptText

Encrypt a UTF-8 string with XChaCha20-Poly1305.

```ts
function xchachaEncryptText(
  plaintext: string,
  key: Uint8Array,
): { ciphertext: Uint8Array; nonce: Uint8Array }
```

---

### xchachaDecryptText

Decrypt XChaCha20-Poly1305 ciphertext back to a UTF-8 string.

```ts
function xchachaDecryptText(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
): string
```

---

### xchachaEncryptPacked

Encrypt binary data with XChaCha20-Poly1305, returning a single packed buffer. Output format: `nonce(24) || ciphertext`.

```ts
function xchachaEncryptPacked(data: Uint8Array, key: Uint8Array): Uint8Array
```

---

### xchachaDecryptPacked

Decrypt a packed XChaCha20-Poly1305 buffer. Input format: `nonce(24) || ciphertext`.

```ts
function xchachaDecryptPacked(packed: Uint8Array, key: Uint8Array): Uint8Array
```

**Throws:** If packed data is too short, key is invalid, or authentication fails.

```ts
import { xchachaEncryptPacked, xchachaDecryptPacked, randomBytes } from "@polkadot-apps/crypto";

const key = randomBytes(32);
const packed = xchachaEncryptPacked(data, key);
const plaintext = xchachaDecryptPacked(packed, key);
```

---

## HKDF Key Derivation

### deriveKey

Derive a 32-byte key using HKDF-SHA256 (RFC 5869). Convenience wrapper fixed to SHA-256 and 32-byte output.

```ts
function deriveKey(
  ikm: Uint8Array,
  salt: Uint8Array | string,
  info: Uint8Array | string,
): Uint8Array
```

**Parameters:**
- `ikm` - Input keying material (e.g. a shared secret or master key).
- `salt` - Salt value (string or bytes). Use a unique, application-specific salt.
- `info` - Context/application-specific info string (string or bytes).

**Returns:** A 32-byte derived key.

```ts
import { deriveKey, randomBytes } from "@polkadot-apps/crypto";

const masterKey = randomBytes(32);
const encryptionKey = deriveKey(masterKey, "myapp-v1", "document-encryption");
const signingKey = deriveKey(masterKey, "myapp-v1", "document-signing");
// Different info strings produce different keys from the same master
```

---

### hkdf, extract, expand

Re-exported from `@noble/hashes/hkdf` for advanced use cases that need custom hash functions or output lengths.

```ts
export { hkdf, extract, expand } from "@noble/hashes/hkdf.js";
```

---

## NaCl Asymmetric Encryption

### sealedBoxEncrypt

Sealed box encrypt: uses an ephemeral keypair so the recipient cannot identify the sender. Output format: `ephemeralPubKey(32) || nonce(24) || ciphertext`.

```ts
function sealedBoxEncrypt(message: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array
```

**Parameters:**
- `message` - Plaintext bytes to encrypt.
- `recipientPublicKey` - Recipient's 32-byte Curve25519 public key.

**Returns:** Single `Uint8Array` containing the sealed message.

**Throws:** If encryption fails (e.g. invalid public key).

```ts
import { sealedBoxEncrypt, sealedBoxDecrypt } from "@polkadot-apps/crypto";
import nacl from "tweetnacl";

const recipient = nacl.box.keyPair();
const message = new TextEncoder().encode("secret message");
const sealed = sealedBoxEncrypt(message, recipient.publicKey);
const plaintext = sealedBoxDecrypt(sealed, recipient.secretKey);
```

---

### sealedBoxDecrypt

Sealed box decrypt: extract ephemeral public key and nonce, then open with recipient's secret key. Input format: `ephemeralPubKey(32) || nonce(24) || ciphertext`.

```ts
function sealedBoxDecrypt(sealed: Uint8Array, recipientSecretKey: Uint8Array): Uint8Array
```

**Parameters:**
- `sealed` - The sealed message produced by `sealedBoxEncrypt`.
- `recipientSecretKey` - Recipient's 32-byte Curve25519 secret key.

**Returns:** Decrypted plaintext bytes.

**Throws:** If sealed data is too short, or decryption/authentication fails.

---

### boxEncrypt

NaCl box encrypt: authenticated encryption where both sender and recipient are known. Uses X25519 key agreement and XSalsa20-Poly1305. Output format: `nonce(24) || ciphertext`.

```ts
function boxEncrypt(
  message: Uint8Array,
  recipientPublicKey: Uint8Array,
  senderSecretKey: Uint8Array,
): Uint8Array
```

**Parameters:**
- `message` - Plaintext bytes to encrypt.
- `recipientPublicKey` - Recipient's 32-byte Curve25519 public key.
- `senderSecretKey` - Sender's 32-byte Curve25519 secret key.

**Returns:** Single `Uint8Array` with nonce prepended to ciphertext.

**Throws:** If encryption fails.

```ts
import { boxEncrypt, boxDecrypt } from "@polkadot-apps/crypto";
import nacl from "tweetnacl";

const alice = nacl.box.keyPair();
const bob = nacl.box.keyPair();

const packed = boxEncrypt(message, bob.publicKey, alice.secretKey);
const plaintext = boxDecrypt(packed, alice.publicKey, bob.secretKey);
```

---

### boxDecrypt

NaCl box decrypt: authenticated decryption where both sender and recipient are known. Input format: `nonce(24) || ciphertext`.

```ts
function boxDecrypt(
  packed: Uint8Array,
  senderPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array,
): Uint8Array
```

**Parameters:**
- `packed` - The packed message produced by `boxEncrypt`.
- `senderPublicKey` - Sender's 32-byte Curve25519 public key.
- `recipientSecretKey` - Recipient's 32-byte Curve25519 secret key.

**Returns:** Decrypted plaintext bytes.

**Throws:** If packed data is too short, or decryption/authentication fails.

---

### nacl (re-export)

The full `tweetnacl` library is re-exported as a named export for keypair generation and other NaCl primitives.

```ts
export { default as nacl } from "tweetnacl";
```

```ts
import { nacl } from "@polkadot-apps/crypto";

const keyPair = nacl.box.keyPair();
const signKeyPair = nacl.sign.keyPair();
```

---

## Utilities

### randomBytes

Generate cryptographically secure random bytes.

```ts
function randomBytes(length: number): Uint8Array
```

```ts
import { randomBytes } from "@polkadot-apps/crypto";
const key = randomBytes(32);
```

> **Migration note:** `bytesToHex`, `hexToBytes`, `utf8ToBytes`, and `concatBytes` have moved to
> `@polkadot-apps/utils`. See the [Utils API reference](utils-api.md).

---

## Types

### SymmetricAlgorithm

```ts
type SymmetricAlgorithm = "aes-256-gcm" | "chacha20-poly1305" | "xchacha20-poly1305";
```

### KemAlgorithm

Key encapsulation mechanism identifiers. `"x25519"` is currently implemented. PQC types (`"ml-kem-768"`, `"x25519-ml-kem-768"`) are defined for forward compatibility.

```ts
type KemAlgorithm = "x25519" | "ml-kem-768" | "x25519-ml-kem-768";
```

### EncryptedPayload

Common encrypted payload envelope carrying algorithm metadata alongside ciphertext.

```ts
interface EncryptedPayload {
  algorithm: SymmetricAlgorithm;
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  kem?: KemAlgorithm;
}
```
