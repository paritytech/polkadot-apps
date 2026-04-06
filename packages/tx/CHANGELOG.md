# @polkadot-apps/tx

## 0.2.11

### Patch Changes

- @polkadot-apps/keys@0.3.7

## 0.2.10

### Patch Changes

- @polkadot-apps/keys@0.3.6

## 0.2.9

### Patch Changes

- Updated dependencies [b9a8385]
  - @polkadot-apps/keys@0.3.5

## 0.2.8

### Patch Changes

- 648008e: Add `sideEffects: false` to all packages and disable source map generation to improve tree-shaking and reduce published package size.
- Updated dependencies [648008e]
  - @polkadot-apps/keys@0.3.4
  - @polkadot-apps/logger@0.1.5

## 0.2.7

### Patch Changes

- abd49ca: Remove unused variables and imports

## 0.2.6

### Patch Changes

- 997e628: Add README documentation and package descriptions for all packages.
- Updated dependencies [997e628]
  - @polkadot-apps/keys@0.3.3
  - @polkadot-apps/logger@0.1.4

## 0.2.5

### Patch Changes

- 022913a: Initial npm publish for all previously unpublished packages
- Updated dependencies [022913a]
  - @polkadot-apps/keys@0.3.2

## 0.2.4

### Patch Changes

- Updated dependencies [b813235]
  - @polkadot-apps/logger@0.1.3
  - @polkadot-apps/keys@0.3.1

## 0.2.3

### Patch Changes

- Updated dependencies [88383d3]
  - @polkadot-apps/keys@0.3.0
  - @polkadot-apps/logger@0.1.2

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
