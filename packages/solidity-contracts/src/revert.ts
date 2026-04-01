import { Binary } from "polkadot-api";
import { decodeErrorResult } from "viem";
import type { Abi } from "viem";

/**
 * Extract a human-readable revert reason from a `ReviveApi.eth_transact` failure.
 *
 * The failure value from the runtime API is an Enum with two variants:
 * - `{ type: "Message", value: string }` — runtime-level error (balance, gas, etc.)
 * - `{ type: "Data", value: Binary }` — contract revert data (Solidity `Error(string)`
 *   or custom errors defined in the ABI)
 *
 * For contract revert data, this function:
 * 1. Tries viem's `decodeErrorResult` against the provided ABI (custom errors).
 * 2. Falls back to decoding the standard `Error(string)` with selector `0x08c379a0`.
 *
 * @param errValue - The failure value from `ReviveApi.eth_transact`.
 * @param abi - The Solidity ABI for decoding custom error types.
 * @returns A human-readable error string, or `undefined` if decoding fails.
 *
 * @example
 * ```ts
 * const result = await typedApi.apis.ReviveApi.eth_transact(tx, { at: "best" });
 * if (!result.success) {
 *     const reason = extractRevertReason(result.value, contractAbi);
 *     console.log(reason); // "OwnableUnauthorizedAccount(0x1234...)"
 * }
 * ```
 */
export function extractRevertReason(errValue: unknown, abi: Abi): string | undefined {
    try {
        if (!errValue || typeof errValue !== "object") return undefined;
        const obj = errValue as { type?: string; value?: unknown };

        // Runtime message (e.g., "insufficient funds for gas * price + value")
        if (obj.type === "Message" && typeof obj.value === "string") {
            return obj.value;
        }

        // Contract revert data
        if (obj.type === "Data" && obj.value instanceof Binary) {
            const errorData = obj.value.asHex() as `0x${string}`;
            if (errorData.length <= 2) return undefined;

            // Decode using viem — handles both ABI-defined custom errors
            // (e.g., OwnableUnauthorizedAccount) and standard Error(string)
            // from require()/revert() natively.
            try {
                const decoded = decodeErrorResult({ abi, data: errorData });
                const args = decoded.args?.length ? `(${decoded.args.join(", ")})` : "";
                return `${decoded.errorName}${args}`;
            } catch {
                // decodeErrorResult failed — unknown selector not in ABI
            }
        }
    } catch {
        // Ignore decode errors
    }
    return undefined;
}

if (import.meta.vitest) {
    const { describe, test, expect } = import.meta.vitest;

    const sampleAbi: Abi = [
        {
            type: "error",
            name: "OwnableUnauthorizedAccount",
            inputs: [{ name: "account", type: "address" }],
        },
        {
            type: "error",
            name: "InsufficientBalance",
            inputs: [],
        },
        {
            type: "function",
            name: "transfer",
            inputs: [
                { name: "to", type: "address" },
                { name: "amount", type: "uint256" },
            ],
            outputs: [{ name: "", type: "bool" }],
            stateMutability: "nonpayable",
        },
    ];

    describe("extractRevertReason", () => {
        test("returns runtime message for Message variant", () => {
            const errValue = {
                type: "Message",
                value: "insufficient funds for gas * price + value",
            };
            expect(extractRevertReason(errValue, sampleAbi)).toBe(
                "insufficient funds for gas * price + value",
            );
        });

        test("returns undefined for null input", () => {
            expect(extractRevertReason(null, sampleAbi)).toBeUndefined();
        });

        test("returns undefined for undefined input", () => {
            expect(extractRevertReason(undefined, sampleAbi)).toBeUndefined();
        });

        test("returns undefined for non-object input", () => {
            expect(extractRevertReason("string", sampleAbi)).toBeUndefined();
        });

        test("returns undefined for unknown type", () => {
            expect(extractRevertReason({ type: "Unknown" }, sampleAbi)).toBeUndefined();
        });

        test("decodes standard Error(string) revert with selector 0x08c379a0", () => {
            // Encode "Insufficient balance" as Error(string)
            // selector 0x08c379a0 + ABI-encoded string
            const errorHex =
                "0x08c379a0" +
                "0000000000000000000000000000000000000000000000000000000000000020" +
                "0000000000000000000000000000000000000000000000000000000000000014" +
                "496e73756666696369656e742062616c616e6365000000000000000000000000";

            const errValue = {
                type: "Data",
                value: Binary.fromHex(errorHex as `0x${string}`),
            };

            const reason = extractRevertReason(errValue, sampleAbi);
            // viem's decodeErrorResult handles standard Error(string) too,
            // so the result may be "Error(Insufficient balance)" or "Insufficient balance"
            expect(reason).toContain("Insufficient balance");
        });

        test("decodes custom ABI error (InsufficientBalance)", () => {
            // InsufficientBalance() has no args — just the selector
            // keccak256("InsufficientBalance()") first 4 bytes
            const { encodeErrorResult } = require("viem") as typeof import("viem");
            const errorData = encodeErrorResult({
                abi: sampleAbi,
                errorName: "InsufficientBalance",
            });

            const errValue = {
                type: "Data",
                value: Binary.fromHex(errorData),
            };

            expect(extractRevertReason(errValue, sampleAbi)).toBe("InsufficientBalance");
        });

        test("returns undefined for empty Data", () => {
            const errValue = {
                type: "Data",
                value: Binary.fromHex("0x"),
            };

            expect(extractRevertReason(errValue, sampleAbi)).toBeUndefined();
        });

        test("returns undefined for Data with non-Binary value", () => {
            const errValue = {
                type: "Data",
                value: "not-a-binary",
            };

            expect(extractRevertReason(errValue, sampleAbi)).toBeUndefined();
        });

        test("returns undefined for unrecognized error data", () => {
            // Random 4-byte selector not in ABI and not Error(string)
            const errValue = {
                type: "Data",
                value: Binary.fromHex("0xdeadbeef"),
            };

            expect(extractRevertReason(errValue, sampleAbi)).toBeUndefined();
        });
    });
}
