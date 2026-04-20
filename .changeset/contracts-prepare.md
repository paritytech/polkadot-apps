---
"@polkadot-apps/contracts": minor
---

Add `.prepare(...args, opts?)` to every contract method. Returns a `BatchableCall` consumable by `batchSubmitAndWatch` from `@polkadot-apps/tx`, so multiple contract calls (or contract calls mixed with other transactions on the same chain) can be grouped into a single atomic `Utility.batch_all` without dropping down to `@polkadot-api/sdk-ink` directly. `opts` accepts `origin`, `value`, `gasLimit`, and `storageDepositLimit` — signer and submission-lifecycle options belong to the batch submit, not the individual prepared call.
