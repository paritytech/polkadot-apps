import type { HostLocalStorage } from "@polkadot-apps/host";

export interface KvStore {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
    getJSON<T>(key: string): Promise<T | null>;
    setJSON(key: string, value: unknown): Promise<void>;
}

export interface KvStoreOptions {
    /** Key prefix to namespace storage keys (e.g. "myapp" → keys become "myapp:theme"). */
    prefix?: string;
    /** Override auto-detection. When provided, routes all ops through this host storage. */
    hostLocalStorage?: HostLocalStorage;
    /**
     * Directory for file-based storage in Node.js environments.
     * Default: `~/.polkadot-apps/`.
     * Ignored in browser environments where localStorage is available.
     */
    storageDir?: string;
}
