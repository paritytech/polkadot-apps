import type { SS58String } from "polkadot-api";
import type {
    AbiEntry,
    ContractDefaults,
    QueryOptions,
    QueryResult,
    TxOptions,
    TxResult,
} from "./types.js";

// The ink SDK contract type — kept as `any` to avoid coupling to internal SDK shapes.
type InkContract = any;

/** Extract method name → ordered parameter names from the ABI. */
function buildMethodArgMap(abi: AbiEntry[]): Record<string, string[]> {
    const map: Record<string, string[]> = {};
    for (const entry of abi) {
        if (entry.type === "function" && entry.name) {
            map[entry.name] = entry.inputs.map((p) => p.name);
        }
    }
    return map;
}

/** Convert positional arguments to a named object matching the ABI parameter names. */
function positionalToNamed(argNames: string[], values: unknown[]): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (let i = 0; i < argNames.length; i++) {
        data[argNames[i]] = values[i];
    }
    return data;
}

/**
 * If the caller passed more arguments than the ABI expects and the last
 * argument is a plain object, treat it as an options override.
 */
function extractOverrides<T>(
    argNames: string[],
    args: unknown[],
): { positionalArgs: unknown[]; overrides?: T } {
    if (args.length > argNames.length && args.length > 0) {
        const last = args[args.length - 1];
        if (last && typeof last === "object" && !Array.isArray(last)) {
            return { positionalArgs: args.slice(0, -1), overrides: last as T };
        }
    }
    return { positionalArgs: args };
}

/**
 * Wrap an ink SDK contract instance with a proxy that exposes each ABI
 * method as `{ query, tx }` — converting positional arguments to the
 * named-parameter format the SDK expects.
 */
export function wrapContract(
    inkContract: InkContract,
    abi: AbiEntry[],
    defaults: ContractDefaults,
): Record<
    string,
    {
        query: (...args: any[]) => Promise<QueryResult<any>>;
        tx: (...args: any[]) => Promise<TxResult>;
    }
> {
    const methodArgs = buildMethodArgMap(abi);

    return new Proxy({} as any, {
        get(_, methodName: string) {
            if (typeof methodName !== "string") return undefined;
            const argNames = methodArgs[methodName];
            if (!argNames) return undefined;

            return {
                query: async (...args: unknown[]) => {
                    const { positionalArgs, overrides } = extractOverrides<QueryOptions>(
                        argNames,
                        args,
                    );
                    const data = positionalToNamed(argNames, positionalArgs);
                    const origin = overrides?.origin ?? defaults.origin;
                    if (!origin) {
                        throw new Error(
                            "No origin provided for query. Pass { origin } or set defaultOrigin.",
                        );
                    }

                    const result = await inkContract.query(methodName, {
                        origin,
                        data,
                        ...(overrides?.value !== undefined && { value: overrides.value }),
                    });
                    return {
                        success: result.success,
                        value: result.success ? result.value.response : undefined,
                        gasRequired: result.value?.gasRequired,
                    };
                },

                tx: async (...args: unknown[]) => {
                    const { positionalArgs, overrides } = extractOverrides<TxOptions>(
                        argNames,
                        args,
                    );
                    const data = positionalToNamed(argNames, positionalArgs);
                    const signer = overrides?.signer ?? defaults.signer;
                    if (!signer) {
                        throw new Error(
                            "No signer provided for tx. Pass { signer } or set defaultSigner.",
                        );
                    }

                    const origin = overrides?.origin ?? defaults.origin;
                    const tx = inkContract.send(methodName, {
                        data,
                        origin: origin ?? "",
                        ...(overrides?.value !== undefined && { value: overrides.value }),
                        ...(overrides?.gasLimit && { gasLimit: overrides.gasLimit }),
                        ...(overrides?.storageDepositLimit !== undefined && {
                            storageDepositLimit: overrides.storageDepositLimit,
                        }),
                    });
                    const result = await tx.signAndSubmit(signer);
                    return {
                        txHash: result.txHash,
                        blockHash: result.block?.hash ?? "",
                        ok: result.ok,
                        events: result.events ?? [],
                    };
                },
            };
        },
    });
}

if (import.meta.vitest) {
    const { test, expect, describe } = import.meta.vitest;

    describe("buildMethodArgMap", () => {
        test("extracts function parameter names from ABI", () => {
            const abi: AbiEntry[] = [
                { type: "constructor", inputs: [], stateMutability: "nonpayable" },
                {
                    type: "function",
                    name: "transfer",
                    inputs: [
                        { name: "to", type: "address" },
                        { name: "amount", type: "uint256" },
                    ],
                    outputs: [{ name: "", type: "bool" }],
                },
                {
                    type: "function",
                    name: "balanceOf",
                    inputs: [{ name: "owner", type: "address" }],
                    outputs: [{ name: "", type: "uint256" }],
                },
                { type: "event", name: "Transfer", inputs: [] },
            ];
            const map = buildMethodArgMap(abi);
            expect(map).toEqual({
                transfer: ["to", "amount"],
                balanceOf: ["owner"],
            });
        });

        test("returns empty map for ABI with no functions", () => {
            const abi: AbiEntry[] = [
                { type: "constructor", inputs: [] },
                { type: "event", name: "Evt", inputs: [] },
            ];
            expect(buildMethodArgMap(abi)).toEqual({});
        });
    });

    describe("positionalToNamed", () => {
        test("maps positional values to named keys", () => {
            expect(positionalToNamed(["a", "b"], [1, 2])).toEqual({ a: 1, b: 2 });
        });

        test("handles empty args", () => {
            expect(positionalToNamed([], [])).toEqual({});
        });
    });

    describe("extractOverrides", () => {
        test("returns overrides when extra object arg is present", () => {
            const result = extractOverrides<{ origin: string }>(["a"], [42, { origin: "0x1" }]);
            expect(result.positionalArgs).toEqual([42]);
            expect(result.overrides).toEqual({ origin: "0x1" });
        });

        test("returns no overrides when arg count matches", () => {
            const result = extractOverrides(["a", "b"], [1, 2]);
            expect(result.positionalArgs).toEqual([1, 2]);
            expect(result.overrides).toBeUndefined();
        });

        test("does not treat array as overrides", () => {
            const result = extractOverrides(["a"], [1, [2, 3]]);
            expect(result.positionalArgs).toEqual([1, [2, 3]]);
            expect(result.overrides).toBeUndefined();
        });

        test("does not treat primitive as overrides", () => {
            const result = extractOverrides(["a"], [1, "extra"]);
            expect(result.positionalArgs).toEqual([1, "extra"]);
            expect(result.overrides).toBeUndefined();
        });
    });

    describe("wrapContract", () => {
        const abi: AbiEntry[] = [
            {
                type: "function",
                name: "getCount",
                inputs: [],
                outputs: [{ name: "", type: "uint32" }],
                stateMutability: "view",
            },
            {
                type: "function",
                name: "increment",
                inputs: [],
                outputs: [],
                stateMutability: "nonpayable",
            },
            {
                type: "function",
                name: "add",
                inputs: [{ name: "n", type: "uint32" }],
                outputs: [],
                stateMutability: "nonpayable",
            },
        ];

        test("query calls inkContract.query with named data", async () => {
            let captured: any;
            const fakeInk = {
                query: async (method: string, args: any) => {
                    captured = { method, args };
                    return { success: true, value: { response: 42, gasRequired: 100n } };
                },
            };
            const defaults = { origin: "5Alice" as any };
            const wrapped = wrapContract(fakeInk, abi, defaults);

            const result = await wrapped.getCount.query();
            expect(captured.method).toBe("getCount");
            expect(captured.args.origin).toBe("5Alice");
            expect(captured.args.data).toEqual({});
            expect(result).toEqual({ success: true, value: 42, gasRequired: 100n });
        });

        test("query passes positional args as named data", async () => {
            let captured: any;
            const fakeInk = {
                query: async (_: string, args: any) => {
                    captured = args;
                    return { success: true, value: { response: undefined } };
                },
            };
            const wrapped = wrapContract(fakeInk, abi, { origin: "5Bob" as any });

            await wrapped.add.query(7);
            expect(captured.data).toEqual({ n: 7 });
        });

        test("query uses override origin over default", async () => {
            let captured: any;
            const fakeInk = {
                query: async (_: string, args: any) => {
                    captured = args;
                    return { success: true, value: { response: 0 } };
                },
            };
            const wrapped = wrapContract(fakeInk, abi, { origin: "5Default" as any });

            await wrapped.getCount.query({ origin: "5Override" as any });
            expect(captured.origin).toBe("5Override");
        });

        test("query throws without origin", async () => {
            const fakeInk = { query: async () => ({ success: true, value: {} }) };
            const wrapped = wrapContract(fakeInk, abi, {});

            await expect(wrapped.getCount.query()).rejects.toThrow(/No origin/);
        });

        test("query returns undefined value on failure", async () => {
            const fakeInk = {
                query: async () => ({ success: false, value: { gasRequired: 50n } }),
            };
            const wrapped = wrapContract(fakeInk, abi, { origin: "5A" as any });

            const result = await wrapped.getCount.query();
            expect(result.success).toBe(false);
            expect(result.value).toBeUndefined();
        });

        test("tx calls inkContract.send then signAndSubmit", async () => {
            let sendCapture: any;
            const fakeInk = {
                send: (method: string, args: any) => {
                    sendCapture = { method, args };
                    return {
                        signAndSubmit: async () => ({
                            txHash: "0xabc",
                            block: { hash: "0xblock" },
                            ok: true,
                            events: [{ type: "ok" }],
                        }),
                    };
                },
            };
            const fakeSigner = {} as any;
            const wrapped = wrapContract(fakeInk, abi, { signer: fakeSigner });

            const result = await wrapped.increment.tx();
            expect(sendCapture.method).toBe("increment");
            expect(result).toEqual({
                txHash: "0xabc",
                blockHash: "0xblock",
                ok: true,
                events: [{ type: "ok" }],
            });
        });

        test("tx passes positional args and overrides", async () => {
            let sendCapture: any;
            let signerCapture: any;
            const overrideSigner = { id: "override" } as any;
            const fakeInk = {
                send: (_: string, args: any) => {
                    sendCapture = args;
                    return {
                        signAndSubmit: async (s: any) => {
                            signerCapture = s;
                            return { txHash: "0x1", block: { hash: "0x2" }, ok: true, events: [] };
                        },
                    };
                },
            };
            const wrapped = wrapContract(fakeInk, abi, {
                signer: { id: "default" } as any,
                origin: "5Default" as any,
            });

            await wrapped.add.tx(99, {
                signer: overrideSigner,
                origin: "5Over" as any,
                value: 500n,
            });
            expect(sendCapture.data).toEqual({ n: 99 });
            expect(sendCapture.origin).toBe("5Over");
            expect(sendCapture.value).toBe(500n);
            expect(signerCapture).toBe(overrideSigner);
        });

        test("tx throws without signer", async () => {
            const fakeInk = { send: () => ({ signAndSubmit: async () => ({}) }) };
            const wrapped = wrapContract(fakeInk, abi, {});

            await expect(wrapped.increment.tx()).rejects.toThrow(/No signer/);
        });

        test("returns undefined for non-existent method", () => {
            const fakeInk = {};
            const wrapped = wrapContract(fakeInk, abi, {});
            expect(wrapped.nonExistent).toBeUndefined();
        });

        test("returns undefined for symbol access", () => {
            const fakeInk = {};
            const wrapped = wrapContract(fakeInk, abi, {});
            expect((wrapped as any)[Symbol.iterator]).toBeUndefined();
        });
    });
}
