const NONCE_LENGTH = 12;

async function importKey(key: Uint8Array, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", key as Uint8Array<ArrayBuffer>, { name: "AES-GCM" }, false, [
        usage,
    ]);
}

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

export async function aesGcmEncryptText(
    plaintext: string,
    key: Uint8Array,
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
    return aesGcmEncrypt(new TextEncoder().encode(plaintext), key);
}

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

    test("unique nonces per encryption", async () => {
        const key = randomBytes(32);
        const a = await aesGcmEncryptText("test", key);
        const b = await aesGcmEncryptText("test", key);
        expect(a.nonce).not.toEqual(b.nonce);
    });
}
