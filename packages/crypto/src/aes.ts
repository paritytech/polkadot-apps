const NONCE_LENGTH = 12;

const AES_KEY_LENGTH = 32;

async function importKey(key: Uint8Array, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
    if (key.length !== AES_KEY_LENGTH) {
        throw new Error(`AES-256-GCM requires a 32-byte key, got ${key.length}`);
    }
    return crypto.subtle.importKey(
        "raw",
        key as Uint8Array<ArrayBuffer>,
        { name: "AES-GCM" },
        false,
        [usage],
    );
}

/**
 * Encrypt binary data with AES-256-GCM.
 * Generates a random 12-byte nonce.
 */
export async function aesGcmEncrypt(
    data: Uint8Array,
    key: Uint8Array,
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
    const imported = await importKey(key, "encrypt");
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce },
        imported,
        data as Uint8Array<ArrayBuffer>,
    );
    return { ciphertext: new Uint8Array(ciphertext), nonce };
}

/**
 * Decrypt binary data with AES-256-GCM.
 */
export async function aesGcmDecrypt(
    ciphertext: Uint8Array,
    key: Uint8Array,
    nonce: Uint8Array,
): Promise<Uint8Array> {
    const imported = await importKey(key, "decrypt");
    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce as Uint8Array<ArrayBuffer> },
        imported,
        ciphertext as Uint8Array<ArrayBuffer>,
    );
    return new Uint8Array(plaintext);
}

/**
 * Encrypt a string with AES-256-GCM.
 * Handles UTF-8 encoding.
 */
export async function aesGcmEncryptText(
    plaintext: string,
    key: Uint8Array,
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
    return aesGcmEncrypt(new TextEncoder().encode(plaintext), key);
}

/**
 * Decrypt to a string with AES-256-GCM.
 * Handles UTF-8 decoding.
 */
export async function aesGcmDecryptText(
    ciphertext: Uint8Array,
    key: Uint8Array,
    nonce: Uint8Array,
): Promise<string> {
    const data = await aesGcmDecrypt(ciphertext, key, nonce);
    return new TextDecoder().decode(data);
}

if (import.meta.vitest) {
    const { test, expect } = import.meta.vitest;
    const { randomBytes } = await import("@noble/hashes/utils.js");

    test("text round-trip", async () => {
        const key = randomBytes(32);
        const message = "hello world";
        const { ciphertext, nonce } = await aesGcmEncryptText(message, key);
        const decrypted = await aesGcmDecryptText(ciphertext, key, nonce);
        expect(decrypted).toBe(message);
    });

    test("binary round-trip", async () => {
        const key = randomBytes(32);
        const data = randomBytes(64);
        const { ciphertext, nonce } = await aesGcmEncrypt(data, key);
        const decrypted = await aesGcmDecrypt(ciphertext, key, nonce);
        expect(decrypted).toEqual(data);
    });

    test("wrong key fails", async () => {
        const key = randomBytes(32);
        const wrongKey = randomBytes(32);
        const { ciphertext, nonce } = await aesGcmEncryptText("secret", key);
        await expect(aesGcmDecryptText(ciphertext, wrongKey, nonce)).rejects.toThrow();
    });

    test("rejects non-32-byte key", async () => {
        await expect(aesGcmEncryptText("test", randomBytes(16))).rejects.toThrow("32-byte key");
        await expect(aesGcmEncryptText("test", randomBytes(64))).rejects.toThrow("32-byte key");
    });

    test("unique nonces per encryption", async () => {
        const key = randomBytes(32);
        const a = await aesGcmEncryptText("test", key);
        const b = await aesGcmEncryptText("test", key);
        expect(a.nonce).not.toEqual(b.nonce);
    });
}
