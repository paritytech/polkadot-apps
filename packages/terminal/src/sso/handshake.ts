/**
 * SCALE codec for the SSO handshake protocol.
 *
 * Matches the Rust implementation in papp-terminal/src/scale/handshake.rs
 * and the TypeScript SDK in triangle-js-sdks/packages/host-papp/src/sso/auth/scale/handshake.ts.
 *
 * Wire format for HandshakeData::V1:
 *   [0x00] [sr25519_pub: 32 bytes] [p256_pub: 65 bytes] [metadata: SCALE string]
 *        + [hostVersion: Option<string>] [osType: Option<string>] [osVersion: Option<string>]
 *
 * Wire format for HandshakeResponsePayload::V1:
 *   [0x00] [encrypted: SCALE Vec<u8>] [tmp_key: 65 bytes]
 *
 * Wire format for HandshakeResponseSensitiveData:
 *   [encr_public_key: 65 bytes] [account_id: 32 bytes]
 */

/** Encode a SCALE compact integer (supports values up to 2^30 - 1). */
function encodeCompact(value: number): Uint8Array {
    if (value < 64) return new Uint8Array([value << 2]);
    if (value < 0x4000) return new Uint8Array([(value << 2) | 1, value >> 6]);
    if (value < 0x40000000) {
        return new Uint8Array([(value << 2) | 2, value >> 6, value >> 14, value >> 22]);
    }
    throw new Error(`Value too large for compact encoding: ${value}`);
}

/** Decode a SCALE compact integer. Returns [value, bytesConsumed]. */
function decodeCompact(bytes: Uint8Array, offset: number): [number, number] {
    const mode = bytes[offset] & 0x03;
    if (mode === 0) return [bytes[offset] >> 2, 1];
    if (mode === 1) {
        return [((bytes[offset] | (bytes[offset + 1] << 8)) >> 2) & 0x3fff, 2];
    }
    if (mode === 2) {
        const val =
            (bytes[offset] |
                (bytes[offset + 1] << 8) |
                (bytes[offset + 2] << 16) |
                (bytes[offset + 3] << 24)) >>>
            2;
        return [val, 4];
    }
    throw new Error("Big-integer compact encoding not supported");
}

/**
 * SCALE-encode a HandshakeData::V1 payload.
 *
 * Format: variant(0) + sr25519_pub(32) + p256_pub(65) + SCALE_string(metadata)
 *       + Option<string>(hostVersion) + Option<string>(osType) + Option<string>(osVersion)
 *
 * The three optional fields must be present (as None = 0x00) to match the SDK's
 * HandshakeData V1 struct definition. Without them, the wallet's SCALE decoder
 * fails at end-of-bytes and silently discards the handshake.
 */
export function encodeHandshakeData(
    sr25519PublicKey: Uint8Array,
    p256PublicKey: Uint8Array,
    metadata: string,
    options?: { hostVersion?: string; osType?: string; osVersion?: string },
): Uint8Array {
    const metadataBytes = new TextEncoder().encode(metadata);
    const lengthPrefix = encodeCompact(metadataBytes.length);

    const optFields = [options?.hostVersion, options?.osType, options?.osVersion].map(
        encodeOptionalString,
    );
    const optSize = optFields.reduce((sum, f) => sum + f.length, 0);

    // 1 (variant) + 32 (sr25519) + 65 (p256) + compact_len + metadata_utf8 + optional fields
    const result = new Uint8Array(1 + 32 + 65 + lengthPrefix.length + metadataBytes.length + optSize);
    let offset = 0;

    result[offset++] = 0; // variant index: V1
    result.set(sr25519PublicKey, offset);
    offset += 32;
    result.set(p256PublicKey, offset);
    offset += 65;
    result.set(lengthPrefix, offset);
    offset += lengthPrefix.length;
    result.set(metadataBytes, offset);
    offset += metadataBytes.length;
    for (const field of optFields) {
        result.set(field, offset);
        offset += field.length;
    }

    return result;
}

/** SCALE-encode an Option<String>: None = [0x00], Some(s) = [0x01, compact_len, utf8...] */
function encodeOptionalString(value: string | undefined): Uint8Array {
    if (value == null) return new Uint8Array([0]);
    const utf8 = new TextEncoder().encode(value);
    const len = encodeCompact(utf8.length);
    const result = new Uint8Array(1 + len.length + utf8.length);
    result[0] = 1; // Some
    result.set(len, 1);
    result.set(utf8, 1 + len.length);
    return result;
}

/** Decoded handshake response from the wallet. */
export interface HandshakeResponse {
    /** AES-256-GCM encrypted blob (nonce || ciphertext || tag). */
    encrypted: Uint8Array;
    /** Ephemeral P256 public key (65 bytes, uncompressed). */
    tmpKey: Uint8Array;
}

/**
 * SCALE-decode a HandshakeResponsePayload::V1.
 *
 * Format: variant(0) + SCALE_bytes(encrypted) + fixed_65(tmp_key)
 */
export function decodeHandshakeResponse(data: Uint8Array): HandshakeResponse {
    let offset = 0;

    const variant = data[offset++];
    if (variant !== 0) throw new Error(`Unsupported HandshakeResponsePayload variant: ${variant}`);

    // Decode encrypted: SCALE Vec<u8> (compact length + bytes)
    const [encLen, encLenSize] = decodeCompact(data, offset);
    offset += encLenSize;
    const encrypted = data.slice(offset, offset + encLen);
    offset += encLen;

    // Decode tmp_key: fixed 65 bytes
    const tmpKey = data.slice(offset, offset + 65);

    return { encrypted, tmpKey };
}

/** Decoded sensitive data from the handshake response. */
export interface HandshakeSensitiveData {
    /** Remote party's P256 public key (65 bytes). */
    encrPublicKey: Uint8Array;
    /** Remote party's account ID (32 bytes). */
    accountId: Uint8Array;
}

/**
 * Decode HandshakeResponseSensitiveData.
 *
 * Format: encr_public_key(65) + account_id(32)
 */
export function decodeSensitiveData(data: Uint8Array): HandshakeSensitiveData {
    return {
        encrPublicKey: data.slice(0, 65),
        accountId: data.slice(65, 97),
    };
}

if (import.meta.vitest) {
    const { describe, test, expect } = import.meta.vitest;

    describe("encodeHandshakeData", () => {
        test("produces correct wire format with None optional fields", () => {
            const sr25519 = new Uint8Array(32).fill(0xaa);
            const p256 = new Uint8Array(65).fill(0xbb);
            const encoded = encodeHandshakeData(sr25519, p256, "hi");

            expect(encoded[0]).toBe(0); // variant
            expect(encoded.subarray(1, 33)).toEqual(sr25519);
            expect(encoded.subarray(33, 98)).toEqual(p256);
            expect(encoded[98]).toBe(8); // SCALE compact: 2 * 4 = 8
            expect(encoded.subarray(99, 101)).toEqual(new TextEncoder().encode("hi"));
            // Three trailing None bytes for hostVersion, osType, osVersion
            expect(encoded[101]).toBe(0); // hostVersion: None
            expect(encoded[102]).toBe(0); // osType: None
            expect(encoded[103]).toBe(0); // osVersion: None
            expect(encoded.length).toBe(104);
        });

        test("encodes Some optional fields", () => {
            const sr25519 = new Uint8Array(32).fill(0xaa);
            const p256 = new Uint8Array(65).fill(0xbb);
            const encoded = encodeHandshakeData(sr25519, p256, "hi", {
                hostVersion: "1.0",
                osType: "linux",
            });

            // After metadata "hi" at offset 101:
            // hostVersion: Some("1.0") = 0x01 + compact(3) + "1.0"
            expect(encoded[101]).toBe(1); // Some
            expect(encoded[102]).toBe(3 << 2); // compact(3) = 12
            expect(encoded.subarray(103, 106)).toEqual(new TextEncoder().encode("1.0"));
            // osType: Some("linux") = 0x01 + compact(5) + "linux"
            expect(encoded[106]).toBe(1); // Some
            expect(encoded[107]).toBe(5 << 2); // compact(5) = 20
            expect(encoded.subarray(108, 113)).toEqual(new TextEncoder().encode("linux"));
            // osVersion: None
            expect(encoded[113]).toBe(0);
            expect(encoded.length).toBe(114);
        });
    });

    describe("decodeHandshakeResponse", () => {
        test("round-trips with manual encoding", () => {
            const encrypted = new Uint8Array([1, 2, 3, 4, 5]);
            const tmpKey = new Uint8Array(65).fill(0xff);

            // Manual encode: variant(0) + compact_len(5) + encrypted(5) + tmpKey(65)
            const buf = new Uint8Array(1 + 1 + 5 + 65);
            buf[0] = 0; // variant
            buf[1] = 5 << 2; // compact encoding of 5
            buf.set(encrypted, 2);
            buf.set(tmpKey, 7);

            const decoded = decodeHandshakeResponse(buf);
            expect(decoded.encrypted).toEqual(encrypted);
            expect(decoded.tmpKey).toEqual(tmpKey);
        });
    });

    describe("decodeSensitiveData", () => {
        test("extracts key and account ID", () => {
            const data = new Uint8Array(97);
            data.fill(0xaa, 0, 65);
            data.fill(0xbb, 65, 97);

            const decoded = decodeSensitiveData(data);
            expect(decoded.encrPublicKey).toEqual(new Uint8Array(65).fill(0xaa));
            expect(decoded.accountId).toEqual(new Uint8Array(32).fill(0xbb));
        });
    });

    describe("SCALE compact encoding", () => {
        test("encodes small values (mode 0)", () => {
            expect(encodeCompact(0)).toEqual(new Uint8Array([0]));
            expect(encodeCompact(1)).toEqual(new Uint8Array([4]));
            expect(encodeCompact(63)).toEqual(new Uint8Array([252]));
        });

        test("round-trips through decode", () => {
            for (const val of [0, 1, 42, 63, 64, 100, 1000, 16383, 16384, 100000]) {
                const encoded = encodeCompact(val);
                const [decoded] = decodeCompact(encoded, 0);
                expect(decoded).toBe(val);
            }
        });
    });
}
