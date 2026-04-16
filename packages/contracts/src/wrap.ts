import type { PolkadotSigner, SS58String } from "polkadot-api";
import { submitAndWatch } from "@polkadot-apps/tx";
import { seedToAccount } from "@polkadot-apps/keys";
import { createLogger } from "@polkadot-apps/logger";
import { DEV_PHRASE, ss58Address } from "@polkadot-labs/hdkd-helpers";
import { ContractSignerMissingError } from "./errors.js";
import type {
    AbiEntry,
    Contract,
    ContractDef,
    ContractDefaults,
    QueryOptions,
    TxOptions,
} from "./types.js";

const log = createLogger("contracts");

/**
 * Ink SDK contract instance returned by `inkSdk.getContract()`.
 *
 * Typed as `any` because we call `.query()` / `.send()` with runtime method
 * names — the SDK's `ContractSdk<D>` requires compile-time descriptor
 * knowledge that runtime ABIs can't provide.
 */
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
 * Dev address (Alice) used as fallback origin for read-only queries when no
 * wallet is connected. Queries are dry-run simulations — the origin only
 * affects gas estimation and is safe to stub.
 *
 * This is a development convenience. In production, the origin is resolved
 * from the signerManager (logged-in account) or an explicit defaultOrigin.
 */
const QUERY_FALLBACK_ORIGIN = seedToAccount(DEV_PHRASE, "//Alice").ss58Address as SS58String;

/**
 * Resolve the origin address: explicit override → signerManager → static default.
 * For queries, pass `forQuery: true` to enable the dev-address fallback.
 */
function resolveOrigin(
    defaults: ContractDefaults,
    override?: SS58String,
    forQuery?: boolean,
): SS58String | undefined {
    if (override) return override;
    const sourceAddr = defaults.signerManager?.getState().selectedAccount?.address;
    if (sourceAddr) return sourceAddr as SS58String;
    if (defaults.origin) return defaults.origin;
    if (forQuery) {
        log.warn("No origin configured — using dev fallback (Alice) for query dry-run");
        return QUERY_FALLBACK_ORIGIN;
    }
    return undefined;
}

/**
 * Resolve the signer: explicit override → signerManager → static default.
 */
function resolveSigner(
    defaults: ContractDefaults,
    override?: PolkadotSigner,
): PolkadotSigner | undefined {
    return override ?? defaults.signerManager?.getSigner() ?? defaults.signer;
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
): Contract<ContractDef> {
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
                    const origin = resolveOrigin(defaults, overrides?.origin, true)!;
                    const queryOpts = {
                        data,
                        ...(overrides?.value !== undefined && { value: overrides.value }),
                    };

                    let result = await inkContract.query(methodName, {
                        origin,
                        ...queryOpts,
                    });

                    // If the query failed and we used a signer-provided origin,
                    // retry with the dev fallback. The signer's account may not
                    // be mapped for the Revive pallet, which causes dry-runs to
                    // fail even for read-only view calls.
                    if (!result.success && origin !== QUERY_FALLBACK_ORIGIN && !overrides?.origin) {
                        result = await inkContract.query(methodName, {
                            origin: QUERY_FALLBACK_ORIGIN,
                            ...queryOpts,
                        });
                    }

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
                    const signer = resolveSigner(defaults, overrides?.signer);
                    if (!signer) {
                        throw new ContractSignerMissingError();
                    }

                    const origin =
                        resolveOrigin(defaults, overrides?.origin) ??
                        (ss58Address(signer.publicKey) as SS58String);
                    const inkTx = inkContract.send(methodName, {
                        data,
                        origin,
                        ...(overrides?.value !== undefined && { value: overrides.value }),
                        ...(overrides?.gasLimit && { gasLimit: overrides.gasLimit }),
                        ...(overrides?.storageDepositLimit !== undefined && {
                            storageDepositLimit: overrides.storageDepositLimit,
                        }),
                    });
                    return submitAndWatch(inkTx, signer, {
                        waitFor: overrides?.waitFor,
                        timeoutMs: overrides?.timeoutMs,
                        mortalityPeriod: overrides?.mortalityPeriod,
                        onStatus: overrides?.onStatus,
                    });
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

    /** Build a partial SignerManager mock for tests. */
    function mockSigner(opts: {
        address?: string | null;
        signer?: any;
    }): import("@polkadot-apps/signer").SignerManager {
        return {
            getSigner: () => opts.signer ?? null,
            getState: () => ({
                selectedAccount: opts.address ? ({ address: opts.address } as any) : null,
            }),
        } as any;
    }

    describe("resolveOrigin", () => {
        test("explicit override wins", () => {
            const defaults: ContractDefaults = {
                origin: "5Static" as SS58String,
                signerManager: mockSigner({ address: "5Source" }),
            };
            expect(resolveOrigin(defaults, "5Override" as SS58String)).toBe("5Override");
        });

        test("signerManager wins over static default", () => {
            const defaults: ContractDefaults = {
                origin: "5Static" as SS58String,
                signerManager: mockSigner({ address: "5Source" }),
            };
            expect(resolveOrigin(defaults)).toBe("5Source");
        });

        test("falls back to static default", () => {
            const defaults: ContractDefaults = { origin: "5Static" as SS58String };
            expect(resolveOrigin(defaults)).toBe("5Static");
        });

        test("returns undefined when nothing available", () => {
            expect(resolveOrigin({})).toBeUndefined();
        });

        test("skips signerManager when no account selected", () => {
            const defaults: ContractDefaults = {
                origin: "5Static" as SS58String,
                signerManager: mockSigner({ address: null }),
            };
            expect(resolveOrigin(defaults)).toBe("5Static");
        });
    });

    describe("resolveSigner", () => {
        const fakeSigner = { id: "fake" } as any;
        const sourceSigner = { id: "source" } as any;

        test("explicit override wins", () => {
            const defaults: ContractDefaults = {
                signer: { id: "static" } as any,
                signerManager: mockSigner({ signer: sourceSigner }),
            };
            expect(resolveSigner(defaults, fakeSigner)).toBe(fakeSigner);
        });

        test("signerManager wins over static default", () => {
            const defaults: ContractDefaults = {
                signer: { id: "static" } as any,
                signerManager: mockSigner({ signer: sourceSigner }),
            };
            expect(resolveSigner(defaults)).toBe(sourceSigner);
        });

        test("falls back to static default", () => {
            const defaults: ContractDefaults = { signer: fakeSigner };
            expect(resolveSigner(defaults)).toBe(fakeSigner);
        });

        test("returns undefined when nothing available", () => {
            expect(resolveSigner({})).toBeUndefined();
        });

        test("skips signerManager when getSigner returns null", () => {
            const defaults: ContractDefaults = {
                signer: fakeSigner,
                signerManager: mockSigner({}),
            };
            expect(resolveSigner(defaults)).toBe(fakeSigner);
        });
    });

    /**
     * Build a fake ink SDK `send()` return value that works with `submitAndWatch`.
     * submitAndWatch resolves `.waited`, then calls `.signSubmitAndWatch()` which
     * returns an observable. We simulate a successful best-block inclusion.
     */
    function fakeSendResult(
        txResult: { txHash: string; ok: boolean; events?: unknown[] },
        onSign?: (signer: any) => void,
    ) {
        return {
            waited: Promise.resolve({
                signSubmitAndWatch: (signer: any) => {
                    onSign?.(signer);
                    return {
                        subscribe: (handlers: {
                            next: (e: any) => void;
                            error: (e: Error) => void;
                        }) => {
                            // Emit signed → best-block sequence
                            handlers.next({ type: "signed", txHash: txResult.txHash });
                            handlers.next({
                                type: "txBestBlocksState",
                                txHash: txResult.txHash,
                                found: true,
                                ok: txResult.ok,
                                events: txResult.events ?? [],
                                block: { hash: "0xblock", number: 1, index: 0 },
                            });
                            return { unsubscribe: () => {} };
                        },
                    };
                },
            }),
        };
    }

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

        test("query uses fallback origin when nothing else available", async () => {
            let captured: any;
            const fakeInk = {
                query: async (_: string, args: any) => {
                    captured = args;
                    return { success: true, value: { response: 0 } };
                },
            };
            const wrapped = wrapContract(fakeInk, abi, {});

            await wrapped.getCount.query();
            expect(captured.origin).toBe(QUERY_FALLBACK_ORIGIN);
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

        test("tx calls submitAndWatch via inkContract.send", async () => {
            let sendCapture: any;
            const fakeInk = {
                send: (method: string, args: any) => {
                    sendCapture = { method, args };
                    return fakeSendResult({ txHash: "0xabc", ok: true, events: [{ type: "ok" }] });
                },
            };
            const fakeSigner = { publicKey: new Uint8Array(32) } as any;
            const wrapped = wrapContract(fakeInk, abi, { signer: fakeSigner });

            const result = await wrapped.increment.tx();
            expect(sendCapture.method).toBe("increment");
            expect(result.txHash).toBe("0xabc");
            expect(result.ok).toBe(true);
            expect(result.block.hash).toBe("0xblock");
        });

        test("tx passes positional args and overrides", async () => {
            let sendCapture: any;
            let signerCapture: any;
            const overrideSigner = { publicKey: new Uint8Array(32) } as any;
            const fakeInk = {
                send: (_: string, args: any) => {
                    sendCapture = args;
                    return fakeSendResult({ txHash: "0x1", ok: true }, (s) => {
                        signerCapture = s;
                    });
                },
            };
            const wrapped = wrapContract(fakeInk, abi, {
                signer: { publicKey: new Uint8Array(32) } as any,
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
            const fakeInk = { send: () => fakeSendResult({ txHash: "0x1", ok: true }) };
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

        test("query uses signerManager origin when no static default", async () => {
            let captured: any;
            const fakeInk = {
                query: async (_: string, args: any) => {
                    captured = args;
                    return { success: true, value: { response: 1 } };
                },
            };
            const wrapped = wrapContract(fakeInk, abi, {
                signerManager: mockSigner({ address: "5FromSource" }),
            });

            await wrapped.getCount.query();
            expect(captured.origin).toBe("5FromSource");
        });

        test("tx uses signerManager signer when no static default", async () => {
            const sourceSigner = { id: "host-signer", publicKey: new Uint8Array(32) } as any;
            let signerUsed: any;
            const fakeInk = {
                send: () =>
                    fakeSendResult({ txHash: "0x1", ok: true }, (s) => {
                        signerUsed = s;
                    }),
            };
            const wrapped = wrapContract(fakeInk, abi, {
                signerManager: mockSigner({ address: "5Host", signer: sourceSigner }),
            });

            await wrapped.increment.tx();
            expect(signerUsed).toBe(sourceSigner);
        });

        test("signerManager tracks account changes between calls", async () => {
            let currentAccount = "5Alice";
            const origins: string[] = [];

            const fakeInk = {
                query: async (_: string, args: any) => {
                    origins.push(args.origin);
                    return { success: true, value: { response: 0 } };
                },
            };
            // Use a live mock that reads currentAccount at call time
            const wrapped = wrapContract(fakeInk, abi, {
                signerManager: {
                    getSigner: () => null,
                    getState: () => ({ selectedAccount: { address: currentAccount } }),
                } as any,
            });

            await wrapped.getCount.query();
            currentAccount = "5Bob";
            await wrapped.getCount.query();

            expect(origins).toEqual(["5Alice", "5Bob"]);
        });
    });
}
