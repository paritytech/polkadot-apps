---
"@polkadot-apps/bulletin": minor
---

Make signer optional in upload functions. When omitted, auto-resolves: uses host preimage API inside containers, dev signer (Alice) when standalone. Adds `preimageKey` to `UploadResult` and makes `blockHash` optional.
