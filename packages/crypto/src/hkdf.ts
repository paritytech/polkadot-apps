import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

export { hkdf, extract, expand } from "@noble/hashes/hkdf.js";

export function deriveKey(
    ikm: Uint8Array,
    salt: Uint8Array | string,
    info: Uint8Array | string,
): Uint8Array {
    const saltBytes = typeof salt === "string" ? new TextEncoder().encode(salt) : salt;
    const infoBytes = typeof info === "string" ? new TextEncoder().encode(info) : info;
    return hkdf(sha256, ikm, saltBytes, infoBytes, 32);
}

if (import.meta.vitest) {
    const { test, expect } = import.meta.vitest;

    test("deriveKey is deterministic with 32-byte output", () => {
        const ikm = new Uint8Array(32).fill(0xab);
        const a = deriveKey(ikm, "salt", "info");
        const b = deriveKey(ikm, "salt", "info");
        expect(a).toEqual(b);
        expect(a.length).toBe(32);
    });

    test("deriveKey accepts string and Uint8Array params", () => {
        const ikm = new Uint8Array(32).fill(0xcd);
        const saltBytes = new TextEncoder().encode("salt");
        const infoBytes = new TextEncoder().encode("info");
        const fromStrings = deriveKey(ikm, "salt", "info");
        const fromBytes = deriveKey(ikm, saltBytes, infoBytes);
        expect(fromStrings).toEqual(fromBytes);
    });
}
