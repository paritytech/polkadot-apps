import { StatementDataTooLargeError, StatementEncodingError } from "./errors.js";
import type { DecodedStatement, StatementFields } from "./types.js";
import { MAX_STATEMENT_SIZE } from "./types.js";

// ============================================================================
// Internal SCALE Helpers
//
// These are statement-format-specific SCALE primitives (~60 lines). While
// @polkadot-api/substrate-bindings exists in the catalog, it doesn't expose
// simple compact/u64 encode/decode in a convenient form for our use case.
// If a second consumer needs these, extract to a shared @polkadot-apps/scale.
// ============================================================================

/**
 * Encode an integer using SCALE compact encoding.
 *
 * Supports values up to 2^30 - 1 (mode 0–2).
 * @see https://docs.substrate.io/reference/scale-codec/
 */
function encodeCompact(value: number): Uint8Array {
    if (value < 0) {
        throw new StatementEncodingError(`Negative value in compact encoding: ${value}`);
    }
    if (value < 64) {
        return new Uint8Array([value << 2]);
    }
    if (value < 0x4000) {
        return new Uint8Array([(value << 2) | 1, value >> 6]);
    }
    if (value < 0x40000000) {
        return new Uint8Array([(value << 2) | 2, value >> 6, value >> 14, value >> 22]);
    }
    throw new StatementEncodingError(`Value too large for compact encoding: ${value}`);
}

/**
 * Decode a SCALE compact-encoded integer.
 *
 * @returns A tuple of [decodedValue, bytesConsumed].
 */
function decodeCompact(bytes: Uint8Array, offset: number): [number, number] {
    if (offset >= bytes.length) {
        throw new StatementEncodingError("Unexpected end of input in compact decoding");
    }
    const mode = bytes[offset] & 0x03;
    if (mode === 0) {
        return [bytes[offset] >> 2, 1];
    }
    if (mode === 1) {
        if (offset + 1 >= bytes.length) {
            throw new StatementEncodingError(
                "Unexpected end of input in compact decoding (mode 1)",
            );
        }
        return [(bytes[offset] >> 2) | (bytes[offset + 1] << 6), 2];
    }
    if (mode === 2) {
        if (offset + 3 >= bytes.length) {
            throw new StatementEncodingError(
                "Unexpected end of input in compact decoding (mode 2)",
            );
        }
        return [
            (bytes[offset] >> 2) |
                (bytes[offset + 1] << 6) |
                (bytes[offset + 2] << 14) |
                (bytes[offset + 3] << 22),
            4,
        ];
    }
    throw new StatementEncodingError("Unsupported compact encoding mode (big integer)");
}

/** Encode a 64-bit unsigned integer in little-endian byte order. */
function encodeU64LE(value: bigint): Uint8Array {
    const buffer = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
        buffer[i] = Number((value >> BigInt(i * 8)) & 0xffn);
    }
    return buffer;
}

/** Decode a 64-bit unsigned integer from little-endian bytes. */
function decodeU64LE(bytes: Uint8Array, offset: number): bigint {
    if (offset + 8 > bytes.length) {
        throw new StatementEncodingError("Unexpected end of input in U64LE decoding");
    }
    let value = 0n;
    for (let i = 0; i < 8; i++) {
        value |= BigInt(bytes[offset + i]) << BigInt(i * 8);
    }
    return value;
}

/** Concatenate multiple Uint8Arrays into one. */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}

/** Convert a hex string (with or without 0x prefix) to bytes. */
export function fromHex(hex: string): Uint8Array {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

/** Convert bytes to a hex string with 0x prefix. */
export function toHex(bytes: Uint8Array): string {
    let hex = "0x";
    for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex;
}

// ============================================================================
// Statement Encoding
// ============================================================================

/**
 * Create the signature material for a statement.
 *
 * This is the byte sequence that gets signed with Sr25519 to produce
 * the authenticity proof. It includes all fields **except** the proof itself.
 *
 * The field encoding follows the on-chain statement format:
 * - Tag 2: expiry (U64LE, upper 32 bits = timestamp, lower 32 bits = sequence)
 * - Tag 3: decryptionKey (32 bytes, optional)
 * - Tag 4: topic1 (32 bytes, optional)
 * - Tag 5: topic2 (32 bytes, optional)
 * - Tag 6: channel (32 bytes, optional)
 * - Tag 8: data (compact-length-prefixed bytes, optional)
 *
 * @param fields - The statement fields to include in the signature material.
 * @returns The concatenated bytes to be signed.
 */
export function createSignatureMaterial(fields: StatementFields): Uint8Array {
    const parts: Uint8Array[] = [];

    // Field tag 2: Expiry (always present)
    const expiry = (BigInt(fields.expirationTimestamp) << 32n) | BigInt(fields.sequenceNumber);
    parts.push(new Uint8Array([2]));
    parts.push(encodeU64LE(expiry));

    // Field tag 3: DecryptionKey (optional, 32 bytes)
    if (fields.decryptionKey) {
        parts.push(new Uint8Array([3]));
        parts.push(fields.decryptionKey);
    }

    // Field tag 4: Topic1 (optional, 32 bytes)
    if (fields.topic1) {
        parts.push(new Uint8Array([4]));
        parts.push(fields.topic1);
    }

    // Field tag 5: Topic2 (optional, 32 bytes)
    if (fields.topic2) {
        parts.push(new Uint8Array([5]));
        parts.push(fields.topic2);
    }

    // Field tag 6: Channel (optional, 32 bytes)
    if (fields.channel) {
        parts.push(new Uint8Array([6]));
        parts.push(fields.channel);
    }

    // Field tag 8: Data (optional, compact-length-prefixed)
    if (fields.data) {
        parts.push(new Uint8Array([8]));
        parts.push(encodeCompact(fields.data.length));
        parts.push(fields.data);
    }

    return concatBytes(...parts);
}

/**
 * Encode a complete SCALE-encoded statement with all fields including the proof.
 *
 * The encoded format is `Vec<Field>`: a compact-encoded field count followed by
 * the concatenated field encodings. Field tag 0 contains the Sr25519 authenticity proof.
 *
 * @param fields - The statement fields.
 * @param signer - The 32-byte Sr25519 public key of the signer.
 * @param signature - The 64-byte Sr25519 signature.
 * @returns The complete SCALE-encoded statement.
 */
export function encodeStatement(
    fields: StatementFields,
    signer: Uint8Array,
    signature: Uint8Array,
): Uint8Array {
    const fieldArrays: Uint8Array[] = [];

    // Field tag 0: AuthenticityProof (Sr25519 = variant 0)
    fieldArrays.push(
        concatBytes(
            new Uint8Array([0, 0]), // tag 0, Sr25519 variant 0
            signature,
            signer,
        ),
    );

    // Field tag 2: Expiry
    const expiry = (BigInt(fields.expirationTimestamp) << 32n) | BigInt(fields.sequenceNumber);
    fieldArrays.push(concatBytes(new Uint8Array([2]), encodeU64LE(expiry)));

    // Field tag 3: DecryptionKey (optional)
    if (fields.decryptionKey) {
        fieldArrays.push(concatBytes(new Uint8Array([3]), fields.decryptionKey));
    }

    // Field tag 4: Topic1 (optional)
    if (fields.topic1) {
        fieldArrays.push(concatBytes(new Uint8Array([4]), fields.topic1));
    }

    // Field tag 5: Topic2 (optional)
    if (fields.topic2) {
        fieldArrays.push(concatBytes(new Uint8Array([5]), fields.topic2));
    }

    // Field tag 6: Channel (optional)
    if (fields.channel) {
        fieldArrays.push(concatBytes(new Uint8Array([6]), fields.channel));
    }

    // Field tag 8: Data (optional)
    if (fields.data) {
        fieldArrays.push(
            concatBytes(new Uint8Array([8]), encodeCompact(fields.data.length), fields.data),
        );
    }

    // Encode as Vec<Field>: compact length prefix + concatenated fields
    const allFields = concatBytes(...fieldArrays);
    return concatBytes(encodeCompact(fieldArrays.length), allFields);
}

/**
 * Decode a SCALE-encoded statement from a hex string.
 *
 * Parses all known field tags (0, 2, 3, 4, 5, 6, 8).
 * Throws {@link StatementEncodingError} on unknown tags or structural corruption.
 *
 * @param hex - A hex-encoded statement string (with or without "0x" prefix).
 * @returns The decoded statement fields.
 * @throws {StatementEncodingError} If the statement is structurally malformed.
 */
export function decodeStatement(hex: string): DecodedStatement {
    const bytes = fromHex(hex);
    const result: DecodedStatement = {};

    let offset = 0;
    const [fieldCount, countBytes] = decodeCompact(bytes, offset);
    offset += countBytes;

    for (let i = 0; i < fieldCount; i++) {
        if (offset >= bytes.length) {
            throw new StatementEncodingError(`Unexpected end of input at field ${i}/${fieldCount}`);
        }

        const tag = bytes[offset];
        offset += 1;

        switch (tag) {
            case 0: {
                // AuthenticityProof: variant (1 byte) + signature (64 bytes) + signer (32 bytes)
                if (offset + 1 + 64 + 32 > bytes.length) {
                    throw new StatementEncodingError("Truncated authenticity proof");
                }
                offset += 1 + 64; // skip variant + signature
                result.signer = bytes.slice(offset, offset + 32);
                offset += 32;
                break;
            }
            case 2: {
                result.expiry = decodeU64LE(bytes, offset);
                offset += 8;
                break;
            }
            case 3: {
                if (offset + 32 > bytes.length) {
                    throw new StatementEncodingError("Truncated decryption key");
                }
                result.decryptionKey = bytes.slice(offset, offset + 32);
                offset += 32;
                break;
            }
            case 4: {
                if (offset + 32 > bytes.length) {
                    throw new StatementEncodingError("Truncated topic1");
                }
                result.topic1 = bytes.slice(offset, offset + 32);
                offset += 32;
                break;
            }
            case 5: {
                if (offset + 32 > bytes.length) {
                    throw new StatementEncodingError("Truncated topic2");
                }
                result.topic2 = bytes.slice(offset, offset + 32);
                offset += 32;
                break;
            }
            case 6: {
                if (offset + 32 > bytes.length) {
                    throw new StatementEncodingError("Truncated channel");
                }
                result.channel = bytes.slice(offset, offset + 32);
                offset += 32;
                break;
            }
            case 8: {
                const [dataLen, lenBytes] = decodeCompact(bytes, offset);
                offset += lenBytes;
                if (offset + dataLen > bytes.length) {
                    throw new StatementEncodingError("Truncated data payload");
                }
                result.data = bytes.slice(offset, offset + dataLen);
                offset += dataLen;
                break;
            }
            default:
                // We must throw here rather than skip — without knowing the
                // field's wire size, we can't advance the offset safely.
                throw new StatementEncodingError(`Unknown field tag: ${tag}`);
        }
    }

    return result;
}

/**
 * Encode a value as a JSON-serialized data payload for a statement.
 *
 * Serializes the value as JSON and encodes to UTF-8 bytes.
 * Throws {@link StatementDataTooLargeError} if the result exceeds
 * {@link MAX_STATEMENT_SIZE} bytes.
 *
 * @typeParam T - The type of value being encoded.
 * @param value - The value to serialize.
 * @returns UTF-8 encoded JSON bytes.
 * @throws {StatementDataTooLargeError} If the encoded data exceeds 512 bytes.
 *
 * @example
 * ```ts
 * const data = encodeData({ type: "presence", peerId: "abc" });
 * ```
 */
export function encodeData<T>(value: T): Uint8Array {
    const json = JSON.stringify(value);
    const bytes = new TextEncoder().encode(json);
    if (bytes.length > MAX_STATEMENT_SIZE) {
        throw new StatementDataTooLargeError(bytes.length);
    }
    return bytes;
}

/**
 * Decode a JSON-serialized data payload from statement bytes.
 *
 * @typeParam T - The expected parsed type.
 * @param bytes - UTF-8 encoded JSON bytes.
 * @returns The parsed value.
 * @throws {StatementEncodingError} If the bytes are not valid UTF-8 or valid JSON.
 */
export function decodeData<T>(bytes: Uint8Array): T {
    try {
        const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return JSON.parse(json) as T;
    } catch (error) {
        throw new StatementEncodingError("Failed to decode JSON data", { cause: error });
    }
}

if (import.meta.vitest) {
    const { describe, test, expect } = import.meta.vitest;

    describe("compact encoding", () => {
        test("encodes and decodes single-byte mode (0-63)", () => {
            for (const val of [0, 1, 42, 63]) {
                const encoded = encodeCompact(val);
                expect(encoded.length).toBe(1);
                const [decoded, bytesRead] = decodeCompact(encoded, 0);
                expect(decoded).toBe(val);
                expect(bytesRead).toBe(1);
            }
        });

        test("encodes and decodes two-byte mode (64-16383)", () => {
            for (const val of [64, 100, 255, 1000, 16383]) {
                const encoded = encodeCompact(val);
                expect(encoded.length).toBe(2);
                const [decoded, bytesRead] = decodeCompact(encoded, 0);
                expect(decoded).toBe(val);
                expect(bytesRead).toBe(2);
            }
        });

        test("encodes and decodes four-byte mode (16384-2^30-1)", () => {
            for (const val of [16384, 65535, 1_000_000]) {
                const encoded = encodeCompact(val);
                expect(encoded.length).toBe(4);
                const [decoded, bytesRead] = decodeCompact(encoded, 0);
                expect(decoded).toBe(val);
                expect(bytesRead).toBe(4);
            }
        });

        test("throws for values too large", () => {
            expect(() => encodeCompact(0x40000000)).toThrow(StatementEncodingError);
        });

        test("throws for negative values", () => {
            expect(() => encodeCompact(-1)).toThrow(StatementEncodingError);
        });

        test("throws on truncated input", () => {
            expect(() => decodeCompact(new Uint8Array(0), 0)).toThrow(StatementEncodingError);
        });
    });

    describe("U64LE encoding", () => {
        test("round-trips zero", () => {
            const encoded = encodeU64LE(0n);
            expect(encoded.length).toBe(8);
            expect(decodeU64LE(encoded, 0)).toBe(0n);
        });

        test("round-trips max u32", () => {
            const val = BigInt(0xffffffff);
            expect(decodeU64LE(encodeU64LE(val), 0)).toBe(val);
        });

        test("round-trips large value", () => {
            const val = (BigInt(1700000000) << 32n) | BigInt(12345);
            expect(decodeU64LE(encodeU64LE(val), 0)).toBe(val);
        });

        test("throws on truncated input", () => {
            expect(() => decodeU64LE(new Uint8Array(4), 0)).toThrow(StatementEncodingError);
        });
    });

    describe("encodeStatement / decodeStatement", () => {
        const fakeSigner = new Uint8Array(32).fill(0xaa);
        const fakeSignature = new Uint8Array(64).fill(0xbb);

        test("round-trips minimal statement (expiry only)", () => {
            const fields: StatementFields = {
                expirationTimestamp: 1700000000,
                sequenceNumber: 42,
            };
            const encoded = encodeStatement(fields, fakeSigner, fakeSignature);
            const hex = toHex(encoded);
            const decoded = decodeStatement(hex);

            expect(decoded.signer).toEqual(fakeSigner);
            const expectedExpiry = (BigInt(1700000000) << 32n) | 42n;
            expect(decoded.expiry).toBe(expectedExpiry);
            expect(decoded.data).toBeUndefined();
            expect(decoded.channel).toBeUndefined();
            expect(decoded.topic1).toBeUndefined();
            expect(decoded.topic2).toBeUndefined();
            expect(decoded.decryptionKey).toBeUndefined();
        });

        test("round-trips statement with all fields", () => {
            const topic1 = new Uint8Array(32).fill(0x11);
            const topic2 = new Uint8Array(32).fill(0x22);
            const channel = new Uint8Array(32).fill(0x33);
            const decryptionKey = new Uint8Array(32).fill(0x44);
            const data = new TextEncoder().encode('{"type":"presence"}');

            const fields: StatementFields = {
                expirationTimestamp: 1700000030,
                sequenceNumber: 999,
                decryptionKey,
                channel,
                topic1,
                topic2,
                data,
            };

            const encoded = encodeStatement(fields, fakeSigner, fakeSignature);
            const hex = toHex(encoded);
            const decoded = decodeStatement(hex);

            expect(decoded.signer).toEqual(fakeSigner);
            expect(decoded.decryptionKey).toEqual(decryptionKey);
            expect(decoded.topic1).toEqual(topic1);
            expect(decoded.topic2).toEqual(topic2);
            expect(decoded.channel).toEqual(channel);
            expect(decoded.data).toEqual(data);
        });

        test("decodes hex with 0x prefix", () => {
            const fields: StatementFields = {
                expirationTimestamp: 100,
                sequenceNumber: 1,
            };
            const encoded = encodeStatement(fields, fakeSigner, fakeSignature);
            const hex = toHex(encoded);
            expect(hex.startsWith("0x")).toBe(true);
            const decoded = decodeStatement(hex);
            expect(decoded.signer).toEqual(fakeSigner);
        });

        test("decodes hex without 0x prefix", () => {
            const fields: StatementFields = {
                expirationTimestamp: 100,
                sequenceNumber: 1,
            };
            const encoded = encodeStatement(fields, fakeSigner, fakeSignature);
            const hex = toHex(encoded).slice(2); // remove 0x
            const decoded = decodeStatement(hex);
            expect(decoded.signer).toEqual(fakeSigner);
        });

        test("throws on unknown field tag", () => {
            // Craft a statement with 1 field, tag=99
            const bytes = new Uint8Array([4, 99]); // compact(1)=4, then tag 99
            const hex = toHex(bytes);
            expect(() => decodeStatement(hex)).toThrow(StatementEncodingError);
        });

        test("throws on truncated authenticity proof", () => {
            // 1 field, tag 0, but only 2 more bytes (need 97)
            const bytes = new Uint8Array([4, 0, 0, 0]);
            expect(() => decodeStatement(toHex(bytes))).toThrow(StatementEncodingError);
        });

        test("throws on truncated 32-byte fields", () => {
            // tag 3 (decryptionKey) with only 16 bytes instead of 32
            const bytes = new Uint8Array(18);
            bytes[0] = 4; // compact(1)
            bytes[1] = 3; // tag 3
            // only 16 remaining bytes, need 32
            expect(() => decodeStatement(toHex(bytes))).toThrow("Truncated");

            // tag 4 (topic1)
            const bytes2 = new Uint8Array(18);
            bytes2[0] = 4;
            bytes2[1] = 4;
            expect(() => decodeStatement(toHex(bytes2))).toThrow("Truncated");

            // tag 6 (channel)
            const bytes3 = new Uint8Array(18);
            bytes3[0] = 4;
            bytes3[1] = 6;
            expect(() => decodeStatement(toHex(bytes3))).toThrow("Truncated");
        });

        test("throws on truncated data payload", () => {
            // tag 8 with compact length=100 but only 2 bytes of data
            const bytes = new Uint8Array([4, 8, 144, 1, 0, 0]); // compact(1), tag 8, compact(100)=0x190
            expect(() => decodeStatement(toHex(bytes))).toThrow("Truncated");
        });

        test("throws on unexpected end of input mid-fields", () => {
            // Claim 3 fields but only provide 1
            const encoded = encodeStatement(
                { expirationTimestamp: 100, sequenceNumber: 1 },
                fakeSigner,
                fakeSignature,
            );
            // Truncate to cut off some fields
            const truncated = encoded.slice(0, 20);
            expect(() => decodeStatement(toHex(truncated))).toThrow(StatementEncodingError);
        });
    });

    describe("createSignatureMaterial", () => {
        test("produces deterministic output", () => {
            const fields: StatementFields = {
                expirationTimestamp: 1700000000,
                sequenceNumber: 42,
                topic1: new Uint8Array(32).fill(0x11),
            };
            const a = createSignatureMaterial(fields);
            const b = createSignatureMaterial(fields);
            expect(a).toEqual(b);
        });

        test("differs when fields change", () => {
            const base: StatementFields = {
                expirationTimestamp: 1700000000,
                sequenceNumber: 42,
            };
            const modified: StatementFields = {
                expirationTimestamp: 1700000001,
                sequenceNumber: 42,
            };
            expect(createSignatureMaterial(base)).not.toEqual(createSignatureMaterial(modified));
        });
    });

    describe("encodeData / decodeData", () => {
        test("round-trips JSON object", () => {
            const original = { type: "presence", peerId: "abc123", timestamp: 1234 };
            const encoded = encodeData(original);
            const decoded = decodeData<typeof original>(encoded);
            expect(decoded).toEqual(original);
        });

        test("round-trips string", () => {
            const encoded = encodeData("hello");
            expect(decodeData<string>(encoded)).toBe("hello");
        });

        test("round-trips number", () => {
            const encoded = encodeData(42);
            expect(decodeData<number>(encoded)).toBe(42);
        });

        test("throws StatementDataTooLargeError for oversized data", () => {
            const large = { data: "x".repeat(600) };
            expect(() => encodeData(large)).toThrow(StatementDataTooLargeError);
        });

        test("allows data at exactly MAX_STATEMENT_SIZE", () => {
            // Create a string that when JSON-serialized + UTF-8 encoded = exactly 512 bytes
            // JSON.stringify adds 2 quote chars, so the string content needs to be 510 chars
            const str = "a".repeat(510);
            const encoded = encodeData(str);
            expect(encoded.length).toBe(512);
        });

        test("throws StatementEncodingError for invalid JSON bytes", () => {
            const invalid = new TextEncoder().encode("{not valid json");
            expect(() => decodeData(invalid)).toThrow(StatementEncodingError);
        });

        test("throws StatementEncodingError for non-UTF-8 bytes", () => {
            const invalid = new Uint8Array([0xff, 0xfe, 0xfd]);
            expect(() => decodeData(invalid)).toThrow(StatementEncodingError);
        });
    });
}
