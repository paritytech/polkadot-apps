import { isInsideContainer, getHostLocalStorage } from "@polkadot-apps/host";
import type { HostLocalStorage } from "@polkadot-apps/host";
import { createLogger } from "@polkadot-apps/logger";

import type { KvStore, KvStoreOptions } from "./types.js";

const log = createLogger("storage");

function prefixer(prefix?: string): (key: string) => string {
    return prefix ? (key) => `${prefix}:${key}` : (key) => key;
}

/**
 * Map a key to a filesystem-safe filename.
 *
 * Uses percent-encoding for disallowed bytes so the mapping is injective:
 * two distinct keys never produce the same filename. The `%` character is
 * itself encoded so the escape sequence cannot appear in raw input.
 */
function sanitizeFileName(key: string): string {
    return key.replace(/[^a-zA-Z0-9_.-]|%/g, (c) => {
        const hex = c.charCodeAt(0).toString(16).padStart(2, "0");
        return `%${hex}`;
    });
}

async function tryCreateFileBackend(
    applyPrefix: (key: string) => string,
    storageDir?: string,
): Promise<KvStore | null> {
    try {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const os = await import("node:os");

        const dir = storageDir ?? path.join(os.homedir(), ".polkadot-apps");
        let dirCreated = false;

        async function ensureDir(): Promise<void> {
            if (dirCreated) return;
            await fs.mkdir(dir, { recursive: true });
            dirCreated = true;
        }

        function fp(key: string): string {
            return path.join(dir, `${sanitizeFileName(applyPrefix(key))}.json`);
        }

        log.debug("Using file-based storage", { dir });

        async function get(key: string): Promise<string | null> {
            try {
                return await fs.readFile(fp(key), "utf-8");
            } catch {
                return null;
            }
        }

        async function set(key: string, value: string): Promise<void> {
            try {
                await ensureDir();
                await fs.writeFile(fp(key), value, "utf-8");
            } catch (e) {
                log.warn("File write failed", { key, error: e });
            }
        }

        return {
            get,
            set,

            async remove(key) {
                try {
                    await fs.unlink(fp(key));
                } catch {
                    // File didn't exist — fine
                }
            },

            async getJSON<T>(key: string): Promise<T | null> {
                const raw = await get(key);
                if (raw === null) return null;
                try {
                    return JSON.parse(raw) as T;
                } catch (e) {
                    log.warn("JSON parse failed for key", { key, error: e });
                    return null;
                }
            },

            async setJSON(key, value) {
                await set(key, JSON.stringify(value));
            },
        };
    } catch {
        // node:fs not available (browser environment)
        return null;
    }
}

/**
 * No-op backend for environments with no persistent storage.
 *
 * Reads return `null`, writes and removes are dropped silently. Used as a
 * last-resort fallback in edge runtimes where neither `localStorage` nor
 * `node:fs` are available (e.g. Cloudflare Workers, Deno without `--allow-fs`).
 */
function createNoopBackend(): KvStore {
    log.debug("No persistent storage backend available — using no-op");
    return {
        async get() {
            return null;
        },
        async set() {},
        async remove() {},
        async getJSON() {
            return null;
        },
        async setJSON() {},
    };
}

function createLocalStorageBackend(applyPrefix: (key: string) => string): KvStore {
    const available = typeof globalThis.localStorage !== "undefined";

    if (!available) {
        log.debug("No localStorage available (SSR/Node)");
    }

    return {
        async get(key) {
            if (!available) return null;
            try {
                return globalThis.localStorage.getItem(applyPrefix(key));
            } catch (e) {
                log.warn("localStorage.getItem failed", { key, error: e });
                return null;
            }
        },

        async set(key, value) {
            if (!available) return;
            try {
                globalThis.localStorage.setItem(applyPrefix(key), value);
            } catch (e) {
                log.warn("localStorage.setItem failed", { key, error: e });
            }
        },

        async remove(key) {
            if (!available) return;
            try {
                globalThis.localStorage.removeItem(applyPrefix(key));
            } catch (e) {
                log.warn("localStorage.removeItem failed", { key, error: e });
            }
        },

        async getJSON<T>(key: string): Promise<T | null> {
            const raw = await this.get(key);
            if (raw === null) return null;
            try {
                return JSON.parse(raw) as T;
            } catch (e) {
                log.warn("JSON parse failed for key", { key, error: e });
                return null;
            }
        },

        async setJSON(key, value) {
            await this.set(key, JSON.stringify(value));
        },
    };
}

function createHostBackend(
    hostStorage: HostLocalStorage,
    applyPrefix: (key: string) => string,
): KvStore {
    return {
        async get(key) {
            try {
                const value = await hostStorage.readString(applyPrefix(key));
                // product-sdk decodes missing keys as "" — normalize to null
                return value || null;
            } catch (e) {
                log.warn("Host readString failed", { key, error: e });
                return null;
            }
        },

        async set(key, value) {
            try {
                await hostStorage.writeString(applyPrefix(key), value);
            } catch (e) {
                log.warn("Host writeString failed", { key, error: e });
            }
        },

        async remove(key) {
            try {
                await hostStorage.clear(applyPrefix(key));
            } catch (e) {
                log.warn("Host clear failed", { key, error: e });
            }
        },

        async getJSON<T>(key: string): Promise<T | null> {
            try {
                const value = await hostStorage.readJSON(applyPrefix(key));
                return (value ?? null) as T | null;
            } catch (e) {
                log.warn("Host readJSON failed", { key, error: e });
                return null;
            }
        },

        async setJSON(key, value) {
            try {
                await hostStorage.writeJSON(applyPrefix(key), value);
            } catch (e) {
                log.warn("Host writeJSON failed", { key, error: e });
            }
        },
    };
}

export async function createKvStore(options?: KvStoreOptions): Promise<KvStore> {
    const applyPrefix = prefixer(options?.prefix);

    // Explicit host storage takes precedence
    if (options?.hostLocalStorage) {
        return createHostBackend(options.hostLocalStorage, applyPrefix);
    }

    // Auto-detect container environment
    if (await isInsideContainer()) {
        const hostStorage = await getHostLocalStorage();
        if (hostStorage) {
            return createHostBackend(hostStorage, applyPrefix);
        }
        log.warn(
            "Inside container but failed to obtain host localStorage, falling back to browser",
        );
    }

    // Browser localStorage
    if (typeof globalThis.localStorage !== "undefined") {
        return createLocalStorageBackend(applyPrefix);
    }

    // Node.js file-based fallback
    const fileBackend = await tryCreateFileBackend(applyPrefix, options?.storageDir);
    if (fileBackend) return fileBackend;

    // Edge runtimes without localStorage or node:fs
    return createNoopBackend();
}

if (import.meta.vitest) {
    const { test, expect, describe, beforeEach, afterEach, vi } = import.meta.vitest;
    const { configure } = await import("@polkadot-apps/logger");

    // Silence logger during tests
    beforeEach(() => configure({ handler: () => {} }));

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

    function mockHostStorage(): HostLocalStorage & { data: Map<string, unknown> } {
        const data = new Map<string, unknown>();
        return {
            data,
            async readString(key) {
                return (data.get(key) as string) ?? "";
            },
            async writeString(key, value) {
                data.set(key, value);
            },
            async readJSON(key) {
                return data.get(key) ?? null;
            },
            async writeJSON(key, value) {
                data.set(key, value);
            },
            async clear(key) {
                data.delete(key);
            },
        };
    }

    describe("localStorage backend", () => {
        let cleanup: () => void;
        let store: Record<string, string>;

        beforeEach(() => {
            const shim = shimLocalStorage();
            store = shim.store;
            cleanup = shim.cleanup;
        });
        afterEach(() => cleanup());

        test("get/set round-trip", async () => {
            const kv = createLocalStorageBackend((k) => k);
            await kv.set("key", "value");
            expect(await kv.get("key")).toBe("value");
        });

        test("get returns null for missing key", async () => {
            const kv = createLocalStorageBackend((k) => k);
            expect(await kv.get("missing")).toBeNull();
        });

        test("remove deletes key", async () => {
            const kv = createLocalStorageBackend((k) => k);
            await kv.set("key", "value");
            await kv.remove("key");
            expect(await kv.get("key")).toBeNull();
        });

        test("getJSON/setJSON round-trip", async () => {
            const kv = createLocalStorageBackend((k) => k);
            await kv.setJSON("obj", { a: 1, b: "two" });
            expect(await kv.getJSON("obj")).toEqual({ a: 1, b: "two" });
        });

        test("getJSON returns null on corrupted JSON", async () => {
            const kv = createLocalStorageBackend((k) => k);
            store["bad"] = "not-json{{{";
            expect(await kv.getJSON("bad")).toBeNull();
        });

        test("getJSON returns null for missing key", async () => {
            const kv = createLocalStorageBackend((k) => k);
            expect(await kv.getJSON("nope")).toBeNull();
        });

        test("get returns null when localStorage throws", async () => {
            globalThis.localStorage.getItem = () => {
                throw new Error("SecurityError");
            };
            const kv = createLocalStorageBackend((k) => k);
            expect(await kv.get("key")).toBeNull();
        });

        test("set silently catches when localStorage throws", async () => {
            globalThis.localStorage.setItem = () => {
                throw new Error("QuotaExceededError");
            };
            const kv = createLocalStorageBackend((k) => k);
            await expect(kv.set("key", "val")).resolves.toBeUndefined();
        });

        test("remove silently catches when localStorage throws", async () => {
            globalThis.localStorage.removeItem = () => {
                throw new Error("SecurityError");
            };
            const kv = createLocalStorageBackend((k) => k);
            await expect(kv.remove("key")).resolves.toBeUndefined();
        });
    });

    describe("prefix", () => {
        let cleanup: () => void;
        let store: Record<string, string>;

        beforeEach(() => {
            const shim = shimLocalStorage();
            store = shim.store;
            cleanup = shim.cleanup;
        });
        afterEach(() => cleanup());

        test("keys are prefixed", async () => {
            const kv = createLocalStorageBackend(prefixer("myapp"));
            await kv.set("theme", "dark");
            expect(store["myapp:theme"]).toBe("dark");
            expect(await kv.get("theme")).toBe("dark");
        });

        test("no prefix means keys used as-is", async () => {
            const kv = createLocalStorageBackend(prefixer());
            await kv.set("theme", "dark");
            expect(store["theme"]).toBe("dark");
        });
    });

    describe("host backend", () => {
        test("routes through host storage", async () => {
            const host = mockHostStorage();
            const kv = createHostBackend(host, (k) => k);
            await kv.set("key", "val");
            expect(await kv.get("key")).toBe("val");
        });

        test("getJSON/setJSON routes through host", async () => {
            const host = mockHostStorage();
            const kv = createHostBackend(host, (k) => k);
            await kv.setJSON("obj", { x: 42 });
            expect(await kv.getJSON("obj")).toEqual({ x: 42 });
        });

        test("remove routes through host clear", async () => {
            const host = mockHostStorage();
            const kv = createHostBackend(host, (k) => k);
            await kv.set("key", "val");
            await kv.remove("key");
            expect(host.data.has("key")).toBe(false);
        });

        test("get returns null when host throws", async () => {
            const host = mockHostStorage();
            host.readString = async () => {
                throw new Error("host error");
            };
            const kv = createHostBackend(host, (k) => k);
            expect(await kv.get("key")).toBeNull();
        });

        test("getJSON returns null when host throws", async () => {
            const host = mockHostStorage();
            host.readJSON = async () => {
                throw new Error("host error");
            };
            const kv = createHostBackend(host, (k) => k);
            expect(await kv.getJSON("key")).toBeNull();
        });

        test("prefix applied to host keys", async () => {
            const host = mockHostStorage();
            const kv = createHostBackend(host, prefixer("app"));
            await kv.set("key", "val");
            expect(host.data.get("app:key")).toBe("val");
        });

        test("get returns null for missing key (empty string from host)", async () => {
            const host = mockHostStorage();
            const kv = createHostBackend(host, (k) => k);
            // host.readString returns "" for missing keys, should normalize to null
            expect(await kv.get("missing")).toBeNull();
        });

        test("getJSON returns null for missing key (undefined from host)", async () => {
            const host = mockHostStorage();
            const kv = createHostBackend(host, (k) => k);
            expect(await kv.getJSON("missing")).toBeNull();
        });

        test("set silently catches host write errors", async () => {
            const host = mockHostStorage();
            host.writeString = async () => {
                throw new Error("quota");
            };
            const kv = createHostBackend(host, (k) => k);
            await expect(kv.set("key", "val")).resolves.toBeUndefined();
        });

        test("setJSON silently catches host write errors", async () => {
            const host = mockHostStorage();
            host.writeJSON = async () => {
                throw new Error("quota");
            };
            const kv = createHostBackend(host, (k) => k);
            await expect(kv.setJSON("key", { a: 1 })).resolves.toBeUndefined();
        });

        test("remove silently catches host clear errors", async () => {
            const host = mockHostStorage();
            host.clear = async () => {
                throw new Error("fail");
            };
            const kv = createHostBackend(host, (k) => k);
            await expect(kv.remove("key")).resolves.toBeUndefined();
        });
    });

    describe("SSR (no localStorage)", () => {
        test("get returns null", async () => {
            const kv = createLocalStorageBackend((k) => k);
            expect(await kv.get("anything")).toBeNull();
        });

        test("set is a no-op", async () => {
            const kv = createLocalStorageBackend((k) => k);
            await expect(kv.set("key", "value")).resolves.toBeUndefined();
        });

        test("getJSON returns null", async () => {
            const kv = createLocalStorageBackend((k) => k);
            expect(await kv.getJSON("anything")).toBeNull();
        });
    });

    describe("createKvStore", () => {
        test("uses explicit hostLocalStorage when provided", async () => {
            const host = mockHostStorage();
            const kv = await createKvStore({ hostLocalStorage: host, prefix: "test" });
            await kv.set("k", "v");
            expect(host.data.get("test:k")).toBe("v");
        });

        test("falls back to localStorage outside container", async () => {
            const { store, cleanup } = shimLocalStorage();
            try {
                const kv = await createKvStore({ prefix: "app" });
                await kv.set("x", "1");
                expect(store["app:x"]).toBe("1");
            } finally {
                cleanup();
            }
        });

        test("auto-detects host storage when inside container", async () => {
            const host = mockHostStorage();
            const hostMod = await import("@polkadot-apps/host");
            vi.spyOn(hostMod, "isInsideContainer").mockResolvedValue(true);
            vi.spyOn(hostMod, "getHostLocalStorage").mockResolvedValue(host);
            try {
                const kv = await createKvStore({ prefix: "auto" });
                await kv.set("k", "v");
                expect(host.data.get("auto:k")).toBe("v");
            } finally {
                vi.restoreAllMocks();
            }
        });

        test("falls back to localStorage when inside container but host storage unavailable", async () => {
            const { store, cleanup } = shimLocalStorage();
            const hostMod = await import("@polkadot-apps/host");
            vi.spyOn(hostMod, "isInsideContainer").mockResolvedValue(true);
            vi.spyOn(hostMod, "getHostLocalStorage").mockResolvedValue(null);
            try {
                const kv = await createKvStore({ prefix: "fb" });
                await kv.set("x", "1");
                expect(store["fb:x"]).toBe("1");
            } finally {
                vi.restoreAllMocks();
                cleanup();
            }
        });
    });

    const nodeFs = await import("node:fs/promises");
    const nodeOs = await import("node:os");
    const nodePath = await import("node:path");

    describe("file backend", () => {
        const { mkdtemp, rm, readFile } = nodeFs;
        const { tmpdir } = nodeOs;
        const { join } = nodePath;

        let testDir: string;

        beforeEach(async () => {
            testDir = await mkdtemp(join(tmpdir(), "kv-file-test-"));
        });

        afterEach(async () => {
            try {
                await rm(testDir, { recursive: true });
            } catch {
                /* ignore */
            }
        });

        async function createFileStore(prefix?: string): Promise<KvStore> {
            const backend = await tryCreateFileBackend(prefixer(prefix), testDir);
            expect(backend).not.toBeNull();
            return backend!;
        }

        test("get/set round-trip", async () => {
            const kv = await createFileStore();
            await kv.set("key", "value");
            expect(await kv.get("key")).toBe("value");
        });

        test("get returns null for missing key", async () => {
            const kv = await createFileStore();
            expect(await kv.get("missing")).toBeNull();
        });

        test("remove deletes key", async () => {
            const kv = await createFileStore();
            await kv.set("key", "value");
            await kv.remove("key");
            expect(await kv.get("key")).toBeNull();
        });

        test("remove is safe for missing key", async () => {
            const kv = await createFileStore();
            await expect(kv.remove("nonexistent")).resolves.toBeUndefined();
        });

        test("getJSON/setJSON round-trip", async () => {
            const kv = await createFileStore();
            await kv.setJSON("obj", { a: 1, b: "two", nested: { ok: true } });
            expect(await kv.getJSON("obj")).toEqual({ a: 1, b: "two", nested: { ok: true } });
        });

        test("getJSON returns null for missing key", async () => {
            const kv = await createFileStore();
            expect(await kv.getJSON("nope")).toBeNull();
        });

        test("getJSON returns null on corrupted JSON", async () => {
            const kv = await createFileStore();
            await kv.set("bad", "not-json{{{");
            expect(await kv.getJSON("bad")).toBeNull();
        });

        test("set overwrites existing value", async () => {
            const kv = await createFileStore();
            await kv.set("key", "first");
            await kv.set("key", "second");
            expect(await kv.get("key")).toBe("second");
        });

        test("prefix namespaces keys on disk", async () => {
            const kv = await createFileStore("myapp");
            await kv.set("theme", "dark");
            // ":" is percent-encoded as %3a in the filename
            const content = await readFile(join(testDir, "myapp%3atheme.json"), "utf-8");
            expect(content).toBe("dark");
        });

        test("distinct keys never share a filename (sanitizer is injective)", async () => {
            // Under a naive "replace unsafe chars with _" sanitizer, these
            // three prefix variants would all map to the same file.
            const kvColon = await createFileStore("my:app");
            const kvUnderscore = await createFileStore("my_app");
            const kvSpace = await createFileStore("my app");
            await kvColon.set("k", "colon");
            await kvUnderscore.set("k", "underscore");
            await kvSpace.set("k", "space");
            expect(await kvColon.get("k")).toBe("colon");
            expect(await kvUnderscore.get("k")).toBe("underscore");
            expect(await kvSpace.get("k")).toBe("space");
        });

        test("raw '%' in keys does not collide with the escape sequence", async () => {
            // Percent-encoding the escape char itself guarantees "%3a" as
            // literal input is distinguishable from ":" as input.
            const kv = await createFileStore();
            await kv.set(":", "colon");
            await kv.set("%3a", "escaped");
            expect(await kv.get(":")).toBe("colon");
            expect(await kv.get("%3a")).toBe("escaped");
        });

        test("different prefixes are isolated", async () => {
            const kvA = await createFileStore("app-a");
            const kvB = await createFileStore("app-b");
            await kvA.set("key", "from-a");
            await kvB.set("key", "from-b");
            expect(await kvA.get("key")).toBe("from-a");
            expect(await kvB.get("key")).toBe("from-b");
        });

        test("sanitizes special characters in keys", async () => {
            const kv = await createFileStore();
            await kv.set("key/with:special chars!", "value");
            expect(await kv.get("key/with:special chars!")).toBe("value");
        });

        test("createKvStore uses file backend when no localStorage", async () => {
            // In this Node.js test environment, localStorage is not defined,
            // so createKvStore should fall back to the file backend.
            const kv = await createKvStore({ prefix: "file-test", storageDir: testDir });
            await kv.set("x", "1");
            expect(await kv.get("x")).toBe("1");
        });

        test("createKvStore prefers localStorage over file backend when both exist", async () => {
            const { store, cleanup } = shimLocalStorage();
            try {
                const kv = await createKvStore({ prefix: "hybrid", storageDir: testDir });
                await kv.set("x", "1");
                // Went to localStorage, not the filesystem
                expect(store["hybrid:x"]).toBe("1");
                await expect(readFile(join(testDir, "hybrid%3ax.json"), "utf-8")).rejects.toThrow();
            } finally {
                cleanup();
            }
        });
    });

    describe("noop backend", () => {
        test("get/getJSON return null, set/remove are dropped", async () => {
            const kv = createNoopBackend();
            await expect(kv.set("k", "v")).resolves.toBeUndefined();
            expect(await kv.get("k")).toBeNull();
            await expect(kv.setJSON("obj", { a: 1 })).resolves.toBeUndefined();
            expect(await kv.getJSON("obj")).toBeNull();
            await expect(kv.remove("k")).resolves.toBeUndefined();
        });
    });
}
