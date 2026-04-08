/**
 * Cryptographic primitives for the SSO handshake protocol.
 *
 * - P256 ECDH for key exchange
 * - Blake2b keyed hash (khash) for topic derivation
 * - AES key derivation via HKDF-SHA256
 *
 * References:
 * - papp-terminal/src/crypto/p256.rs
 * - papp-terminal/src/crypto/blake2.rs
 * - papp-terminal/src/crypto/encryption.rs
 * - triangle-js-sdks/packages/host-papp/src/crypto.ts
 */
import { p256 } from "@noble/curves/p256";
import { blake2b } from "@noble/hashes/blake2.js";
import { deriveKey } from "@polkadot-apps/crypto";

/**
 * Create a P256 secret key from Sr25519 mini secret.
 *
 * Uses `p256.keygen(seed)` which internally calls `mapHashToField`
 * to convert a 48-byte seed to a valid P256 scalar.
 *
 * Reference: triangle-js-sdks/packages/host-papp/src/crypto.ts lines 73-79
 */
export function createEncrSecret(miniSecret: Uint8Array): Uint8Array {
    const seed = new Uint8Array(48);
    seed.set(miniSecret.subarray(0, 32));
    // bytes 32..48 remain zero, matching the JS SDK convention
    const { secretKey } = p256.keygen(seed);
    return secretKey;
}

/** Get the uncompressed P256 public key (65 bytes: 04 || x || y). */
export function getEncrPublicKey(secretKey: Uint8Array): Uint8Array {
    return p256.getPublicKey(secretKey, false);
}

/** P256 ECDH shared secret (x-coordinate, 32 bytes). */
export function createSharedSecret(secretKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
    return p256.getSharedSecret(secretKey, publicKey, false).slice(1, 33);
}

/** Blake2b-256 keyed hash, matching the JS SDK's `khash(secret, message)`. */
export function khash(secret: Uint8Array, message: Uint8Array): Uint8Array {
    return blake2b(message, { dkLen: 32, key: secret });
}

/**
 * Derive the statement store topic for the handshake.
 *
 * Topic = khash(account_id, encr_public_key || "topic")
 */
export function handshakeTopic(accountId: Uint8Array, encrPublicKey: Uint8Array): Uint8Array {
    const message = new Uint8Array(encrPublicKey.length + 5);
    message.set(encrPublicKey);
    message.set(new TextEncoder().encode("topic"), encrPublicKey.length);
    return khash(accountId, message);
}

if (import.meta.vitest) {
    const { describe, test, expect } = import.meta.vitest;
    describe("P256 key generation", () => {
        test("createEncrSecret produces valid secret key", () => {
            const miniSecret = new Uint8Array(32).fill(0x42);
            const sk = createEncrSecret(miniSecret);
            expect(sk.length).toBe(32);
        });

        test("getEncrPublicKey returns 65-byte uncompressed key", () => {
            const miniSecret = new Uint8Array(32).fill(0x42);
            const sk = createEncrSecret(miniSecret);
            const pk = getEncrPublicKey(sk);
            expect(pk.length).toBe(65);
            expect(pk[0]).toBe(0x04); // uncompressed prefix
        });

        test("ECDH produces same shared secret from both sides", () => {
            const sk1 = createEncrSecret(new Uint8Array(32).fill(1));
            const sk2 = createEncrSecret(new Uint8Array(32).fill(2));
            const pk1 = getEncrPublicKey(sk1);
            const pk2 = getEncrPublicKey(sk2);

            const shared12 = createSharedSecret(sk1, pk2);
            const shared21 = createSharedSecret(sk2, pk1);
            expect(shared12).toEqual(shared21);
            expect(shared12.length).toBe(32);
        });
    });

    describe("khash", () => {
        test("is deterministic", () => {
            const secret = new Uint8Array(32).fill(0);
            const message = new TextEncoder().encode("hello");
            const r1 = khash(secret, message);
            const r2 = khash(secret, message);
            expect(r1).toEqual(r2);
            expect(r1.length).toBe(32);
        });

        test("different inputs produce different outputs", () => {
            const secret = new Uint8Array(32).fill(1);
            const r1 = khash(secret, new TextEncoder().encode("hello"));
            const r2 = khash(secret, new TextEncoder().encode("world"));
            expect(r1).not.toEqual(r2);
        });
    });

    describe("handshakeTopic", () => {
        test("is deterministic", () => {
            const accountId = new Uint8Array(32).fill(1);
            const encrPub = new Uint8Array(65).fill(2);
            const t1 = handshakeTopic(accountId, encrPub);
            const t2 = handshakeTopic(accountId, encrPub);
            expect(t1).toEqual(t2);
        });

        test("different keys produce different topics", () => {
            const accountId = new Uint8Array(32).fill(1);
            const encrPub1 = new Uint8Array(65).fill(2);
            const encrPub2 = new Uint8Array(65).fill(3);
            const t1 = handshakeTopic(accountId, encrPub1);
            const t2 = handshakeTopic(accountId, encrPub2);
            expect(t1).not.toEqual(t2);
        });
    });

}
