import type { PolkadotSigner } from "polkadot-api";

/** Where the wallet connection originates from. "host" for container; extension name otherwise. */
export type WalletSource = "host" | (string & {});

/** Connection status for the wallet manager. */
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

/** A connected account with its signer. */
export interface Account {
    /** SS58-encoded address. */
    address: string;
    /** Human-readable name from the wallet, or null. */
    name: string | null;
    /** Raw public key bytes. Empty for extension accounts (not available via PJS bridge). */
    publicKey: Uint8Array;
    /** Ready-to-use signer for transactions. */
    polkadotSigner: PolkadotSigner;
    /** Which wallet source provided this account. */
    source: WalletSource;
}

/** Immutable snapshot of wallet state, emitted to subscribers. */
export interface WalletState {
    status: ConnectionStatus;
    source: WalletSource | null;
    accounts: Account[];
    selectedAccount: Account | null;
    error: string | null;
}

/** Configuration for WalletManager. */
export interface WalletConfig {
    /** Name shown in wallet connection prompts (e.g. "MyApp"). */
    dappName: string;
    /** Timeout in ms for connection attempts. Default: 20_000. */
    timeoutMs?: number;
}

/** Unsubscribe function returned by subscribe(). */
export type Unsubscribe = () => void;

/** Internal connector interface implemented by host.ts and extension.ts. */
export interface WalletConnector {
    connect(config: WalletConfig): Promise<ConnectorResult>;
    disconnect(): void;
}

/** Result returned by a connector after successful connection. */
export interface ConnectorResult {
    accounts: Account[];
    /** Optional subscription for account list changes (login/logout, account add/remove). */
    subscribe?: (cb: (accounts: Account[]) => void) => Unsubscribe;
}
