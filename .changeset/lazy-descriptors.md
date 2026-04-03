---
"@polkadot-apps/descriptors": minor
"@polkadot-apps/chain-client": patch
"@polkadot-apps/bulletin": patch
"@polkadot-apps/statement-store": patch
---

Add per-chain subpath exports to descriptors and lazy-load them in chain-client to reduce downstream bundle size. Consumers can now import individual chains (e.g., `@polkadot-apps/descriptors/bulletin`) instead of the full barrel to avoid bundling all chain metadata.
