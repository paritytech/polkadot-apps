---
"@polkadot-apps/bulletin": patch
"@polkadot-apps/host": patch
"@polkadot-apps/signer": patch
"@polkadot-apps/statement-store": patch
---

Bump the `@novasamatech/product-sdk` workspace catalog from `^0.6.12` to
`^0.6.17` and add `@novasamatech/host-api@^0.6.17` alongside it. Aligns the
Spektr host-container protocol with `@parity/host-api-test-sdk@0.5.0` (peer
`^0.6.17`) so the new `examples/tx-demo/` E2E harness and production hosts
built against the same protocol version speak the same wire format.
