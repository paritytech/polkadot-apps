# @polkadot-apps/signer API Reference

> **`SS58String`** is a branded `string` type from `@polkadot-apps/address` (re-exported from `@polkadot-api/substrate-bindings`). `SignerAccount.address` uses this type.

## SignerManager

Core orchestrator for signer management. Manages account discovery and signer creation across multiple providers (Host API, browser extensions, dev accounts). Framework-agnostic -- use `subscribe()` to integrate with React, Vue, or any framework.

```ts
import { SignerManager } from "@polkadot-apps/signer";
```

### Constructor

```ts
new SignerManager(options?: SignerManagerOptions)
```

### Methods

#### getState

```ts
getState(): SignerState
```

Get a snapshot of the current state.

#### subscribe

```ts
subscribe(callback: (state: SignerState) => void): () => void
```

Subscribe to state changes. The callback fires on every state mutation. Returns an unsubscribe function.

#### connect

```ts
connect(providerType?: ProviderType): Promise<Result<SignerAccount[], SignerError>>
```

Connect to a provider. If no provider type is specified, runs environment-aware auto-detection:

**Inside a container** (iframe/webview):
1. Try direct Host API connection (preferred, idiomatic path)
2. If host fails, try Spektr extension injection as fallback
3. If both fail, return error

**Outside a container** (standalone browser):
1. Try browser extensions directly
2. If fails, return error

When connecting to a specific provider (`"host"`, `"extension"`, or `"dev"`), it is used directly.

#### disconnect

```ts
disconnect(): void
```

Disconnect from the current provider and reset state.

#### selectAccount

```ts
selectAccount(address: string): Result<SignerAccount, SignerError>
```

Select an account by SS58 address. Returns the account on success, or `AccountNotFoundError`.

#### getSigner

```ts
getSigner(): PolkadotSigner | null
```

Get the `PolkadotSigner` for the currently selected account. Returns `null` if no account is selected or the manager is disconnected.

#### signRaw

```ts
signRaw(data: Uint8Array): Promise<Result<Uint8Array, SignerError>>
```

Sign arbitrary bytes with the currently selected account. Convenience wrapper around `PolkadotSigner.signBytes`. Useful for master key derivation, message signing, and proof generation.

#### getProductAccount (host-only)

```ts
getProductAccount(
  dotNsIdentifier: string,
  derivationIndex?: number,  // default: 0
): Promise<Result<SignerAccount, SignerError>>
```

Get an app-scoped product account from the host. Product accounts are derived by the host wallet for each app, identified by `dotNsIdentifier` (e.g., `"mark3t.dot"`). Returns `HostUnavailableError` if not connected via host provider.

#### getProductAccountAlias (host-only)

```ts
getProductAccountAlias(
  dotNsIdentifier: string,
  derivationIndex?: number,  // default: 0
): Promise<Result<ContextualAlias, SignerError>>
```

Get a contextual alias for a product account via Ring VRF. Aliases prove account membership in a ring without revealing which account produced the alias.

#### createRingVRFProof (host-only)

```ts
createRingVRFProof(
  dotNsIdentifier: string,
  derivationIndex: number,
  location: RingLocation,
  message: Uint8Array,
): Promise<Result<Uint8Array, SignerError>>
```

Create a Ring VRF proof for anonymous operations. Proves that the signer is a member of the ring at the given location without revealing which member.

#### getAvailableExtensions

```ts
getAvailableExtensions(): Promise<string[]>
```

List available browser extensions. Async because extensions inject into `window.injectedWeb3` asynchronously after page load.

#### destroy

```ts
destroy(): void
```

Destroy the manager and release all resources. After calling `destroy()`, the manager is unusable. All methods return `DestroyedError`.

---

## Providers

### SignerProvider (interface)

All providers implement this interface:

```ts
interface SignerProvider {
  readonly type: ProviderType;
  connect(signal?: AbortSignal): Promise<Result<SignerAccount[], SignerError>>;
  disconnect(): void;
  onStatusChange(callback: (status: ConnectionStatus) => void): Unsubscribe;
  onAccountsChange(callback: (accounts: SignerAccount[]) => void): Unsubscribe;
}
```

### DevProvider

Provider for Substrate development accounts.

```ts
import { DevProvider } from "@polkadot-apps/signer";

const provider = new DevProvider(options?: DevProviderOptions);
const result = await provider.connect();
```

**DevProviderOptions:**
```ts
interface DevProviderOptions {
  names?: readonly string[];        // Default: ["Alice", "Bob", "Charlie", "Dave", "Eve", "Ferdie"]
  mnemonic?: string;                // Default: well-known DEV_PHRASE
  ss58Prefix?: number;              // Default: 42
  keyType?: DevKeyType;             // "sr25519" | "ed25519", Default: "sr25519"
}
```

Dev accounts are stateless and always "connected". `disconnect()`, `onStatusChange()`, and `onAccountsChange()` are no-ops.

### ExtensionProvider

Provider for browser-injected wallet extensions.

```ts
import { ExtensionProvider } from "@polkadot-apps/signer";

const provider = new ExtensionProvider(options?: ExtensionProviderOptions);
const result = await provider.connect();
```

**ExtensionProviderOptions:**
```ts
interface ExtensionProviderOptions {
  extensionName?: string;       // Target specific extension (e.g., "talisman", "polkadot-js")
  dappName?: string;            // App name for permission request. Default: "Polkadot App"
  injectionWait?: number;       // Time in ms to wait for extension injection. Default: 500
  api?: ExtensionApi;           // @internal Custom extension API for testing
}
```

Discovers extensions via `window.injectedWeb3`, connects to the first available (or specified named) extension. Subscribes to account changes from the extension.

### HostProvider

Provider for the Host API (Polkadot Desktop / Android).

```ts
import { HostProvider } from "@polkadot-apps/signer";

const provider = new HostProvider(options?: HostProviderOptions);
const result = await provider.connect();
```

**HostProviderOptions:**
```ts
interface HostProviderOptions {
  ss58Prefix?: number;     // Default: 42
  maxRetries?: number;     // Default: 3
  retryDelay?: number;     // Initial retry delay in ms. Default: 500
  loadSdk?: () => Promise<ProductSdkModule>;  // @internal Custom SDK loader
}
```

Dynamically imports `@novasamatech/product-sdk` at runtime so it remains an optional peer dependency.

**Additional host-only methods:**
- `getProductAccount(dotNsIdentifier, derivationIndex?)` - Get app-scoped product account
- `getProductAccountAlias(dotNsIdentifier, derivationIndex?)` - Get Ring VRF contextual alias
- `createRingVRFProof(dotNsIdentifier, derivationIndex, location, message)` - Create Ring VRF proof

**Static method:**
```ts
static injectSpektr(loadSdk?: () => Promise<ProductSdkModule>): Promise<boolean>
```

Inject the host wallet as a Spektr extension into `window.injectedWeb3`. Compatibility fallback for when direct Host API connection fails.

---

## Utility Functions

### isInsideContainer

```ts
function isInsideContainer(): boolean
```

Detect if running inside a Host container (Polkadot Desktop / Android). Synchronous check for `__HOST_WEBVIEW_MARK__`, `__HOST_API_PORT__`, or iframe detection.

### withRetry (signer-specific)

```ts
function withRetry<T, E>(
  fn: (attempt: number) => Promise<Result<T, E>>,
  options?: RetryOptions,
): Promise<Result<T, E>>
```

Result-based retry with exponential backoff for signer connection attempts. Different from the tx package's exception-based `withRetry`.

**RetryOptions (signer):**
```ts
interface RetryOptions {
  maxAttempts?: number;           // Default: 3
  initialDelay?: number;          // Default: 500
  backoffMultiplier?: number;     // Default: 2
  maxDelay?: number;              // Default: 10_000
  signal?: AbortSignal;
}
```

### ok / err

```ts
function ok<T>(value: T): Result<T, never>
function err<E>(error: E): Result<never, E>
```

Create successful or failed `Result` values.

---

## Error Classes

All signer errors extend `SignerError`:

### SignerError (base)

```ts
class SignerError extends Error {
  constructor(message: string, options?: ErrorOptions)
}
```

### HostUnavailableError

```ts
class HostUnavailableError extends SignerError {
  constructor(message?: string)  // Default: "Host API is not available"
}
```

### HostRejectedError

```ts
class HostRejectedError extends SignerError {
  constructor(message?: string)  // Default: "Host rejected the request"
}
```

### HostDisconnectedError

```ts
class HostDisconnectedError extends SignerError {
  constructor(message?: string)  // Default: "Host connection lost"
}
```

### ExtensionNotFoundError

```ts
class ExtensionNotFoundError extends SignerError {
  readonly extensionName: string;
  constructor(extensionName: string, message?: string)
}
```

### ExtensionRejectedError

```ts
class ExtensionRejectedError extends SignerError {
  readonly extensionName: string;
  constructor(extensionName: string, message?: string)
}
```

### SigningFailedError

```ts
class SigningFailedError extends SignerError {
  constructor(cause: unknown, message?: string)
}
```

### NoAccountsError

```ts
class NoAccountsError extends SignerError {
  readonly provider: ProviderType;
  constructor(provider: ProviderType, message?: string)
}
```

### TimeoutError

```ts
class TimeoutError extends SignerError {
  readonly operation: string;
  readonly ms: number;
  constructor(operation: string, ms: number)
}
```

### AccountNotFoundError

```ts
class AccountNotFoundError extends SignerError {
  readonly address: string;
  constructor(address: string)
}
```

### DestroyedError

```ts
class DestroyedError extends SignerError {
  constructor()
}
```

### Type Guards

```ts
function isHostError(e: SignerError): e is HostUnavailableError | HostRejectedError | HostDisconnectedError
function isExtensionError(e: SignerError): e is ExtensionNotFoundError | ExtensionRejectedError
```

---

## Types

### SignerAccount

```ts
interface SignerAccount {
  address: SS58String;                // SS58 address (prefix 42 by default)
  h160Address: `0x${string}`;        // H160 EVM address
  publicKey: Uint8Array;              // Raw public key (32 bytes)
  name: string | null;                // Human-readable name if available
  source: ProviderType;               // "host" | "extension" | "dev"
  getSigner(): PolkadotSigner;        // Get the PolkadotSigner for this account
}
```

### SignerState

```ts
interface SignerState {
  status: ConnectionStatus;
  accounts: readonly SignerAccount[];
  selectedAccount: SignerAccount | null;
  activeProvider: ProviderType | null;
  error: SignerError | null;
}
```

### SignerManagerOptions

```ts
interface SignerManagerOptions {
  ss58Prefix?: number;                      // Default: 42
  hostTimeout?: number;                     // Default: 10_000
  extensionTimeout?: number;                // Default: 1_000
  maxRetries?: number;                      // Default: 3
  createProvider?: ProviderFactory;         // Custom provider factory
  dappName?: string;                        // Default: "polkadot-app"
  persistence?: AccountPersistence | null;  // null to disable, undefined for auto-detect
}
```

### ConnectionStatus

```ts
type ConnectionStatus = "disconnected" | "connecting" | "connected";
```

### ProviderType

```ts
type ProviderType = "host" | "extension" | "dev";
```

### Result

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

### AccountPersistence

```ts
interface AccountPersistence {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}
```

`globalThis.localStorage` satisfies this interface. Pass `null` to disable persistence.

### ProviderFactory

```ts
type ProviderFactory = (type: ProviderType) => SignerProvider;
```

### Unsubscribe

```ts
type Unsubscribe = () => void;
```

### ProductAccount

```ts
interface ProductAccount {
  dotNsIdentifier: string;
  derivationIndex: number;
  publicKey: Uint8Array;
}
```

### ContextualAlias

```ts
interface ContextualAlias {
  context: Uint8Array;
  alias: Uint8Array;
}
```

### RingLocation

```ts
interface RingLocation {
  genesisHash: string;
  ringRootHash: string;
  hints?: { palletInstance?: number } | undefined;
}
```

### DevKeyType

```ts
type DevKeyType = "sr25519" | "ed25519";
```

## Account Flow

Typical flow for connecting and using accounts:

1. **Initialize** - `new SignerManager(options)`
2. **Subscribe** - `manager.subscribe(state => updateUI(state))`
3. **Connect** - `await manager.connect()` (auto-detect) or `await manager.connect("dev")`
4. **Get accounts** - `result.value` (array of `SignerAccount`)
5. **Select account** - `manager.selectAccount(address)`
6. **Get signer** - `manager.getSigner()` returns `PolkadotSigner`
7. **Use signer** - Pass to `submitAndWatch(tx, signer)`
8. **Cleanup** - `manager.destroy()`
