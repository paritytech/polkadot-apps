---
"@polkadot-apps/chain-client": patch
"@polkadot-apps/descriptors": patch
---

Migrate individuality (People) chain to Paseo Next endpoint (`wss://paseo-people-next-rpc.polkadot.io`, genesis `0xd01475fd…b47d64`). The old `pop3-testnet.parity-lab.parity.io/people` stable-stage endpoint was unreachable for users on the Paseo Next environment, causing connection retry spam when using `getChainAPI("paseo")`. Descriptor regenerated against the new chain.
