// Terminal Adapter
export {
    createTerminalAdapter,
    SS_STABLE_STAGE_ENDPOINTS,
    SS_PASEO_STABLE_STAGE_ENDPOINTS,
} from "./adapter.js";
export type { TerminalAdapterOptions, TerminalAdapter } from "./adapter.js";

// Session Signer
export { createSessionSigner } from "./signer.js";

// Session helpers
export { waitForSessions } from "./sessions.js";

// QR Encoding
export { renderQrCode } from "./qr-encode.js";
export type { QrRenderOptions } from "./qr-encode.js";

// TODO: replace node-storage with @polkadot-apps/storage file backend
// once it supports Node.js filesystem persistence.

// Re-export SDK types consumers will need
export type {
    PappAdapter,
    HostMetadata,
    AttestationStatus,
    PairingStatus,
    UserSession,
    StoredUserSession,
    SigningPayloadRequest,
    SigningRawRequest,
    SigningPayloadResponse,
} from "@novasamatech/host-papp";
