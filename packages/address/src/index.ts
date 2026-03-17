export {
    isValidSs58,
    ss58Decode,
    ss58Encode,
    normalizeSs58,
    toGenericSs58,
    toPolkadotSs58,
    accountIdFromBytes,
    accountIdBytes,
} from "./ss58.js";

export {
    deriveH160,
    ss58ToH160,
    h160ToSs58,
    toH160,
    isValidH160,
} from "./h160.js";

export { truncateAddress, addressesEqual } from "./display.js";

export type { SS58String, HexString } from "@polkadot-api/substrate-bindings";
