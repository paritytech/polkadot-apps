---
"@polkadot-apps/tx": patch
---

Treat tx-pool `Invalid` errors from `signSubmitAndWatch` (Stale nonce, BadProof, AncientBirthBlock, etc.) as non-retryable. Previously `withRetry` would loop on a Stale-nonce rejection until the watch subscription wedged, leaving the outer submit promise unsettled. Now surfaces as `TxInvalidError` with a `.kind` field so callers can decide recovery (e.g., re-fetch nonce and re-sign).
