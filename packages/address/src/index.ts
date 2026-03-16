import { keccak_256 } from "@noble/hashes/sha3.js";
import { AccountId } from "polkadot-api";

const EVM_DERIVED_MARKER = 0xee;

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Validate if a string is a valid SS58 address.
 */
export function isValidSS58(address: string): boolean {
    try {
        AccountId().enc(address);
        return true;
    } catch {
        return false;
    }
}

/**
 * Convert an SS58 address to any prefix.
 * Defaults to prefix 42 (generic Substrate).
 * Returns null if the input is not a valid SS58 address.
 */
export function normalizeSS58(address: string, prefix: number = 42): string | null {
    try {
        const bytes = AccountId().enc(address);
        return AccountId(prefix).dec(bytes);
    } catch {
        return null;
    }
}

/**
 * Derive the H160 EVM address from a 32-byte Substrate public key.
 *
 * Asset Hub pallet-revive derivation rules:
 * - EVM-derived account (last 12 bytes all 0xEE): strip padding to recover original H160.
 * - Native account (sr25519/ed25519): keccak256(publicKey), take last 20 bytes.
 *
 * Canonical source: mark3t evmMapping.ts
 */
export function deriveEvmAddress(publicKey: Uint8Array): `0x${string}` {
    if (publicKey.length !== 32) {
        throw new Error(`Expected 32-byte public key, got ${publicKey.length} bytes`);
    }

    const isEvmDerived = publicKey.slice(20).every((b) => b === EVM_DERIVED_MARKER);
    if (isEvmDerived) {
        return `0x${bytesToHex(publicKey.slice(0, 20))}` as `0x${string}`;
    }

    const hash = keccak_256(publicKey);
    return `0x${bytesToHex(hash.slice(12))}` as `0x${string}`;
}

/**
 * Convert an SS58 address to its H160 EVM address.
 *
 * Uses keccak256(accountId32) last-20-bytes — correct for pallet-revive.
 * Also handles EVM-derived accounts (0xEE padding recovery).
 *
 * Critical: t3rminal uses first-20-bytes which is WRONG. This is the canonical implementation.
 */
export function ss58ToH160(address: string): `0x${string}` {
    const publicKey = AccountId().enc(address);
    return deriveEvmAddress(publicKey);
}

/**
 * Convert an H160 EVM address to its corresponding SS58 address.
 *
 * Constructs an EVM-derived AccountId32 by padding the H160 with 0xEE bytes (prefix 42).
 * These accounts are implicitly mapped in pallet-revive — no on-chain registration needed.
 */
export function evmToSs58(evmAddress: string): string {
    const hex = evmAddress.replace("0x", "");
    if (hex.length !== 40) {
        throw new Error(`Expected 20-byte H160 address, got ${hex.length / 2} bytes`);
    }

    const padded = new Uint8Array(32);
    for (let i = 0; i < 20; i++) {
        padded[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    for (let i = 20; i < 32; i++) {
        padded[i] = EVM_DERIVED_MARKER;
    }
    return AccountId().dec(padded);
}

/**
 * Convert any address (SS58 or H160) to an H160 EVM address.
 *
 * Pass-through for addresses already in H160 format (0x + 40 hex chars).
 * Converts SS58 via deriveEvmAddress.
 */
export function toEvmAddress(address: string): `0x${string}` {
    if (address.startsWith("0x") && address.length === 42) {
        return address as `0x${string}`;
    }
    const publicKey = AccountId().enc(address);
    return deriveEvmAddress(publicKey);
}

/**
 * Encode raw bytes to an SS58 address.
 * Defaults to prefix 42 (generic Substrate).
 */
export function toSS58(bytes: Uint8Array, prefix: number = 42): string {
    return AccountId(prefix).dec(bytes);
}

/**
 * Convert any SS58 address to generic Substrate format (prefix 42).
 * Returns null if the input is invalid.
 */
export function toGenericSS58(address: string): string | null {
    return normalizeSS58(address, 42);
}

/**
 * Convert any SS58 address to Polkadot format (prefix 0).
 * Returns null if the input is invalid.
 */
export function toPolkadotSS58(address: string): string | null {
    return normalizeSS58(address, 0);
}

/**
 * Check if a string is a valid H160 EVM address (0x + 40 hex chars).
 * More explicit alias for isValidAddress.
 */
export function isValidH160(address: string): boolean {
    return isValidAddress(address);
}

/**
 * Truncate an address for display.
 *
 * @example
 * truncateAddress('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', 5, 3) // '5Grwv...tQY'
 * truncateAddress('0x9621dde636de098b43efb0fa9b61facfe328f99d', 6, 4)        // '0x9621...f99d'
 */
export function truncateAddress(address: string, start: number = 8, end: number = 4): string {
    if (!address || address.length <= start + end) return address;
    return `${address.slice(0, start)}...${address.slice(-end)}`;
}

/**
 * Check if a string is a valid H160 EVM address (0x + 40 hex chars).
 */
export function isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Compare two addresses (SS58 or H160) case-insensitively.
 */
export function addressesEqual(a: string, b: string): boolean {
    return a.toLowerCase() === b.toLowerCase();
}

if (import.meta.vitest) {
    const { describe, test, expect } = import.meta.vitest;

    // Alice's well-known sr25519 public key (DEV_PHRASE //Alice)
    const ALICE_PUBKEY = new Uint8Array([
        0xd4, 0x35, 0x93, 0xc7, 0x15, 0xfd, 0xd3, 0x1c, 0x61, 0x14, 0x1a, 0xbd, 0x04, 0xa9, 0x9f,
        0xd6, 0x82, 0x2c, 0x85, 0x58, 0x85, 0x4c, 0xcd, 0xe3, 0x9a, 0x56, 0x84, 0xe7, 0xa5, 0x6d,
        0xa2, 0x7d,
    ]);
    // keccak256(ALICE_PUBKEY) last 20 bytes — verified from mark3t test suite
    const ALICE_EVM = "0x9621dde636de098b43efb0fa9b61facfe328f99d";
    const ALICE_SS58 = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";

    describe("isValidSS58", () => {
        test("returns true for a valid SS58 address", () => {
            expect(isValidSS58(ALICE_SS58)).toBe(true);
        });

        test("returns false for an H160 address", () => {
            expect(isValidSS58(ALICE_EVM)).toBe(false);
        });

        test("returns false for garbage input", () => {
            expect(isValidSS58("not-an-address")).toBe(false);
            expect(isValidSS58("")).toBe(false);
        });
    });

    describe("normalizeSS58", () => {
        test("round-trips to prefix 42", () => {
            const result = normalizeSS58(ALICE_SS58);
            expect(result).not.toBeNull();
            expect(isValidSS58(result!)).toBe(true);
        });

        test("converts to Polkadot prefix 0", () => {
            const result = normalizeSS58(ALICE_SS58, 0);
            expect(result).not.toBeNull();
            // Re-normalizing back to 42 should recover the same bytes
            expect(normalizeSS58(result!, 42)).toBe(normalizeSS58(ALICE_SS58, 42));
        });

        test("returns null for invalid input", () => {
            expect(normalizeSS58("not-an-address")).toBeNull();
        });
    });

    describe("deriveEvmAddress", () => {
        test("derives H160 from native sr25519 public key (keccak path)", () => {
            expect(deriveEvmAddress(ALICE_PUBKEY).toLowerCase()).toBe(ALICE_EVM);
        });

        test("recovers H160 from EVM-derived account (0xEE padding)", () => {
            const evmAddr = "0x1234567890abcdef1234567890abcdef12345678";
            const padded = new Uint8Array(32);
            const hex = evmAddr.slice(2);
            for (let i = 0; i < 20; i++) padded[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
            for (let i = 20; i < 32; i++) padded[i] = 0xee;
            expect(deriveEvmAddress(padded).toLowerCase()).toBe(evmAddr.toLowerCase());
        });

        test("throws on wrong-length input", () => {
            expect(() => deriveEvmAddress(new Uint8Array(20))).toThrow("Expected 32-byte");
            expect(() => deriveEvmAddress(new Uint8Array(0))).toThrow("Expected 32-byte");
        });
    });

    describe("ss58ToH160", () => {
        test("converts Alice SS58 to known EVM address", () => {
            expect(ss58ToH160(ALICE_SS58).toLowerCase()).toBe(ALICE_EVM);
        });
    });

    describe("evmToSs58 + toEvmAddress round-trip", () => {
        test("evmToSs58 → toEvmAddress recovers original H160", () => {
            const ss58 = evmToSs58(ALICE_EVM);
            expect(toEvmAddress(ss58).toLowerCase()).toBe(ALICE_EVM);
        });

        test("evmToSs58 throws on wrong-length input", () => {
            expect(() => evmToSs58("0x1234")).toThrow("Expected 20-byte");
        });
    });

    describe("toEvmAddress", () => {
        test("passes through H160 unchanged", () => {
            expect(toEvmAddress(ALICE_EVM)).toBe(ALICE_EVM);
        });

        test("converts SS58 to H160", () => {
            expect(toEvmAddress(ALICE_SS58).toLowerCase()).toBe(ALICE_EVM);
        });
    });

    describe("toSS58", () => {
        test("encodes bytes to SS58 with default prefix 42", () => {
            const result = toSS58(ALICE_PUBKEY);
            expect(isValidSS58(result)).toBe(true);
            expect(result).toBe(ALICE_SS58);
        });
    });

    describe("truncateAddress", () => {
        test("truncates a long address", () => {
            expect(truncateAddress(ALICE_SS58, 5, 3)).toBe("5Grwv...tQY");
        });

        test("truncates an H160 address", () => {
            expect(truncateAddress(ALICE_EVM, 6, 4)).toBe("0x9621...f99d");
        });

        test("returns original if address is too short to truncate", () => {
            expect(truncateAddress("0x1234", 4, 4)).toBe("0x1234");
        });
    });

    describe("isValidAddress", () => {
        test("returns true for a valid H160 address", () => {
            expect(isValidAddress(ALICE_EVM)).toBe(true);
        });

        test("returns false for SS58", () => {
            expect(isValidAddress(ALICE_SS58)).toBe(false);
        });

        test("returns false for garbage", () => {
            expect(isValidAddress("not-an-address")).toBe(false);
        });
    });

    describe("addressesEqual", () => {
        test("matches case-insensitively", () => {
            expect(addressesEqual(ALICE_EVM, ALICE_EVM.toUpperCase())).toBe(true);
        });

        test("returns false for different addresses", () => {
            expect(addressesEqual(ALICE_EVM, "0x0000000000000000000000000000000000000000")).toBe(
                false,
            );
        });
    });

    describe("toGenericSS58", () => {
        test("converts Polkadot-prefix address to prefix 42", () => {
            const polkadot = normalizeSS58(ALICE_SS58, 0)!;
            const result = toGenericSS58(polkadot);
            expect(result).toBe(normalizeSS58(ALICE_SS58, 42));
        });

        test("returns null for invalid input", () => {
            expect(toGenericSS58("not-an-address")).toBeNull();
        });
    });

    describe("toPolkadotSS58", () => {
        test("converts generic SS58 to Polkadot prefix 0", () => {
            const result = toPolkadotSS58(ALICE_SS58);
            expect(result).not.toBeNull();
            // Re-converting back to prefix 42 recovers the same bytes
            expect(toGenericSS58(result!)).toBe(normalizeSS58(ALICE_SS58, 42));
        });

        test("returns null for invalid input", () => {
            expect(toPolkadotSS58("not-an-address")).toBeNull();
        });
    });

    describe("isValidH160", () => {
        test("returns true for a valid H160 address", () => {
            expect(isValidH160(ALICE_EVM)).toBe(true);
        });

        test("returns false for SS58", () => {
            expect(isValidH160(ALICE_SS58)).toBe(false);
        });

        test("returns false for garbage", () => {
            expect(isValidH160("not-an-address")).toBe(false);
        });
    });
}
