import nacl from "tweetnacl";

export { default as nacl } from "tweetnacl";

const PUBKEY_LEN = 32;
const NONCE_LEN = 24;
const OVERHEAD = PUBKEY_LEN + NONCE_LEN;

/**
 * Sealed box encrypt: uses an ephemeral keypair so the recipient cannot identify the sender.
 * Output format: ephemeralPubKey(32) || nonce(24) || ciphertext
 */
export function sealedBoxEncrypt(message: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array {
    const ephemeral = nacl.box.keyPair();
    const nonce = nacl.randomBytes(NONCE_LEN);

    const encrypted = nacl.box(message, nonce, recipientPublicKey, ephemeral.secretKey);
    if (!encrypted) {
        throw new Error("Encryption failed");
    }

    const result = new Uint8Array(OVERHEAD + encrypted.length);
    result.set(ephemeral.publicKey, 0);
    result.set(nonce, PUBKEY_LEN);
    result.set(encrypted, OVERHEAD);

    return result;
}

/**
 * Sealed box decrypt: extract ephemeral public key and nonce, then open with recipient's secret key.
 * Input format: ephemeralPubKey(32) || nonce(24) || ciphertext
 */
export function sealedBoxDecrypt(sealed: Uint8Array, recipientSecretKey: Uint8Array): Uint8Array {
    if (sealed.length < OVERHEAD + nacl.box.overheadLength) {
        throw new Error("Sealed data too short");
    }

    const ephemeralPubKey = sealed.subarray(0, PUBKEY_LEN);
    const nonce = sealed.subarray(PUBKEY_LEN, OVERHEAD);
    const ciphertext = sealed.subarray(OVERHEAD);

    const decrypted = nacl.box.open(ciphertext, nonce, ephemeralPubKey, recipientSecretKey);
    if (!decrypted) {
        throw new Error("Decryption failed - invalid key or corrupted data");
    }

    return decrypted;
}

if (import.meta.vitest) {
    const { test, expect } = import.meta.vitest;

    test("sealed box round-trip", () => {
        const recipient = nacl.box.keyPair();
        const message = new TextEncoder().encode("hello sealed box");
        const sealed = sealedBoxEncrypt(message, recipient.publicKey);
        const decrypted = sealedBoxDecrypt(sealed, recipient.secretKey);
        expect(new TextDecoder().decode(decrypted)).toBe("hello sealed box");
    });

    test("sealed box wrong key fails", () => {
        const recipient = nacl.box.keyPair();
        const wrongRecipient = nacl.box.keyPair();
        const message = new TextEncoder().encode("secret");
        const sealed = sealedBoxEncrypt(message, recipient.publicKey);
        expect(() => sealedBoxDecrypt(sealed, wrongRecipient.secretKey)).toThrow();
    });

    test("sealed box rejects truncated data", () => {
        expect(() => sealedBoxDecrypt(new Uint8Array(10), nacl.box.keyPair().secretKey)).toThrow(
            "Sealed data too short",
        );
    });
}
