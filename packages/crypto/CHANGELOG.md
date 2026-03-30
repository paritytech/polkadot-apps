# @polkadot-apps/crypto

## 0.3.1

### Patch Changes

- 27019c9: fix: migrate npm publishing to npm_publish_automation dispatch workflow

## 0.3.0

### Minor Changes

- d404b4e: feat: add ChaCha20-Poly1305/XChaCha20-Poly1305 symmetric encryption, NaCl box (identified sender), packed AES-GCM variants, and PQC-ready algorithm types

  BREAKING: AES-GCM functions are now synchronous (migrated from Web Crypto API to @noble/ciphers). Drop `await` from all `aesGcm*` calls.

  - Add `chacha.ts` with `chachaEncrypt`/`chachaDecrypt`, `xchachaEncrypt`/`xchachaDecrypt`, and packed XChaCha20 variants
  - Add `aesGcmEncryptPacked`/`aesGcmDecryptPacked` (nonce-prepended format matching triangle-js-sdks convention)
  - Add `boxEncrypt`/`boxDecrypt` for NaCl box with identified sender
  - Add `types.ts` with `SymmetricAlgorithm`, `KemAlgorithm`, and `EncryptedPayload` types for forward PQC compatibility
  - Improve JSDoc on all exports with `@param`, `@returns`, `@throws`, and `@example` tags
  - Expand test suite from 10 to 31 tests including RFC 5869 HKDF test vector

## 0.2.0

### Minor Changes

- 62a0051: Implement crypto primitives: AES-256-GCM, HKDF-SHA256 deriveKey, NaCl sealed box, and encoding utilities

## 0.1.3

### Patch Changes

- 8adfb60: test release

## 0.1.2

### Patch Changes

- b1cb3f1: test release

## 0.1.1

### Patch Changes

- 5de5276: Initial skeleton release
