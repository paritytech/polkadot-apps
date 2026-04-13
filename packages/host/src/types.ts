import type { hostLocalStorage, createStatementStore } from "@novasamatech/product-sdk";

/** Subset of product-sdk's hostLocalStorage that the KV store uses. */
export type HostLocalStorage = Pick<
    typeof hostLocalStorage,
    "readString" | "writeString" | "readJSON" | "writeJSON" | "clear"
>;

/** The statement store interface provided by the host API via product-sdk. */
export type HostStatementStore = ReturnType<typeof createStatementStore>;
