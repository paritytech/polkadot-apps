---
"@polkadot-apps/bulletin": minor
---

Add host-based query path for bulletin data. Inside a host container (Polkadot Desktop/Mobile), `fetchBytes`/`fetchJson` now route through the host preimage lookup API with local caching and managed polling. Standalone usage falls back to direct IPFS gateway fetch as before.

New exports: `queryBytes`, `queryJson`, `resolveQueryStrategy`, `cidToPreimageKey`, `QueryStrategy`, `QueryOptions`.
