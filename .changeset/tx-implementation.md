---
"@polkadot-apps/tx": minor
---

Implement tx package: submitAndWatch (Observable-to-Promise with timeout, status callbacks, mortality), error classes (TxDispatchError, TxTimeoutError, TxSigningRejectedError), formatDispatchError, withRetry (exponential backoff, skips deterministic errors), and createDevSigner (Alice/Bob/etc.)
