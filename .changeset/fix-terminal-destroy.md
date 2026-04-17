---
"@polkadot-apps/terminal": patch
---

Fix `adapter.destroy()` logging spurious `DestroyedError` to stderr. The `@novasamatech/statement-store` dependency fires `console.error("Statement subscription error:", ...)` when the WebSocket disconnects while subscriptions are still active — this is expected during intentional teardown. The error is now suppressed during the destroy window, and destroy is idempotent.
