# @polkadot-apps/statement-store

## 0.2.0

### Minor Changes

- ce7c113: feat(statement-store): add statement store client package

  High-level client for the Polkadot Statement Store ephemeral pub/sub layer.
  Provides typed publish/subscribe, SCALE encoding, Sr25519 signing, topic management,
  channel-based last-write-wins semantics, and resilient delivery with subscription + polling fallback.
