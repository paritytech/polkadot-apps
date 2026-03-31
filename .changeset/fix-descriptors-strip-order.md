---
"@polkadot-apps/descriptors": patch
---

Fix release workflow to strip `file:generated` dependency after changeset version step, preventing the dependency from being re-added before publish.
