import { generateMnemonic } from "@polkadot-labs/hdkd-helpers";

import { seedToAccount } from "./seed-to-account.js";
import type { KeyStorage, SessionKeyInfo } from "./types.js";

const STORAGE_PREFIX = "session-key:";

function detectStorage(): KeyStorage | null {
    if (typeof globalThis.localStorage !== "undefined") {
        return {
            get: (key) => globalThis.localStorage.getItem(key),
            set: (key, value) => globalThis.localStorage.setItem(key, value),
            remove: (key) => globalThis.localStorage.removeItem(key),
        };
    }
    return null;
}

/**
 * Manages an sr25519 account derived from a BIP39 mnemonic.
 *
 * Persists to `localStorage` when available (browser). In environments without
 * `localStorage` (Node/SSR), operates statelessly. When `@polkadot-apps/storage`
 * is available, the internals will switch to use it for uniform Host API support.
 *
 * @param options.name - Identifies this session key. Defaults to `"default"`.
 *   Use different names to manage multiple independent session keys.
 */
export class SessionKeyManager {
    private readonly storageKey: string;
    private readonly storage: KeyStorage | null;

    constructor(options?: { name?: string }) {
        this.storage = detectStorage();
        this.storageKey = STORAGE_PREFIX + (options?.name ?? "default");
    }

    /**
     * Create a new session key from a fresh mnemonic.
     * Persists the mnemonic if storage is available.
     */
    async create(): Promise<SessionKeyInfo> {
        const mnemonic = generateMnemonic();
        if (this.storage) {
            await this.storage.set(this.storageKey, mnemonic);
        }
        return { mnemonic, account: seedToAccount(mnemonic) };
    }

    /**
     * Load an existing session key from storage.
     * Returns null if no mnemonic is stored or no storage is available.
     */
    async get(): Promise<SessionKeyInfo | null> {
        if (!this.storage) return null;
        const mnemonic = await this.storage.get(this.storageKey);
        if (!mnemonic) return null;
        return { mnemonic, account: seedToAccount(mnemonic) };
    }

    /**
     * Load existing or create a new session key.
     */
    async getOrCreate(): Promise<SessionKeyInfo> {
        const existing = await this.get();
        if (existing) return existing;
        return this.create();
    }

    /**
     * Derive a session key from an explicit mnemonic (no storage interaction).
     */
    fromMnemonic(mnemonic: string): SessionKeyInfo {
        return { mnemonic, account: seedToAccount(mnemonic) };
    }

    /**
     * Clear the stored mnemonic from storage.
     */
    async clear(): Promise<void> {
        if (this.storage) {
            await this.storage.remove(this.storageKey);
        }
    }
}

if (import.meta.vitest) {
    const { test, expect, describe } = import.meta.vitest;

    const TEST_MNEMONIC =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

    function shimLocalStorage(): {
        store: Record<string, string>;
        cleanup: () => void;
    } {
        const store: Record<string, string> = {};
        // @ts-expect-error — shimming localStorage for test
        globalThis.localStorage = {
            getItem: (k: string) => store[k] ?? null,
            setItem: (k: string, v: string) => {
                store[k] = v;
            },
            removeItem: (k: string) => {
                delete store[k];
            },
        };
        return {
            store,
            cleanup: () => {
                // @ts-expect-error — remove shim
                delete globalThis.localStorage;
            },
        };
    }

    describe("SessionKeyManager", () => {
        test("fromMnemonic produces deterministic results", () => {
            const skm = new SessionKeyManager();
            const a = skm.fromMnemonic(TEST_MNEMONIC);
            const b = skm.fromMnemonic(TEST_MNEMONIC);
            expect(a.mnemonic).toBe(TEST_MNEMONIC);
            expect(a.account.ss58Address).toBe(b.account.ss58Address);
            expect(a.account.h160Address).toBe(b.account.h160Address);
        });

        test("get returns null when no storage available (Node/SSR)", async () => {
            const skm = new SessionKeyManager();
            expect(await skm.get()).toBeNull();
        });

        test("create without storage returns key but does not persist", async () => {
            // In Node (no localStorage), create still returns a valid key
            const skm = new SessionKeyManager();
            const info = await skm.create();
            expect(info.mnemonic).toBeTruthy();
            expect(info.account.ss58Address).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
            // But it's not persisted — get returns null
            expect(await skm.get()).toBeNull();
        });

        test("fromMnemonic throws on invalid mnemonic", () => {
            const skm = new SessionKeyManager();
            expect(() => skm.fromMnemonic("invalid words here")).toThrow("Invalid mnemonic phrase");
        });

        test("create and get with localStorage", async () => {
            const { store, cleanup } = shimLocalStorage();
            try {
                const skm = new SessionKeyManager();
                const info = await skm.create();
                expect(info.mnemonic).toBeTruthy();
                expect(info.account.ss58Address).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
                expect(store["session-key:default"]).toBe(info.mnemonic);

                const loaded = await skm.get();
                expect(loaded?.mnemonic).toBe(info.mnemonic);
            } finally {
                cleanup();
            }
        });

        test("getOrCreate creates then returns cached", async () => {
            const { store, cleanup } = shimLocalStorage();
            try {
                const skm = new SessionKeyManager();
                const created = await skm.getOrCreate();
                expect(Object.keys(store).length).toBe(1);

                const loaded = await skm.getOrCreate();
                expect(loaded.mnemonic).toBe(created.mnemonic);
                expect(loaded.account.ss58Address).toBe(created.account.ss58Address);
            } finally {
                cleanup();
            }
        });

        test("clear removes mnemonic from storage", async () => {
            const { store, cleanup } = shimLocalStorage();
            try {
                const skm = new SessionKeyManager();
                await skm.create();
                expect(Object.keys(store).length).toBe(1);

                await skm.clear();
                expect(Object.keys(store).length).toBe(0);
                expect(await skm.get()).toBeNull();
            } finally {
                cleanup();
            }
        });

        test("name separates storage keys", async () => {
            const { store, cleanup } = shimLocalStorage();
            try {
                const main = new SessionKeyManager({ name: "main" });
                const burner = new SessionKeyManager({ name: "burner" });

                const mainInfo = await main.create();
                const burnerInfo = await burner.create();

                expect(store["session-key:main"]).toBe(mainInfo.mnemonic);
                expect(store["session-key:burner"]).toBe(burnerInfo.mnemonic);
                expect(mainInfo.account.ss58Address).not.toBe(burnerInfo.account.ss58Address);

                await main.clear();
                expect(store["session-key:main"]).toBeUndefined();
                expect(store["session-key:burner"]).toBe(burnerInfo.mnemonic);
            } finally {
                cleanup();
            }
        });
    });
}
