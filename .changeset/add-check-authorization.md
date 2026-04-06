---
"@polkadot-apps/bulletin": minor
---

Add `checkAuthorization` for pre-flight authorization checks before uploading to the Bulletin Chain. Queries `TransactionStorage.Authorizations` and returns the raw quota (remaining transactions, bytes, expiration block), enabling dApps to show "not authorized" or "insufficient quota" instead of failing mid-transaction.
