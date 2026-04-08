# @polkadot-apps/terminal

QR code login for CLI/terminal apps via the Polkadot mobile wallet.

Implements the Polkadot SSO handshake protocol: generates Sr25519 + P256 keypairs, displays a QR code deep link, subscribes to the statement store for the wallet's encrypted response, and extracts the paired account.

## Installation

```bash
pnpm add @polkadot-apps/terminal
```

Node.js requires a WebSocket polyfill:

```bash
pnpm add ws
```

```ts
import { WebSocket } from "ws";
Object.assign(globalThis, { WebSocket });
```

## Quick Start

```ts
import { startQrLogin, resumeSession, clearSession, renderQrCode } from "@polkadot-apps/terminal";

// Resume an existing session or start a new QR login
let login = await resumeSession();

if (!login) {
    const controller = await startQrLogin({
        metadataUrl: "https://example.com/metadata.json",
        endpoints: ["wss://paseo-people-next-rpc.polkadot.io"],
        timeoutMs: 120_000,
    });

    console.log(await renderQrCode(controller.pairingUri));
    console.log("Scan with the Polkadot mobile app...");

    login = await controller.result;
    controller.destroy();
}

console.log(`Logged in as ${login.address}`);

await clearSession(); // optional: remove persisted session
```

## API

### `startQrLogin(options: QrLoginOptions): Promise<QrLoginController>`

Start a QR login session. Returns a controller with:
- `pairingUri` -- the `polkadotapp://pair?handshake=0x...` deep link
- `sessionId` -- hex-encoded local account ID
- `result` -- promise that resolves on successful pairing
- `cancel()` / `destroy()` -- abort the login

### `renderQrCode(data: string, options?: QrRenderOptions): Promise<string>`

Render a string as a QR code using Unicode half-block characters for terminal display.

### `resumeSession(): Promise<QrLoginResult | null>`

Resume a persisted session. Returns null if expired or not found.

### `clearSession(): Promise<void>`

Remove the persisted session.

### `AuthFlow` (advanced)

Low-level SSO handshake: key derivation, SCALE encoding, ECDH decryption. Use `startQrLogin` instead unless you need custom control.

## Error Handling

- `QrLoginTimeoutError` -- login exceeded the configured timeout
- `QrLoginCancelledError` -- login was cancelled via `cancel()` or `destroy()`

Both extend `QrLoginError`.

## Dependencies

- `@polkadot-apps/statement-store` -- statement store transport and codec
- `@polkadot-apps/crypto` -- AES-GCM, HKDF, hex encoding
- `@polkadot-apps/address` -- SS58 encoding
- `@polkadot-apps/storage` -- session persistence
- `@polkadot-apps/logger` -- structured logging
- `@polkadot-labs/hdkd` / `@polkadot-labs/hdkd-helpers` -- Sr25519 key derivation
- `@noble/curves` -- P256 ECDH
- `qrcode` -- QR code generation
