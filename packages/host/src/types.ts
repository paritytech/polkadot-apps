/** Structural type matching product-sdk's hostLocalStorage API. */
export interface HostLocalStorage {
    readString(key: string): Promise<string>;
    writeString(key: string, value: string): Promise<void>;
    readJSON(key: string): Promise<unknown>;
    writeJSON(key: string, value: unknown): Promise<void>;
    clear(key: string): Promise<void>;
}
