# @polkadot-apps/tx

## 0.2.2

### Patch Changes

- 27019c9: fix: migrate npm publishing to npm_publish_automation dispatch workflow
- Updated dependencies [27019c9]
  - @polkadot-apps/keys@0.2.2
  - @polkadot-apps/logger@0.1.1

## 0.2.1

### Patch Changes

- @polkadot-apps/keys@0.2.1

## 0.2.0

### Minor Changes

- 46fc026: Implement tx package: submitAndWatch (Observable-to-Promise with timeout, status callbacks, mortality), error classes (TxDispatchError, TxTimeoutError, TxSigningRejectedError), formatDispatchError, withRetry (exponential backoff, skips deterministic errors), and createDevSigner (Alice/Bob/etc.)
