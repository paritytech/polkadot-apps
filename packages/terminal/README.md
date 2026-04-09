# @polkadot-apps/terminal

QR code login, attestation, and transaction signing for CLI/terminal apps via the Polkadot mobile wallet.

Wraps the [`@novasamatech/host-papp`](https://www.npmjs.com/package/@novasamatech/host-papp) SDK with Node.js-compatible adapters (file-based storage, WebSocket transport) so the full SSO protocol works outside the browser.

## Installation

```bash
pnpm add @polkadot-apps/terminal ws
```

## Setup

Two things must be configured before using the package:

**1. Register the WASM loader** — the host-papp SDK depends on `verifiablejs` which uses inline WASM (browser-only). The register hook redirects it to the Node.js WASM build. Pass it via `--import`:

```bash
node --import @polkadot-apps/terminal/register app.js
tsx --import @polkadot-apps/terminal/register app.ts
```

Or in your `package.json` scripts:

```json
{
    "scripts": {
        "start": "tsx --import @polkadot-apps/terminal/register index.ts"
    }
}
```

**2. Polyfill WebSocket** — must be done before creating the adapter:

```ts
import { WebSocket } from "ws";
Object.assign(globalThis, { WebSocket });
```

## Quick Start

```ts
import { createTerminalAdapter, renderQrCode } from "@polkadot-apps/terminal";

// 1. Create the adapter
const adapter = createTerminalAdapter({
    appId: "my-terminal-app",
    metadataUrl: "https://example.com/metadata.json",
});

// 2. Subscribe to pairing status to show the QR code
adapter.sso.pairingStatus.subscribe(async (status) => {
    if (status.step === "pairing") {
        console.log(await renderQrCode(status.payload));
        console.log("Scan with the Polkadot mobile app...");
    }
});

// 3. Authenticate (QR pairing + on-chain attestation)
const result = await adapter.sso.authenticate();

result.match(
    (session) => console.log("Logged in!", session?.id),
    (error) => console.error("Failed:", error.message),
);

// 4. Wait for sessions to load (they load asynchronously from disk)
const sessions = await new Promise<any[]>((resolve) => {
    let resolved = false;
    let unsub: (() => void) | null = null;
    unsub = adapter.sessions.sessions.subscribe((s) => {
        if (resolved) return;
        resolved = true;
        unsub?.();
        resolve(s);
    });
    setTimeout(() => {
        if (!resolved) { resolved = true; unsub?.(); resolve([]); }
    }, 2000);
});

// 5. Sign messages via the paired wallet
if (sessions.length > 0) {
    const session = sessions[0];
    const sig = await session.signRaw({
        address: "0x" + Buffer.from(session.remoteAccount.accountId).toString("hex"),
        data: { tag: "Bytes", value: new TextEncoder().encode("Hello") },
    });

    sig.match(
        (data) => console.log("Signature:", data.signature),
        (error) => console.error("Failed:", error.message),
    );
}
```

## API

### `createTerminalAdapter(options): PappAdapter`

Creates a terminal adapter backed by the host-papp SDK.

**Options:**
- `appId` -- unique app identifier (used as storage namespace)
- `metadataUrl` -- URL to metadata JSON shown during pairing
- `endpoints?` -- statement store WebSocket endpoints (defaults to Paseo)
- `hostMetadata?` -- optional host environment info

**Returns** a `PappAdapter` with:
- `sso` -- auth component (`.authenticate()`, `.abortAuthentication()`, status subscriptions)
- `sessions` -- session manager (signing, disconnect)

### `renderQrCode(data, options?): Promise<string>`

Render a string as a QR code using Unicode half-block characters for terminal display.

### `createNodeStorageAdapter(appId): StorageAdapter`

File-based storage adapter for Node.js. Data persists in `~/.polkadot-apps/`.

## Signing

After login and attestation, the paired wallet can sign messages via the statement store.

**`signRaw`** works end-to-end: the wallet receives the request, shows a prompt, and returns the signature.

**`signPayload`** (for signing transaction payloads) is not yet functional — the request is submitted but the wallet does not respond. This is a known limitation of the current wallet/protocol version.

## How It Works

1. **QR Pairing** -- generates Sr25519 + P256 keypairs, encodes a `polkadotapp://pair?handshake=0x...` deep link, subscribes to the statement store
2. **Attestation** -- registers the local account on the People chain so it can publish statements
3. **Signing** -- sends encrypted signing requests to the wallet via the statement store, receives signed responses

Sessions are persisted to `~/.polkadot-apps/` and survive across restarts. The SDK loads them asynchronously on startup — subscribe to `adapter.sessions.sessions` and wait for the first emission.

## Dependencies

- `@novasamatech/host-papp` -- Polkadot host-product SDK (auth, attestation, signing)
- `@novasamatech/statement-store` -- statement store client and session management
- `@novasamatech/storage-adapter` -- storage interface
- `@polkadot-api/ws-provider` -- WebSocket JSON-RPC provider
- `neverthrow` -- Result type for error handling
- `qrcode` -- QR code generation
