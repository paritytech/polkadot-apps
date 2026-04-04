# @polkadot-apps/host

## 0.2.3

### Patch Changes

- 648008e: Add `sideEffects: false` to all packages and disable source map generation to improve tree-shaking and reduce published package size.

## 0.2.2

### Patch Changes

- 997e628: Add README documentation and package descriptions for all packages.

## 0.2.1

### Patch Changes

- 022913a: Initial npm publish for all previously unpublished packages

## 0.2.0

### Minor Changes

- 88383d3: feat: add host package for container detection and Host API types, implement KvStore in storage with host/browser/memory backends, refactor SessionKeyManager to accept an injected store, and move container detection from chain-client to host
