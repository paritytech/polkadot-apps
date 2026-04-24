---
"@polkadot-apps/terminal": minor
---

Add `@polkadot-apps/terminal/testing` subpath export with `createTestSession`, a helper that synthesizes a valid persisted session file so E2E tests can exercise session-dependent CLI flows without a real phone in the loop.

Also add a `storageDir` option to `createTerminalAdapter` so the CLI can point at the same test directory.
