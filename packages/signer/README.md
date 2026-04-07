# @polkadot-apps/signer

Multi-provider signer manager for Polkadot -- Host API, browser extensions, and dev accounts.

## Install

```bash
pnpm add @polkadot-apps/signer
```

**Optional peer dependency**: `@novasamatech/product-sdk` is required only when using the Host API provider (Polkadot Desktop/Mobile containers).

```bash
pnpm add @novasamatech/product-sdk
```

## Quick start

```typescript
import { SignerManager } from "@polkadot-apps/signer";

const manager = new SignerManager();

const result = await manager.connect();
if (!result.ok) throw result.error;

const accounts = result.value;
manager.selectAccount(accounts[0].address);

const signer = manager.getSigner();
// Pass `signer` to polkadot-api transaction calls
```

## Auto-detection

`connect()` detects the runtime environment and picks the best available provider:

- **Inside a container** (Polkadot Desktop/Mobile): tries Host API first, falls back to Extension.
- **Outside a container** (standalone browser): tries Extension first, falls back to Dev.

Override auto-detection by passing a provider type explicitly:

```typescript
await manager.connect("dev");       // force dev accounts
await manager.connect("extension"); // force browser extension
await manager.connect("host");      // force Host API
```

Check the environment programmatically:

```typescript
import { isInsideContainer } from "@polkadot-apps/signer";

if (isInsideContainer()) {
  console.log("Running inside Polkadot Desktop/Mobile");
}
```

## State management

Subscribe to state changes to drive your UI. The callback fires on every status transition, account list change, or account selection.

```typescript
const unsubscribe = manager.subscribe((state) => {
  console.log(state.status);          // "disconnected" | "connecting" | "connected"
  console.log(state.accounts);        // readonly SignerAccount[]
  console.log(state.selectedAccount); // SignerAccount | null
  console.log(state.activeProvider);  // "host" | "extension" | "dev" | null
  console.log(state.error);           // SignerError | null
});

// Get a snapshot without subscribing
const snapshot = manager.getState();

// Clean up
unsubscribe();
```

## Account selection and signing

```typescript
const selectResult = manager.selectAccount("5GrwvaEF...");
if (!selectResult.ok) {
  console.error(selectResult.error);
}

const signer = manager.getSigner(); // PolkadotSigner | null

// Sign raw bytes (for non-transaction signing)
const signResult = await manager.signRaw(new Uint8Array([1, 2, 3]));
if (signResult.ok) {
  console.log(signResult.value); // Uint8Array signature
}
```

## Host API features

When connected via the Host API provider, additional methods are available for product accounts, aliases, and ring VRF proofs.

```typescript
const productAccount = manager.getProductAccount("myDapp", 0);
const alias = manager.getProductAccountAlias("myDapp", 0);
const proof = await manager.createRingVRFProof("myDapp", 0, message);
```

## Providers

Each provider handles a different signing backend. You rarely need to use providers directly -- `SignerManager` manages them for you. They are exported for advanced use cases or testing.

### DevProvider

Local dev accounts from the well-known Substrate mnemonic.

```typescript
import { DevProvider } from "@polkadot-apps/signer";

const provider = new DevProvider({
  names: ["Alice", "Bob"],
  ss58Prefix: 42,
  keyType: "sr25519", // or "ed25519"
});
```

### ExtensionProvider

Browser wallet extensions discovered via `window.injectedWeb3`.

```typescript
import { ExtensionProvider } from "@polkadot-apps/signer";

const provider = new ExtensionProvider({
  extensionName: "polkadot-js",
  dappName: "My App",
  injectionWait: 1_000,
});

// List available extensions
const extensions = await manager.getAvailableExtensions();
```

### HostProvider

Polkadot Desktop/Mobile via product-sdk. Requires `@novasamatech/product-sdk`.

```typescript
import { HostProvider } from "@polkadot-apps/signer";

const provider = new HostProvider({
  hostTimeout: 10_000,
  dappName: "My App",
});

// Inject Spektr compatibility layer
HostProvider.injectSpektr();
```

## Cleanup

Always destroy the manager when your application unmounts to release resources and close connections.

```typescript
manager.disconnect();
manager.destroy();
```

## Error handling

All errors extend `SignerError`. Use type guards to narrow errors by provider.

```typescript
import {
  isHostError,
  isExtensionError,
  HostUnavailableError,
  ExtensionNotFoundError,
  NoAccountsError,
} from "@polkadot-apps/signer";

const result = await manager.connect();
if (!result.ok) {
  if (isHostError(result.error)) {
    console.error("Host API problem:", result.error.message);
  } else if (isExtensionError(result.error)) {
    console.error("Extension problem:", result.error.message);
  }
}
```

## API

### `SignerManager`

#### `constructor(options?: SignerManagerOptions)`

Create a new manager instance.

#### `getState(): SignerState`

Return a snapshot of the current status, accounts, selected account, active provider, and error.

#### `subscribe(callback): () => void`

Subscribe to state changes. Returns an unsubscribe function.

| Parameter | Type | Description |
|-----------|------|-------------|
| `callback` | `(state: SignerState) => void` | Called on every state transition. |

#### `connect(providerType?): Promise<Result<SignerAccount[], SignerError>>`

Connect to accounts. Auto-detects the provider when no type is given.

| Parameter | Type | Description |
|-----------|------|-------------|
| `providerType` | `ProviderType` | Optional. `"host"`, `"extension"`, or `"dev"`. |

#### `disconnect(): void`

Disconnect the active provider and clear accounts.

#### `selectAccount(address): Result<SignerAccount, SignerError>`

Select an account by SS58 address.

#### `getSigner(): PolkadotSigner | null`

Return the signer for the currently selected account, or `null`.

#### `signRaw(data): Promise<Result<Uint8Array, SignerError>>`

Sign raw bytes with the selected account.

#### `getProductAccount(dappName, index): ProductAccount`

Host API only. Get a product account by dapp name and index.

#### `getProductAccountAlias(dappName, index): ContextualAlias`

Host API only. Get the contextual alias for a product account.

#### `createRingVRFProof(dappName, index, message): Promise<RingLocation>`

Host API only. Create a ring VRF proof.

#### `getAvailableExtensions(): Promise<string[]>`

List browser extension names found in `window.injectedWeb3`.

#### `destroy(): void`

Release all resources. The manager must not be used after this call.

### Standalone functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `isInsideContainer` | `() => boolean` | Synchronous container environment check. |
| `ok` | `<T>(value: T) => Result<T, never>` | Create a successful `Result`. |
| `err` | `<E>(error: E) => Result<never, E>` | Create a failed `Result`. |
| `isHostError` | `(e: SignerError) => boolean` | Type guard for Host API errors. |
| `isExtensionError` | `(e: SignerError) => boolean` | Type guard for extension errors. |

## Types

```typescript
type ConnectionStatus = "disconnected" | "connecting" | "connected";

type ProviderType = "host" | "extension" | "dev";

interface SignerAccount {
  address: SS58String;
  h160Address: `0x${string}`;
  publicKey: Uint8Array;
  name: string | null;
  source: ProviderType;
  getSigner(): PolkadotSigner;
}

interface SignerState {
  status: ConnectionStatus;
  accounts: readonly SignerAccount[];
  selectedAccount: SignerAccount | null;
  activeProvider: ProviderType | null;
  error: SignerError | null;
}

interface SignerManagerOptions {
  ss58Prefix?: number;            // default: 42
  hostTimeout?: number;           // default: 10_000
  extensionTimeout?: number;      // default: 1_000
  maxRetries?: number;            // default: 3
  createProvider?: ProviderFactory;
  dappName?: string;              // default: "polkadot-app"
  persistence?: AccountPersistence | null;
}

type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

### Error classes

| Class | Extends | When thrown |
|-------|---------|------------|
| `SignerError` | `Error` | Base class for all signer errors. |
| `HostUnavailableError` | `SignerError` | Host API not found or not responding. |
| `HostRejectedError` | `SignerError` | Host API rejected the request. |
| `HostDisconnectedError` | `SignerError` | Host API connection lost. |
| `ExtensionNotFoundError` | `SignerError` | Browser extension not installed or not injected. |
| `ExtensionRejectedError` | `SignerError` | User rejected the extension prompt. |
| `SigningFailedError` | `SignerError` | Signing operation failed. |
| `NoAccountsError` | `SignerError` | Provider returned zero accounts. |
| `TimeoutError` | `SignerError` | Operation timed out. |
| `AccountNotFoundError` | `SignerError` | Selected address not in the account list. |
| `DestroyedError` | `SignerError` | Method called after `destroy()`. |

## License

Apache-2.0
