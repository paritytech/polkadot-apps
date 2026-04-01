import { Binary } from "polkadot-api";
import { decodeFunctionResult, encodeFunctionData } from "viem";
import type { Abi } from "viem";

import { createLogger } from "@polkadot-apps/logger";

import { extractRevertReason } from "./revert.js";
import { buildEthTransactTx, buildReviveCallTx } from "./tx-builders.js";
import type {
    CreateSolidityContractOptions,
    EthTransactError,
    EthTransactResult,
    ReviveTypedApi,
    SolidityContract,
    SolidityWriteResult,
} from "./types.js";

const log = createLogger("solidity-contracts");

/**
 * Recursively convert polkadot-api `Binary` objects to hex strings
 * so viem's `encodeFunctionData` can handle them.
 */
function normalizeForViem(value: unknown): unknown {
    if (value instanceof Binary) {
        return value.asHex();
    }
    if (Array.isArray(value)) {
        return value.map(normalizeForViem);
    }
    return value;
}

/**
 * Create a generic Solidity contract caller for pallet-revive chains.
 *
 * Uses viem for ABI encoding/decoding and `ReviveApi.eth_transact` for
 * execution. Works with any Solidity contract ABI — no code generation
 * or pre-built descriptors required.
 *
 * **How it works:**
 * - `read()` encodes the call via viem, dry-runs via `eth_transact`, and
 *   decodes the response. No on-chain transaction is created.
 * - `write()` does the same dry-run for validation, then returns a
 *   `send()` function that creates a `tx.Revive.call` extrinsic for
 *   on-chain submission.
 *
 * **Prerequisites:**
 * - The caller's account must be mapped on-chain via `Revive.map_account()`.
 *   Use `ensureAccountMapped()` from `@polkadot-apps/tx` before calling `write()`.
 *
 * @param typedApi - A PAPI typed API for a chain with pallet-revive.
 *   Typically `api.assetHub` from `@polkadot-apps/chain-client`.
 * @param address - The H160 contract address (e.g., `"0x1234...abcd"`).
 * @param abi - The Solidity ABI as a viem `Abi` type (parsed JSON array).
 * @param options - Optional configuration (e.g., override `nativeToEvmRatio`).
 * @returns A {@link SolidityContract} with `read()` and `write()` methods.
 *
 * @example Reading a view function:
 * ```ts
 * import { getChainAPI } from "@polkadot-apps/chain-client";
 * import { createSolidityContract } from "@polkadot-apps/solidity-contracts";
 *
 * const api = await getChainAPI("paseo");
 * const contract = createSolidityContract(api.assetHub, "0x1234...abcd", erc20Abi);
 *
 * const balance = await contract.read("balanceOf", ["0xowner..."]);
 * ```
 *
 * @example Writing a state-changing function:
 * ```ts
 * const result = await contract.write("transfer", ["0xto...", 1000n], senderAddress);
 * console.log("Dry-run response:", result.response);
 *
 * const tx = result.send();
 * await submitAndWatch(tx, signer);
 * ```
 */
export function createSolidityContract(
    typedApi: ReviveTypedApi,
    address: `0x${string}`,
    abi: Abi,
    options?: CreateSolidityContractOptions,
): SolidityContract {
    let cachedRatio: bigint | undefined = options?.nativeToEvmRatio;

    async function getNativeToEvmRatio(): Promise<bigint> {
        if (cachedRatio !== undefined) return cachedRatio;
        log.debug("loading NativeToEthRatio from chain constants");
        cachedRatio = await typedApi.constants.Revive.NativeToEthRatio();
        log.debug("NativeToEthRatio loaded", { ratio: cachedRatio });
        return cachedRatio;
    }

    return {
        async read(functionName: string, args: unknown[] = []): Promise<unknown> {
            const normalizedArgs = args.map(normalizeForViem);
            const callData = encodeFunctionData({
                abi,
                functionName,
                args: normalizedArgs,
            }) as `0x${string}`;

            const baseTx = buildEthTransactTx({ to: address, callData });

            log.debug("read dry-run", { functionName });
            const result = await typedApi.apis.ReviveApi.eth_transact(baseTx, { at: "best" });

            if (!result.success) {
                const revertReason = extractRevertReason(result.value as unknown, abi);
                throw new Error(
                    revertReason
                        ? `${functionName}: ${revertReason}`
                        : `${functionName} dry-run failed`,
                );
            }

            const value = result.value as EthTransactResult;
            const dataHex = value.data.asHex();
            if (dataHex === "0x" || dataHex.length <= 2) {
                return undefined;
            }

            return decodeFunctionResult({ abi, functionName, data: dataHex });
        },

        async write(
            functionName: string,
            args: unknown[],
            origin: string,
            value?: bigint,
        ): Promise<SolidityWriteResult> {
            const normalizedArgs = args.map(normalizeForViem);
            const callData = encodeFunctionData({
                abi,
                functionName,
                args: normalizedArgs,
            }) as `0x${string}`;

            const baseTx = buildEthTransactTx({ to: address, callData, from: origin, value });

            log.debug("write dry-run", { functionName });
            const result = await typedApi.apis.ReviveApi.eth_transact(baseTx, { at: "best" });

            if (!result.success) {
                const revertReason = extractRevertReason(result.value as unknown, abi);
                throw new Error(
                    revertReason
                        ? `${functionName}: ${revertReason}`
                        : `${functionName} dry-run failed`,
                );
            }

            const successValue = result.value as EthTransactResult;
            const weightRequired = successValue.weight_required;
            const storageDeposit = successValue.max_storage_deposit;

            // Decode response from dry-run
            const dataHex = successValue.data.asHex();
            let decoded: unknown = undefined;
            if (dataHex !== "0x" && dataHex.length > 2) {
                decoded = decodeFunctionResult({ abi, functionName, data: dataHex });
            }

            // Ensure ratio is loaded for send() — fire-and-forget so the
            // dry-run result is available immediately. The ratio is only
            // needed when send() is actually called.
            void getNativeToEvmRatio();

            return {
                response: decoded,
                send: () => {
                    const ratio = cachedRatio;
                    if (ratio === undefined) {
                        throw new Error(
                            "NativeToEthRatio not loaded. " +
                                "Ensure write() completes before calling send().",
                        );
                    }
                    return buildReviveCallTx(typedApi, {
                        dest: address,
                        callData,
                        value,
                        nativeToEvmRatio: ratio,
                        gasRequired: weightRequired,
                        storageDeposit,
                    });
                },
                diagnose: async (): Promise<string | undefined> => {
                    try {
                        const rerun = await typedApi.apis.ReviveApi.eth_transact(baseTx, {
                            at: "best",
                        });
                        if (!rerun.success) {
                            return extractRevertReason(rerun.value as unknown, abi);
                        }
                        return undefined;
                    } catch {
                        return undefined;
                    }
                },
            };
        },
    };
}

if (import.meta.vitest) {
    const { describe, test, expect, vi } = import.meta.vitest;

    const erc20Abi: Abi = [
        {
            type: "function",
            name: "balanceOf",
            inputs: [{ name: "account", type: "address" }],
            outputs: [{ name: "", type: "uint256" }],
            stateMutability: "view",
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
        {
            type: "error",
            name: "InsufficientBalance",
            inputs: [],
        },
    ];

    function createMockTypedApi(overrides?: {
        ethTransactResult?: unknown;
    }): ReviveTypedApi {
        // Default: successful balanceOf returning 1000n
        const { encodeFunctionResult } = require("viem") as typeof import("viem");
        const defaultData = encodeFunctionResult({
            abi: erc20Abi,
            functionName: "balanceOf",
            result: 1000n,
        });

        const defaultResult = {
            success: true,
            value: {
                data: Binary.fromHex(defaultData as `0x${string}`),
                weight_required: { ref_time: 1000n, proof_size: 500n },
                max_storage_deposit: 100n,
            },
        };

        return {
            apis: {
                ReviveApi: {
                    eth_transact: vi
                        .fn()
                        .mockResolvedValue(overrides?.ethTransactResult ?? defaultResult),
                },
            },
            tx: {
                Revive: {
                    call: vi.fn().mockReturnValue({
                        signSubmitAndWatch: () => ({
                            subscribe: () => ({ unsubscribe: () => {} }),
                        }),
                    }),
                },
            },
            constants: {
                Revive: {
                    NativeToEthRatio: vi.fn().mockResolvedValue(1_000_000n),
                },
            },
        } as unknown as ReviveTypedApi;
    }

    describe("createSolidityContract", () => {
        describe("read", () => {
            test("encodes call, executes dry-run, and decodes result", async () => {
                const mockApi = createMockTypedApi();
                const contract = createSolidityContract(
                    mockApi,
                    `0x${"ab".repeat(20)}` as `0x${string}`,
                    erc20Abi,
                );

                const result = await contract.read("balanceOf", [`0x${"cd".repeat(20)}`]);

                expect(result).toBe(1000n);
                expect(mockApi.apis.ReviveApi.eth_transact).toHaveBeenCalledOnce();
            });

            test("returns undefined for empty response data", async () => {
                const mockApi = createMockTypedApi({
                    ethTransactResult: {
                        success: true,
                        value: {
                            data: Binary.fromHex("0x"),
                            weight_required: { ref_time: 0n, proof_size: 0n },
                            max_storage_deposit: 0n,
                        },
                    },
                });
                const contract = createSolidityContract(
                    mockApi,
                    `0x${"ab".repeat(20)}` as `0x${string}`,
                    erc20Abi,
                );

                const result = await contract.read("balanceOf", [`0x${"cd".repeat(20)}`]);
                expect(result).toBeUndefined();
            });

            test("throws with revert reason on dry-run failure", async () => {
                const mockApi = createMockTypedApi({
                    ethTransactResult: {
                        success: false,
                        value: {
                            type: "Message",
                            value: "insufficient funds",
                        },
                    },
                });
                const contract = createSolidityContract(
                    mockApi,
                    `0x${"ab".repeat(20)}` as `0x${string}`,
                    erc20Abi,
                );

                await expect(contract.read("balanceOf", [`0x${"cd".repeat(20)}`])).rejects.toThrow(
                    "balanceOf: insufficient funds",
                );
            });

            test("throws generic message when no revert reason", async () => {
                const mockApi = createMockTypedApi({
                    ethTransactResult: {
                        success: false,
                        value: { type: "Unknown" },
                    },
                });
                const contract = createSolidityContract(
                    mockApi,
                    `0x${"ab".repeat(20)}` as `0x${string}`,
                    erc20Abi,
                );

                await expect(contract.read("balanceOf", [`0x${"cd".repeat(20)}`])).rejects.toThrow(
                    "balanceOf dry-run failed",
                );
            });
        });

        describe("write", () => {
            test("returns SolidityWriteResult with response and send", async () => {
                const { encodeFunctionResult } = require("viem") as typeof import("viem");
                const transferResult = encodeFunctionResult({
                    abi: erc20Abi,
                    functionName: "transfer",
                    result: true,
                });

                const mockApi = createMockTypedApi({
                    ethTransactResult: {
                        success: true,
                        value: {
                            data: Binary.fromHex(transferResult as `0x${string}`),
                            weight_required: { ref_time: 2000n, proof_size: 1000n },
                            max_storage_deposit: 200n,
                        },
                    },
                });
                const contract = createSolidityContract(
                    mockApi,
                    `0x${"ab".repeat(20)}` as `0x${string}`,
                    erc20Abi,
                    {
                        nativeToEvmRatio: 1_000_000n,
                    },
                );

                const result = await contract.write(
                    "transfer",
                    [`0x${"cd".repeat(20)}`, 500n],
                    `0x${"ef".repeat(20)}`,
                );

                expect(result.response).toBe(true);
                expect(typeof result.send).toBe("function");
                expect(typeof result.diagnose).toBe("function");
            });

            test("throws with revert reason on dry-run failure", async () => {
                const mockApi = createMockTypedApi({
                    ethTransactResult: {
                        success: false,
                        value: {
                            type: "Message",
                            value: "execution reverted",
                        },
                    },
                });
                const contract = createSolidityContract(
                    mockApi,
                    `0x${"ab".repeat(20)}` as `0x${string}`,
                    erc20Abi,
                );

                await expect(
                    contract.write(
                        "transfer",
                        [`0x${"cd".repeat(20)}`, 500n],
                        `0x${"ef".repeat(20)}`,
                    ),
                ).rejects.toThrow("transfer: execution reverted");
            });

            test("send() throws when NativeToEthRatio not yet loaded", async () => {
                const { encodeFunctionResult } = require("viem") as typeof import("viem");
                const transferResult = encodeFunctionResult({
                    abi: erc20Abi,
                    functionName: "transfer",
                    result: true,
                });

                // Mock NativeToEthRatio to never resolve
                const neverResolve = new Promise<bigint>(() => {});
                const mockApi = {
                    apis: {
                        ReviveApi: {
                            eth_transact: vi.fn().mockResolvedValue({
                                success: true,
                                value: {
                                    data: Binary.fromHex(transferResult as `0x${string}`),
                                    weight_required: { ref_time: 2000n, proof_size: 1000n },
                                    max_storage_deposit: 200n,
                                },
                            }),
                        },
                    },
                    tx: { Revive: { call: vi.fn() } },
                    constants: {
                        Revive: { NativeToEthRatio: vi.fn().mockReturnValue(neverResolve) },
                    },
                } as unknown as ReviveTypedApi;

                // No nativeToEvmRatio in options — ratio must be loaded async
                const contract = createSolidityContract(
                    mockApi,
                    `0x${"ab".repeat(20)}` as `0x${string}`,
                    erc20Abi,
                );

                const result = await contract.write(
                    "transfer",
                    [`0x${"cd".repeat(20)}`, 500n],
                    `0x${"ef".repeat(20)}`,
                );

                // Call send() immediately — ratio hasn't loaded yet
                expect(() => result.send()).toThrow("NativeToEthRatio not loaded");
            });

            test("send() creates a Revive.call transaction", async () => {
                const { encodeFunctionResult } = require("viem") as typeof import("viem");
                const transferResult = encodeFunctionResult({
                    abi: erc20Abi,
                    functionName: "transfer",
                    result: true,
                });

                const mockApi = createMockTypedApi({
                    ethTransactResult: {
                        success: true,
                        value: {
                            data: Binary.fromHex(transferResult as `0x${string}`),
                            weight_required: { ref_time: 2000n, proof_size: 1000n },
                            max_storage_deposit: 200n,
                        },
                    },
                });
                const contract = createSolidityContract(
                    mockApi,
                    `0x${"ab".repeat(20)}` as `0x${string}`,
                    erc20Abi,
                    {
                        nativeToEvmRatio: 1_000_000n,
                    },
                );

                const result = await contract.write(
                    "transfer",
                    [`0x${"cd".repeat(20)}`, 500n],
                    `0x${"ef".repeat(20)}`,
                );

                const tx = result.send();
                expect(tx).toBeDefined();
                expect(mockApi.tx.Revive.call).toHaveBeenCalledOnce();
            });

            test("diagnose() re-runs dry-run and extracts revert reason", async () => {
                const { encodeFunctionResult } = require("viem") as typeof import("viem");
                const transferResult = encodeFunctionResult({
                    abi: erc20Abi,
                    functionName: "transfer",
                    result: true,
                });

                const ethTransactFn = vi
                    .fn()
                    // First call: success (write dry-run)
                    .mockResolvedValueOnce({
                        success: true,
                        value: {
                            data: Binary.fromHex(transferResult as `0x${string}`),
                            weight_required: { ref_time: 2000n, proof_size: 1000n },
                            max_storage_deposit: 200n,
                        },
                    })
                    // Second call: failure (diagnose re-run)
                    .mockResolvedValueOnce({
                        success: false,
                        value: { type: "Message", value: "state changed" },
                    });

                const mockApi = {
                    apis: { ReviveApi: { eth_transact: ethTransactFn } },
                    tx: {
                        Revive: {
                            call: vi.fn().mockReturnValue({
                                signSubmitAndWatch: () => ({
                                    subscribe: () => ({ unsubscribe: () => {} }),
                                }),
                            }),
                        },
                    },
                    constants: { Revive: { NativeToEthRatio: vi.fn().mockResolvedValue(1n) } },
                } as unknown as ReviveTypedApi;

                const contract = createSolidityContract(
                    mockApi,
                    `0x${"ab".repeat(20)}` as `0x${string}`,
                    erc20Abi,
                    {
                        nativeToEvmRatio: 1_000_000n,
                    },
                );

                const result = await contract.write(
                    "transfer",
                    [`0x${"cd".repeat(20)}`, 500n],
                    `0x${"ef".repeat(20)}`,
                );

                const reason = await result.diagnose();
                expect(reason).toBe("state changed");
            });

            test("diagnose() returns undefined when re-run succeeds", async () => {
                const { encodeFunctionResult } = require("viem") as typeof import("viem");
                const transferResult = encodeFunctionResult({
                    abi: erc20Abi,
                    functionName: "transfer",
                    result: true,
                });

                const successResult = {
                    success: true,
                    value: {
                        data: Binary.fromHex(transferResult as `0x${string}`),
                        weight_required: { ref_time: 2000n, proof_size: 1000n },
                        max_storage_deposit: 200n,
                    },
                };

                const mockApi = createMockTypedApi({ ethTransactResult: successResult });
                const contract = createSolidityContract(
                    mockApi,
                    `0x${"ab".repeat(20)}` as `0x${string}`,
                    erc20Abi,
                    {
                        nativeToEvmRatio: 1_000_000n,
                    },
                );

                const result = await contract.write(
                    "transfer",
                    [`0x${"cd".repeat(20)}`, 500n],
                    `0x${"ef".repeat(20)}`,
                );

                const reason = await result.diagnose();
                expect(reason).toBeUndefined();
            });

            test("normalizes Binary args for viem compatibility", async () => {
                const mockApi = createMockTypedApi();
                const contract = createSolidityContract(
                    mockApi,
                    `0x${"ab".repeat(20)}` as `0x${string}`,
                    erc20Abi,
                    {
                        nativeToEvmRatio: 1_000_000n,
                    },
                );

                // Pass a Binary object as an arg — should be normalized to hex
                const binaryArg = Binary.fromHex(`0x${"cd".repeat(20)}`);
                // This should not throw — Binary is normalized before encoding
                await contract.read("balanceOf", [binaryArg]);

                expect(mockApi.apis.ReviveApi.eth_transact).toHaveBeenCalledOnce();
            });

            test("normalizes nested arrays of Binary args", async () => {
                // Cover the Array.isArray branch in normalizeForViem
                const mockApi = createMockTypedApi();
                const contract = createSolidityContract(
                    mockApi,
                    `0x${"ab".repeat(20)}` as `0x${string}`,
                    erc20Abi,
                    {
                        nativeToEvmRatio: 1_000_000n,
                    },
                );

                // Pass an array containing Binary objects
                const binaryArg = [Binary.fromHex(`0x${"cd".repeat(20)}`)];
                await contract.read("balanceOf", binaryArg);

                expect(mockApi.apis.ReviveApi.eth_transact).toHaveBeenCalledOnce();
            });

            test("lazy-loads NativeToEthRatio when not provided", async () => {
                const { encodeFunctionResult } = require("viem") as typeof import("viem");
                const transferResult = encodeFunctionResult({
                    abi: erc20Abi,
                    functionName: "transfer",
                    result: true,
                });

                const mockApi = createMockTypedApi({
                    ethTransactResult: {
                        success: true,
                        value: {
                            data: Binary.fromHex(transferResult as `0x${string}`),
                            weight_required: { ref_time: 2000n, proof_size: 1000n },
                            max_storage_deposit: 200n,
                        },
                    },
                });
                // No nativeToEvmRatio — should lazy-load from constants
                const contract = createSolidityContract(
                    mockApi,
                    `0x${"ab".repeat(20)}` as `0x${string}`,
                    erc20Abi,
                );

                const result = await contract.write(
                    "transfer",
                    [`0x${"cd".repeat(20)}`, 500n],
                    `0x${"ef".repeat(20)}`,
                );

                // Give the fire-and-forget getNativeToEvmRatio() a tick to resolve
                await new Promise((r) => setTimeout(r, 10));

                // send() should work because ratio was lazy-loaded
                const tx = result.send();
                expect(tx).toBeDefined();
                expect(mockApi.constants.Revive.NativeToEthRatio).toHaveBeenCalled();
            });

            test("diagnose() returns undefined when re-run throws", async () => {
                const { encodeFunctionResult } = require("viem") as typeof import("viem");
                const transferResult = encodeFunctionResult({
                    abi: erc20Abi,
                    functionName: "transfer",
                    result: true,
                });

                const ethTransactFn = vi
                    .fn()
                    .mockResolvedValueOnce({
                        success: true,
                        value: {
                            data: Binary.fromHex(transferResult as `0x${string}`),
                            weight_required: { ref_time: 2000n, proof_size: 1000n },
                            max_storage_deposit: 200n,
                        },
                    })
                    // Second call throws (network error)
                    .mockRejectedValueOnce(new Error("network error"));

                const mockApi = {
                    apis: { ReviveApi: { eth_transact: ethTransactFn } },
                    tx: {
                        Revive: {
                            call: vi.fn().mockReturnValue({
                                signSubmitAndWatch: () => ({
                                    subscribe: () => ({ unsubscribe: () => {} }),
                                }),
                            }),
                        },
                    },
                    constants: { Revive: { NativeToEthRatio: vi.fn().mockResolvedValue(1n) } },
                } as unknown as ReviveTypedApi;

                const contract = createSolidityContract(
                    mockApi,
                    `0x${"ab".repeat(20)}` as `0x${string}`,
                    erc20Abi,
                    {
                        nativeToEvmRatio: 1_000_000n,
                    },
                );

                const result = await contract.write(
                    "transfer",
                    [`0x${"cd".repeat(20)}`, 500n],
                    `0x${"ef".repeat(20)}`,
                );

                const reason = await result.diagnose();
                expect(reason).toBeUndefined();
            });
        });
    });
}
