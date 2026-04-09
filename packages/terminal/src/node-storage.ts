/**
 * File-based KvStore for Node.js environments.
 *
 * Uses JSON files in ~/.polkadot-apps/ since Node.js doesn't have localStorage.
 */
import { createLogger } from "@polkadot-apps/logger";
import type { KvStore } from "@polkadot-apps/storage";
import { join } from "node:path";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { homedir } from "node:os";

const log = createLogger("terminal:storage");

const STORAGE_DIR = join(homedir(), ".polkadot-apps");

function filePath(prefix: string, key: string): string {
    const safe = `${prefix}_${key}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    return join(STORAGE_DIR, `${safe}.json`);
}

export function createNodeKvStore(prefix: string): KvStore {
    let dirCreated = false;

    async function ensureDir(): Promise<void> {
        if (dirCreated) return;
        try {
            await mkdir(STORAGE_DIR, { recursive: true });
            dirCreated = true;
        } catch {
            // ignore
        }
    }

    return {
        async get(key) {
            try {
                return await readFile(filePath(prefix, key), "utf-8");
            } catch {
                return null;
            }
        },

        async set(key, value) {
            await ensureDir();
            try {
                await writeFile(filePath(prefix, key), value, "utf-8");
            } catch (e) {
                log.warn("Failed to write", { key, error: e });
            }
        },

        async remove(key) {
            try {
                await unlink(filePath(prefix, key));
            } catch {
                // file may not exist
            }
        },

        async getJSON<T>(key: string): Promise<T | null> {
            const raw = await this.get(key);
            if (raw === null) return null;
            try {
                return JSON.parse(raw) as T;
            } catch {
                return null;
            }
        },

        async setJSON(key, value) {
            await this.set(key, JSON.stringify(value));
        },
    };
}
