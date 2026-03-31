---
"@polkadot-apps/descriptors": patch
---

Fix release workflow to strip `file:generated` dependency after build step, preventing papi from re-adding it before publish.
