---
"@polkadot-apps/storage": minor
---

Add Node.js file-based backend to `createKvStore`. When running in Node without `localStorage`, data is now persisted as JSON files under `~/.polkadot-apps/` (override with the new `storageDir` option) instead of being silently dropped. Filenames are percent-encoded so distinct keys never collide on disk. Edge runtimes without `localStorage` or `node:fs` continue to use a silent no-op backend.
