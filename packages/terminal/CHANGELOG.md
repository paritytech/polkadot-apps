# @polkadot-apps/terminal

## 0.3.0

### Minor Changes

- 57dc6f1: Add `@polkadot-apps/terminal/testing` subpath export with `createTestSession`, a helper that synthesizes a valid persisted session file so E2E tests can exercise session-dependent CLI flows without a real phone in the loop.

  Also add a `storageDir` option to `createTerminalAdapter` so the CLI can point at the same test directory.

## 0.2.3

### Patch Changes

- 50c071e: Fix `adapter.destroy()` logging spurious `DestroyedError` to stderr. The `@novasamatech/statement-store` dependency fires `console.error("Statement subscription error:", ...)` when the WebSocket disconnects while subscriptions are still active — this is expected during intentional teardown. The error is now suppressed during the destroy window, and destroy is idempotent.

## 0.2.2

### Patch Changes

- 56b20bd: Fix WASM patch script on Linux — disable base64 line wrapping with -w 0

## 0.2.1

### Patch Changes

- f07621c: Initial publish of the terminal package

## 0.2.0

### Minor Changes

- add4943: Implement QR code login for CLI/terminal apps. Display a QR code in the terminal, scan with Polkadot mobile app, receive account credentials via Statement Store pairing.
