---
"@polkadot-apps/crypto": minor
---

feat: add ChaCha20-Poly1305/XChaCha20-Poly1305 symmetric encryption, NaCl box (identified sender), packed AES-GCM variants, and PQC-ready algorithm types

BREAKING: AES-GCM functions are now synchronous (migrated from Web Crypto API to @noble/ciphers). Drop `await` from all `aesGcm*` calls.

- Add `chacha.ts` with `chachaEncrypt`/`chachaDecrypt`, `xchachaEncrypt`/`xchachaDecrypt`, and packed XChaCha20 variants
- Add `aesGcmEncryptPacked`/`aesGcmDecryptPacked` (nonce-prepended format matching triangle-js-sdks convention)
- Add `boxEncrypt`/`boxDecrypt` for NaCl box with identified sender
- Add `types.ts` with `SymmetricAlgorithm`, `KemAlgorithm`, and `EncryptedPayload` types for forward PQC compatibility
- Improve JSDoc on all exports with `@param`, `@returns`, `@throws`, and `@example` tags
- Expand test suite from 10 to 31 tests including RFC 5869 HKDF test vector
