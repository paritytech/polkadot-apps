---
"@polkadot-apps/chain-client": minor
---

Implement @polkadot-apps/chain-client with descriptor-driven, zero-config chain connections.

Public API: getTypedApi, getClient, getContractSdk, isConnected, destroy, destroyAll, registerChain, isInsideContainer.

Features:
- Automatic container detection via @novasamatech/product-sdk with manual fallback
- Built-in well-known chain registry (Polkadot, Kusama, Paseo + system chains)
- Lazy singleton clients keyed by genesis hash with HMR survival
- Smoldot light client support with relay+para chain spec loading
- Contract SDK via dynamic import (zero cost if unused)
- Testing subpath export (@polkadot-apps/chain-client/testing) with reset()
