/**
 * Bridge from @polkadot-apps/storage KvStore to the novasama StorageAdapter interface.
 *
 * Uses the file-based backend added to @polkadot-apps/storage, which persists
 * data to ~/.polkadot-apps/ in Node.js environments.
 */
import type { StorageAdapter } from "@novasamatech/storage-adapter";
import { createKvStore } from "@polkadot-apps/storage";
import { fromPromise } from "neverthrow";

function toError(e: unknown): Error {
    return e instanceof Error ? e : new Error(String(e));
}

/**
 * Create a StorageAdapter backed by @polkadot-apps/storage.
 *
 * In Node.js this uses the file-based backend (~/.polkadot-apps/).
 * In browsers it falls back to localStorage.
 */
export async function createStorageAdapter(
    appId: string,
    storageDir?: string,
): Promise<StorageAdapter> {
    const store = await createKvStore({ prefix: appId, storageDir });
    const subscribers = new Map<string, Set<(value: string | null) => unknown>>();

    function notifySubscribers(key: string, value: string | null) {
        const subs = subscribers.get(key);
        if (subs) {
            for (const cb of subs) {
                try {
                    cb(value);
                } catch {
                    /* ignore */
                }
            }
        }
    }

    return {
        read(key: string) {
            return fromPromise(store.get(key), toError);
        },

        write(key: string, value: string) {
            return fromPromise(
                store.set(key, value).then(() => {
                    notifySubscribers(key, value);
                }),
                toError,
            ).map(() => undefined as void);
        },

        clear(key: string) {
            return fromPromise(
                store.remove(key).then(() => {
                    notifySubscribers(key, null);
                }),
                toError,
            ).map(() => undefined as void);
        },

        subscribe(key: string, callback: (value: string | null) => unknown) {
            if (!subscribers.has(key)) {
                subscribers.set(key, new Set());
            }
            subscribers.get(key)!.add(callback);
            return () => {
                subscribers.get(key)?.delete(callback);
            };
        },
    };
}

if (import.meta.vitest) {
    const { describe, test, expect, beforeEach, afterEach } = import.meta.vitest;
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    describe("createStorageAdapter", () => {
        let testDir: string;

        beforeEach(async () => {
            testDir = await mkdtemp(join(tmpdir(), "terminal-storage-test-"));
        });

        afterEach(async () => {
            try {
                await rm(testDir, { recursive: true });
            } catch {
                /* ignore */
            }
        });

        test("write and read round-trip", async () => {
            const adapter = await createStorageAdapter("test", testDir);
            const writeResult = await adapter.write("key1", "hello");
            expect(writeResult.isOk()).toBe(true);
            const readResult = await adapter.read("key1");
            expect(readResult.isOk()).toBe(true);
            expect(readResult._unsafeUnwrap()).toBe("hello");
        });

        test("read returns null for missing key", async () => {
            const adapter = await createStorageAdapter("test", testDir);
            const result = await adapter.read("nonexistent");
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBeNull();
        });

        test("clear removes key", async () => {
            const adapter = await createStorageAdapter("test", testDir);
            await adapter.write("key1", "value");
            await adapter.clear("key1");
            const result = await adapter.read("key1");
            expect(result._unsafeUnwrap()).toBeNull();
        });

        test("subscribe notifies on write", async () => {
            const adapter = await createStorageAdapter("test", testDir);
            const values: (string | null)[] = [];
            adapter.subscribe("key1", (v: string | null) => values.push(v));
            await adapter.write("key1", "hello");
            expect(values).toEqual(["hello"]);
        });

        test("subscribe notifies on clear", async () => {
            const adapter = await createStorageAdapter("test", testDir);
            const values: (string | null)[] = [];
            await adapter.write("key1", "hello");
            adapter.subscribe("key1", (v: string | null) => values.push(v));
            await adapter.clear("key1");
            expect(values).toEqual([null]);
        });

        test("unsubscribe stops notifications", async () => {
            const adapter = await createStorageAdapter("test", testDir);
            const values: (string | null)[] = [];
            const unsub = adapter.subscribe("key1", (v: string | null) => values.push(v));
            await adapter.write("key1", "first");
            unsub();
            await adapter.write("key1", "second");
            expect(values).toEqual(["first"]);
        });
    });

    describe("toError", () => {
        test("returns Error instances unchanged", () => {
            const original = new TypeError("boom");
            expect(toError(original)).toBe(original);
        });

        test("wraps non-Error string values", () => {
            const result = toError("primitive failure");
            expect(result).toBeInstanceOf(Error);
            expect(result.message).toBe("primitive failure");
        });

        test("wraps non-Error nullish values", () => {
            const result = toError(null);
            expect(result).toBeInstanceOf(Error);
            expect(result.message).toBe("null");
        });
    });
}
