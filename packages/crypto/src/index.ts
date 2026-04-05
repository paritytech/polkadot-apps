/**
 * @polkadot-apps/crypto — Cryptographic primitives for the Polkadot app ecosystem.
 *
 * Provides symmetric encryption (AES-256-GCM, ChaCha20-Poly1305, XChaCha20-Poly1305),
 * key derivation (HKDF-SHA256), asymmetric encryption (NaCl box / sealed box),
 * and cryptographic random bytes. All functions are synchronous and framework-agnostic.
 *
 * @packageDocumentation
 */
export * from "./aes.js";
export * from "./chacha.js";
export * from "./hkdf.js";
export * from "./nacl.js";
export * from "./encoding.js";
export * from "./types.js";
