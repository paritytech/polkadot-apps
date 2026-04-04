---
"@polkadot-apps/descriptors": minor
"@polkadot-apps/chain-client": patch
"@polkadot-apps/bulletin": patch
"@polkadot-apps/statement-store": patch
---

Restructure descriptors into per-chain papi builds. Each chain now has its own `.papi/polkadot-api.json` config and generates into `chains/<name>/generated/dist/`. Consumers import via subpath exports (e.g., `import { bulletin } from "@polkadot-apps/descriptors/bulletin"`) which only bundles that chain's metadata. The barrel import is removed. chain-client lazy-loads descriptors per environment via dynamic imports.
