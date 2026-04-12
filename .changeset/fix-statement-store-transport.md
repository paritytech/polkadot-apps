---
"@polkadot-apps/statement-store": minor
"@polkadot-apps/host": minor
---

fix: rewrite statement-store transport — host API first, remove custom SCALE codec

**@polkadot-apps/statement-store:**
- Rewrite transport layer with host-first architecture: inside containers, uses the Host API's native `remote_statement_store_*` protocol (bypasses JSON-RPC). Outside containers, falls back to direct WebSocket via `@polkadot-api/substrate-client` + `@novasamatech/sdk-statement`.
- Remove custom SCALE codec (buggy field tag ordering). Encoding/decoding handled by `@novasamatech/sdk-statement` and the host API.
- Remove `@polkadot-apps/chain-client` and `@polkadot-apps/descriptors` dependencies (no descriptors baggage).
- Add `ConnectionCredentials` type for dual connection modes: `{ mode: "host", accountId }` and `{ mode: "local", signer }`.
- Re-export `Statement`/`SignedStatement` types from `@novasamatech/sdk-statement`.
- `ReceivedStatement` fields changed: `signerHex` (string), `channelHex` (string), `topics` (string[]).

**@polkadot-apps/host:**
- Add `getStatementStore()` for host API statement store access.
- Add shared chain config (`BULLETIN_RPCS`, `DEFAULT_BULLETIN_ENDPOINT`) — single source of truth.
