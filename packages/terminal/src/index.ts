// QR Login
export { startQrLogin, resumeSession, clearSession } from "./qr-login.js";

// QR Encoding
export { renderQrCode } from "./qr-encode.js";
export type { QrRenderOptions } from "./qr-encode.js";

// SSO Auth Flow (advanced use)
export { AuthFlow } from "./sso/auth-flow.js";
export type { PairedSession } from "./sso/auth-flow.js";

// Errors
export { QrLoginError, QrLoginTimeoutError, QrLoginCancelledError } from "./errors.js";

// Types
export type {
    QrLoginOptions,
    QrLoginResult,
    QrLoginController,
    TerminalSession,
} from "./types.js";
