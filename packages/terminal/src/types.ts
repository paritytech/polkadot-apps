/** Options for initiating a QR login session. */
export interface QrLoginOptions {
    /**
     * Metadata URL included in the handshake payload.
     *
     * @example "https://gist.githubusercontent.com/ReinhardHatko/27415c91178d74196d7c1116d39056d5/raw/56e61d719251170828a80f12d34343a8617b9935/metadata.json"
     */
    metadataUrl: string;
    /** Statement Store WebSocket endpoint(s) for pairing. */
    endpoints?: string[];
    /** Session timeout in milliseconds. Default: 120_000 (2 minutes). */
    timeoutMs?: number;
    /** Called with the deep link URI before QR display — useful for custom rendering. */
    onPairingUri?: (uri: string) => void;
}

/** Result of a completed QR login pairing. */
export interface QrLoginResult {
    /** SS58 address (generic prefix 42). */
    address: string;
    /** Raw 32-byte account ID / public key. */
    publicKey: Uint8Array;
    /** Human-readable account name, if provided by the wallet. */
    name: string | null;
    /** The session ID (hex-encoded local account ID). */
    sessionId: string;
}

/** Controller for an in-progress QR login session. */
export interface QrLoginController {
    /** The `polkadotapp://pair?handshake=0x...` deep link URI. */
    pairingUri: string;
    /** The session ID (hex-encoded local account ID). */
    sessionId: string;
    /** Promise that resolves when the wallet responds, or rejects on timeout/cancel. */
    result: Promise<QrLoginResult>;
    /** Cancel the login attempt. */
    cancel(): void;
    /** Clean up resources (Statement Store subscription, timers). */
    destroy(): void;
}

/** Persisted session state. */
export interface TerminalSession {
    /** Hex-encoded local account ID. */
    sessionId: string;
    /** SS58 address of the remote (paired) account. */
    address: string;
    /** Hex-encoded remote public key (Uint8Array doesn't JSON-serialize). */
    publicKeyHex: string;
    /** Human-readable name, if available. */
    name: string | null;
    /** Unix timestamp (ms) when the session was created. */
    createdAt: number;
    /** Unix timestamp (ms) when the session expires. */
    expiresAt: number;
}
