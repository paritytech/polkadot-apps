---
"@polkadot-apps/signer": minor
---

`HostProvider.connect()` now auto-requests the host's `TransactionSubmit`
permission after fetching accounts. Without this request, production hosts
(and the `@parity/host-api-test-sdk` test host) reject every subsequent sign
request with `PermissionDenied`, which typically looked like a silently
hanging transaction. Connect does not fail if the permission is rejected, so
read-only flows are unaffected. New option:
`HostProviderOptions.requestTransactionSubmitPermission` (default `true`) to
opt out for apps that want to drive the prompt manually.

Also adds `@novasamatech/host-api` as an optional peer dependency — it is
only loaded at runtime when building the permission request payload.
