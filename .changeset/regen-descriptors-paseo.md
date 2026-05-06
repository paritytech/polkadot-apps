---
"@polkadot-apps/descriptors": patch
---

Regenerate PAPI descriptors against current Paseo Asset Hub, Bulletin, and Individuality runtimes. The bundled metadata had drifted, causing PAPI compatibility errors (`Incompatible runtime entry RuntimeCall(ReviveApi_trace_call)`) and silent `signSubmitAndWatch` hangs in any consumer of `@polkadot-apps/chain-client`. No public API changes — refreshes the underlying type bindings only.
