import type { PolkadotSigner } from "polkadot-api";
import type { Account, WalletState } from "./types.js";

const noopSigner: PolkadotSigner = {
    publicKey: new Uint8Array(32),
    signTx: () => Promise.resolve(new Uint8Array(64)),
    signBytes: () => Promise.resolve(new Uint8Array(64)),
};

/** Create a mock Account for testing. */
export function mockAccount(overrides?: Partial<Account>): Account {
    return {
        address: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
        name: "Alice",
        publicKey: new Uint8Array(32),
        polkadotSigner: noopSigner,
        source: "test",
        ...overrides,
    };
}

/** Create a mock WalletState for testing. */
export function mockWalletState(overrides?: Partial<WalletState>): WalletState {
    return {
        status: "disconnected",
        source: null,
        accounts: [],
        selectedAccount: null,
        error: null,
        ...overrides,
    };
}
