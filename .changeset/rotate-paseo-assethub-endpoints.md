---
"@polkadot-apps/chain-client": patch
---

Rotate Paseo Asset Hub preset RPC endpoints. `getChainAPI("paseo")` now connects to IBP's new `asset-hub-paseo.ibp.network` subdomain first, with Dotters and TurboFlakes as additional live providers, and Dwellir retained as a fallback. Removes the deprecated `sys.ibp.network/asset-hub-paseo` path (now returning 502). Resolves "Unable to connect" loops observed during cold start when both previously-listed endpoints were unhealthy simultaneously.
