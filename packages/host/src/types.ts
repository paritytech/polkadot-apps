import type { hostLocalStorage } from "@novasamatech/product-sdk";

/** Subset of product-sdk's hostLocalStorage that the KV store uses. */
export type HostLocalStorage = Pick<
    typeof hostLocalStorage,
    "readString" | "writeString" | "readJSON" | "writeJSON" | "clear"
>;
