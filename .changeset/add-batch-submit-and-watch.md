---
"@polkadot-apps/tx": minor
---

Add `batchSubmitAndWatch` for submitting multiple transactions as a single Substrate Utility batch. Supports `batch_all` (atomic, default), `batch` (best-effort), and `force_batch` modes. Handles Ink SDK AsyncTransaction wrappers and raw decoded calls transparently.
