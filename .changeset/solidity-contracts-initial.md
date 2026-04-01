---
"@polkadot-apps/solidity-contracts": minor
"@polkadot-apps/chain-client": patch
---

feat: add @polkadot-apps/solidity-contracts package for Solidity ABI contract interaction on pallet-revive chains

New package providing `createSolidityContract()` for reading and writing Solidity contracts deployed via Revive without code generation. Uses viem for ABI encoding/decoding and `ReviveApi.eth_transact` for execution.

Also updates chain-client README to document Solidity contract usage with `api.assetHub`.
