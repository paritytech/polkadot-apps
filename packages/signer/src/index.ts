// Core manager
export { SignerManager } from "./signer-manager.js";

// Types
export type {
    AccountPersistence,
    ConnectionStatus,
    ProviderFactory,
    ProviderType,
    Result,
    SignerAccount,
    SignerManagerOptions,
    SignerState,
} from "./types.js";
export { err, ok } from "./types.js";

// Errors
export {
    SignerError,
    HostUnavailableError,
    HostRejectedError,
    HostDisconnectedError,
    ExtensionNotFoundError,
    ExtensionRejectedError,
    SigningFailedError,
    NoAccountsError,
    TimeoutError,
    AccountNotFoundError,
    DestroyedError,
    isHostError,
    isExtensionError,
} from "./errors.js";

// Provider interface (for custom implementations)
export type { SignerProvider, Unsubscribe } from "./providers/types.js";

// Concrete providers (for advanced / direct usage)
export { DevProvider } from "./providers/dev.js";
export type { DevKeyType, DevProviderOptions } from "./providers/dev.js";
export { ExtensionProvider } from "./providers/extension.js";
export type { ExtensionProviderOptions } from "./providers/extension.js";
export { HostProvider } from "./providers/host.js";
export type {
    ContextualAlias,
    HostProviderOptions,
    ProductAccount,
    RingLocation,
} from "./providers/host.js";

// Container detection
export { isInsideContainer } from "./container.js";

// Retry utility
export { withRetry } from "./retry.js";
export type { RetryOptions } from "./retry.js";
