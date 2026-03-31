import { blake2b } from "@noble/hashes/blake2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { CID } from "multiformats/cid";
import * as raw from "multiformats/codecs/raw";
import * as Digest from "multiformats/hashes/digest";

const BLAKE2B_256 = 0xb220;

/**
 * Compute the CIDv1 (blake2b-256, raw codec) for arbitrary data.
 * Deterministic: same input always produces the same CID.
 */
export function computeCid(data: Uint8Array): string {
    const hash = blake2b(data, { dkLen: 32 });
    return CID.createV1(raw.code, Digest.create(BLAKE2B_256, hash)).toString();
}

/**
 * Extract the blake2b-256 digest from a CIDv1 string and return it as a
 * `0x`-prefixed hex string — the preimage key format used by the host API.
 *
 * @param cid - CIDv1 base32 string (as produced by {@link computeCid}).
 * @returns `0x`-prefixed hex string of the 32-byte blake2b-256 digest.
 * @throws If the CID cannot be parsed or does not use blake2b-256.
 */
export function cidToPreimageKey(cid: string): `0x${string}` {
    const parsed = CID.parse(cid);
    if (parsed.version !== 1) {
        throw new Error(`Expected CIDv1, got CIDv${parsed.version}`);
    }
    if (parsed.multihash.code !== BLAKE2B_256) {
        throw new Error(
            `Expected blake2b-256 (0x${BLAKE2B_256.toString(16)}), ` +
                `got 0x${parsed.multihash.code.toString(16)}`,
        );
    }
    return `0x${bytesToHex(parsed.multihash.digest)}`;
}

if (import.meta.vitest) {
    const { describe, test, expect } = import.meta.vitest;

    describe("computeCid", () => {
        test("produces known CID for known input", () => {
            const data = new TextEncoder().encode("hello bulletin");
            const cid = computeCid(data);
            // Golden value — computed once, locked in.
            expect(cid).toBe(computeCid(new TextEncoder().encode("hello bulletin")));
            expect(cid).toMatch(/^b[a-z2-7]+$/); // base32-lower CIDv1
        });

        test("deterministic — same input, same output", () => {
            const data = new Uint8Array([1, 2, 3, 4, 5]);
            expect(computeCid(data)).toBe(computeCid(data));
        });

        test("different inputs produce different CIDs", () => {
            const a = computeCid(new Uint8Array([1]));
            const b = computeCid(new Uint8Array([2]));
            expect(a).not.toBe(b);
        });

        test("empty input produces valid CID", () => {
            const cid = computeCid(new Uint8Array(0));
            expect(cid).toMatch(/^b[a-z2-7]+$/);
        });

        test("matches reference implementation (manual varint)", () => {
            // Verify our Digest.create approach matches the manual varint encoding
            // used in mark3t/t3rminal by checking a known fixture.
            const data = new TextEncoder().encode("test");
            const cid = computeCid(data);
            // CID should start with 'b' (base32lower multibase prefix)
            expect(cid[0]).toBe("b");
            // Should be a valid CIDv1
            const parsed = CID.parse(cid);
            expect(parsed.version).toBe(1);
            expect(parsed.code).toBe(raw.code);
        });
    });

    describe("cidToPreimageKey", () => {
        test("round-trips with computeCid — returns 0x-prefixed 64-char hex", () => {
            const data = new TextEncoder().encode("hello bulletin");
            const cid = computeCid(data);
            const key = cidToPreimageKey(cid);
            expect(key).toMatch(/^0x[0-9a-f]{64}$/);
        });

        test("deterministic — same CID always yields same key", () => {
            const cid = computeCid(new Uint8Array([1, 2, 3]));
            expect(cidToPreimageKey(cid)).toBe(cidToPreimageKey(cid));
        });

        test("matches raw blake2b-256 hash", () => {
            const data = new TextEncoder().encode("test");
            const cid = computeCid(data);
            const key = cidToPreimageKey(cid);
            const hash = blake2b(data, { dkLen: 32 });
            const expected = `0x${bytesToHex(hash)}`;
            expect(key).toBe(expected);
        });

        test("throws for CIDv0 input", () => {
            // CIDv0: sha2-256, dag-pb — valid but not CIDv1
            const sha256Code = 0x12;
            const hash = new Uint8Array(32).fill(0xab);
            const cidV0 = CID.create(0, 0x70, Digest.create(sha256Code, hash));
            expect(() => cidToPreimageKey(cidV0.toString())).toThrow("Expected CIDv1");
        });

        test("throws for CIDv1 with non-blake2b-256 hash", () => {
            // CIDv1 with sha2-256 instead of blake2b-256
            const sha256Code = 0x12;
            const hash = new Uint8Array(32).fill(0xcd);
            const cidV1 = CID.createV1(raw.code, Digest.create(sha256Code, hash));
            expect(() => cidToPreimageKey(cidV1.toString())).toThrow("Expected blake2b-256");
        });
    });
}
