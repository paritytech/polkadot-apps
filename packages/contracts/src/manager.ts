import type { HexString } from "polkadot-api";
import type { InkSdk } from "@polkadot-api/sdk-ink";
import { wrapContract } from "./wrap.js";
import type {
    CdmJson,
    CdmJsonContract,
    Contract,
    ContractDef,
    ContractDefaults,
    ContractManagerOptions,
    Contracts,
} from "./types.js";

/**
 * Manages typed contract interactions backed by a `cdm.json` manifest.
 *
 * Pass a `signerSource` (e.g. a `SignerManager` from `@polkadot-apps/signer`)
 * so the currently logged-in account is used automatically — no manual
 * signer/origin wiring needed.
 *
 * @example
 * ```ts
 * import { getChainAPI } from "@polkadot-apps/chain-client";
 * import { ContractManager } from "@polkadot-apps/contracts";
 * import cdmJson from "./cdm.json";
 *
 * const api = await getChainAPI("paseo");
 * const manager = new ContractManager(cdmJson, api.contracts, {
 *     signerSource: signerManager, // from @polkadot-apps/signer
 * });
 *
 * // Uses the host's logged-in account automatically
 * const counter = manager.getContract("@example/counter");
 * const { value } = await counter.getCount.query();
 * await counter.increment.tx();
 * ```
 */
export class ContractManager {
    private cdmJson: CdmJson;
    private targetHash: string;
    private inkSdk: InkSdk;
    private defaults: ContractDefaults;

    constructor(cdmJson: CdmJson, inkSdk: InkSdk, options?: ContractManagerOptions) {
        this.cdmJson = cdmJson;
        this.inkSdk = inkSdk;

        if (options?.targetHash) {
            this.targetHash = options.targetHash;
        } else {
            const targets = Object.keys(cdmJson.targets);
            if (targets.length === 0) throw new Error("No targets found in cdm.json");
            this.targetHash = targets[0];
        }

        this.defaults = {
            signerSource: options?.signerSource,
            origin: options?.defaultOrigin,
            signer: options?.defaultSigner,
        };
    }

    /** Update the default origin, signer, or signerSource used by all contract handles. */
    setDefaults(defaults: ContractDefaults): void {
        if (defaults.signerSource !== undefined) this.defaults.signerSource = defaults.signerSource;
        if (defaults.origin !== undefined) this.defaults.origin = defaults.origin;
        if (defaults.signer !== undefined) this.defaults.signer = defaults.signer;
    }

    private getContractData(library: string): CdmJsonContract {
        const contractsForTarget = this.cdmJson.contracts?.[this.targetHash];
        if (!contractsForTarget || !(library in contractsForTarget)) {
            throw new Error(
                `Contract "${library}" not found in cdm.json for target ${this.targetHash}`,
            );
        }
        return contractsForTarget[library];
    }

    /**
     * Get a typed contract handle.
     *
     * Each method on the returned object has `.query()` for read-only calls
     * and `.tx()` for signed transactions. When codegen augments
     * {@link Contracts}, passing a known library name returns a fully-typed
     * handle. Without codegen the generic overload still works — methods are
     * accessible but untyped.
     */
    getContract<K extends string & keyof Contracts>(library: K): Contract<Contracts[K]>;
    getContract(library: string): Contract<ContractDef>;
    getContract(library: string): Contract<ContractDef> {
        const data = this.getContractData(library);
        const descriptor = { abi: data.abi };
        const inkContract = this.inkSdk.getContract(descriptor as any, data.address as HexString);
        return wrapContract(inkContract, data.abi, this.defaults) as Contract<ContractDef>;
    }

    /** Get the on-chain address of an installed contract. */
    getAddress(library: string): HexString {
        return this.getContractData(library).address as HexString;
    }
}

if (import.meta.vitest) {
    const { test, expect, describe } = import.meta.vitest;

    const cdmJson: CdmJson = {
        targets: {
            abc123: { "asset-hub": "wss://example.com", bulletin: "https://ipfs.example.com" },
        },
        dependencies: { abc123: { "@test/counter": "latest" } },
        contracts: {
            abc123: {
                "@test/counter": {
                    version: 0,
                    address: "0xC47274C987491d58b99747F344AE661986B580E8",
                    abi: [
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
                    ],
                    metadataCid: "bafk2bzaced...",
                },
            },
        },
    };

    const fakeInkSdk = {
        getContract: (_descriptor: any, _address: any) => ({
            query: async (_method: string, _args: any) => ({
                success: true,
                value: { response: 42, gasRequired: 100n },
            }),
            send: (_method: string, _args: any) => ({
                signAndSubmit: async () => ({
                    txHash: "0xabc",
                    block: { hash: "0xblock" },
                    ok: true,
                    events: [],
                }),
            }),
        }),
    } as unknown as InkSdk;

    describe("ContractManager", () => {
        test("constructor selects first target by default", () => {
            const mgr = new ContractManager(cdmJson, fakeInkSdk);
            expect(mgr.getAddress("@test/counter")).toBe(
                "0xC47274C987491d58b99747F344AE661986B580E8",
            );
        });

        test("constructor accepts explicit targetHash", () => {
            const mgr = new ContractManager(cdmJson, fakeInkSdk, { targetHash: "abc123" });
            expect(mgr.getAddress("@test/counter")).toBeTruthy();
        });

        test("constructor throws on empty targets", () => {
            const empty: CdmJson = { targets: {}, dependencies: {} };
            expect(() => new ContractManager(empty, fakeInkSdk)).toThrow(/No targets/);
        });

        test("getContract returns wrapped handle with query and tx", async () => {
            const mgr = new ContractManager(cdmJson, fakeInkSdk, {
                defaultOrigin: "5Alice" as any,
                defaultSigner: {} as any,
            });
            const contract = mgr.getContract("@test/counter");
            expect(contract.getCount).toBeDefined();
            expect(contract.getCount.query).toBeTypeOf("function");
            expect(contract.getCount.tx).toBeTypeOf("function");
        });

        test("getContract throws for unknown library", () => {
            const mgr = new ContractManager(cdmJson, fakeInkSdk);
            expect(() => mgr.getContract("@test/nope")).toThrow(/not found/);
        });

        test("getContract throws when contracts section is missing", () => {
            const noContracts: CdmJson = {
                targets: { abc123: { "asset-hub": "wss://x", bulletin: "https://x" } },
                dependencies: {},
            };
            const mgr = new ContractManager(noContracts, fakeInkSdk);
            expect(() => mgr.getContract("@test/counter")).toThrow(/not found/);
        });

        test("getAddress returns hex address", () => {
            const mgr = new ContractManager(cdmJson, fakeInkSdk);
            const addr = mgr.getAddress("@test/counter");
            expect(addr).toMatch(/^0x/);
        });

        test("getAddress throws for unknown library", () => {
            const mgr = new ContractManager(cdmJson, fakeInkSdk);
            expect(() => mgr.getAddress("@test/nope")).toThrow(/not found/);
        });

        test("setDefaults updates origin and signer", async () => {
            const mgr = new ContractManager(cdmJson, fakeInkSdk);
            // Initially no defaults — query would throw
            const contract = mgr.getContract("@test/counter");
            await expect(contract.getCount.query()).rejects.toThrow(/No origin/);

            mgr.setDefaults({ origin: "5NewOrigin" as any });
            const contract2 = mgr.getContract("@test/counter");
            const result = await contract2.getCount.query();
            expect(result.success).toBe(true);
        });

        test("setDefaults partially updates (origin only)", () => {
            const signer = { id: "keep" } as any;
            const mgr = new ContractManager(cdmJson, fakeInkSdk, {
                defaultOrigin: "5A" as any,
                defaultSigner: signer,
            });
            mgr.setDefaults({ origin: "5B" as any });
            // Signer should still be the original
            const contract = mgr.getContract("@test/counter");
            expect(contract.increment).toBeDefined();
        });

        test("query flows through to ink SDK", async () => {
            let queriedMethod: string | undefined;
            const trackingSdk = {
                getContract: () => ({
                    query: async (method: string) => {
                        queriedMethod = method;
                        return { success: true, value: { response: 99, gasRequired: 200n } };
                    },
                    send: () => ({ signAndSubmit: async () => ({}) }),
                }),
            } as unknown as InkSdk;

            const mgr = new ContractManager(cdmJson, trackingSdk, {
                defaultOrigin: "5X" as any,
            });
            const contract = mgr.getContract("@test/counter");
            const result = await contract.getCount.query();

            expect(queriedMethod).toBe("getCount");
            expect(result.value).toBe(99);
            expect(result.gasRequired).toBe(200n);
        });

        test("tx flows through to ink SDK", async () => {
            let sentMethod: string | undefined;
            const trackingSdk = {
                getContract: () => ({
                    query: async () => ({ success: true, value: {} }),
                    send: (method: string) => {
                        sentMethod = method;
                        return {
                            signAndSubmit: async () => ({
                                txHash: "0x1",
                                block: { hash: "0x2" },
                                ok: true,
                                events: [],
                            }),
                        };
                    },
                }),
            } as unknown as InkSdk;

            const mgr = new ContractManager(cdmJson, trackingSdk, {
                defaultSigner: {} as any,
            });
            const contract = mgr.getContract("@test/counter");
            const result = await contract.increment.tx();

            expect(sentMethod).toBe("increment");
            expect(result.txHash).toBe("0x1");
            expect(result.ok).toBe(true);
        });

        test("signerSource provides signer and origin automatically", async () => {
            const hostSigner = { id: "host" } as any;
            let capturedOrigin: string | undefined;
            let capturedSigner: any;

            const trackingSdk = {
                getContract: () => ({
                    query: async (_: string, args: any) => {
                        capturedOrigin = args.origin;
                        return { success: true, value: { response: 0 } };
                    },
                    send: (_: string, args: any) => {
                        capturedOrigin = args.origin;
                        return {
                            signAndSubmit: async (s: any) => {
                                capturedSigner = s;
                                return {
                                    txHash: "0x1",
                                    block: { hash: "0x2" },
                                    ok: true,
                                    events: [],
                                };
                            },
                        };
                    },
                }),
            } as unknown as InkSdk;

            const mgr = new ContractManager(cdmJson, trackingSdk, {
                signerSource: {
                    getSigner: () => hostSigner,
                    getState: () => ({ selectedAccount: { address: "5HostUser" } }),
                },
            });
            const contract = mgr.getContract("@test/counter");

            await contract.getCount.query();
            expect(capturedOrigin).toBe("5HostUser");

            await contract.increment.tx();
            expect(capturedSigner).toBe(hostSigner);
            expect(capturedOrigin).toBe("5HostUser");
        });

        test("signerSource can be set after construction via setDefaults", async () => {
            let capturedOrigin: string | undefined;
            const trackingSdk = {
                getContract: () => ({
                    query: async (_: string, args: any) => {
                        capturedOrigin = args.origin;
                        return { success: true, value: { response: 0 } };
                    },
                    send: () => ({ signAndSubmit: async () => ({}) }),
                }),
            } as unknown as InkSdk;

            const mgr = new ContractManager(cdmJson, trackingSdk);
            // No signer source initially — query would fail
            const contract = mgr.getContract("@test/counter");
            await expect(contract.getCount.query()).rejects.toThrow(/No origin/);

            // Add signer source
            mgr.setDefaults({
                signerSource: {
                    getSigner: () => ({}) as any,
                    getState: () => ({ selectedAccount: { address: "5Late" } }),
                },
            });
            const contract2 = mgr.getContract("@test/counter");
            await contract2.getCount.query();
            expect(capturedOrigin).toBe("5Late");
        });
    });
}
