# Package Selector

Decision tree for choosing `@polkadot-apps` packages based on application requirements.

## Decision Tree

```
START
│
├─ Need to connect to Polkadot chains?
│  YES → @polkadot-apps/chain-client + polkadot-api (always required)
│
├─ Need to submit transactions?
│  YES → @polkadot-apps/tx
│  │
│  ├─ Need wallet connection (Talisman, Polkadot.js, SubWallet, Host API)?
│  │  YES → @polkadot-apps/signer (SignerManager handles multi-provider accounts)
│  │
│  ├─ Need testnet dev accounts only?
│  │  YES → @polkadot-apps/tx (includes createDevSigner)
│  │
│  └─ Need key derivation or session keys?
│     YES → @polkadot-apps/keys
│
├─ Need to interact with smart contracts (Solidity/ink! on Asset Hub)?
│  YES → @polkadot-apps/contracts
│  │
│  ├─ Have a cdm.json manifest?
│  │  YES → ContractManager (fully-typed handles via codegen)
│  │
│  └─ Just have an address + ABI?
│     YES → createContract (same ergonomics, no manifest)
│
├─ Need decentralized data storage (files, JSON, blobs)?
│  YES → @polkadot-apps/bulletin
│
├─ Need real-time pub/sub messaging (ephemeral, ≤512 bytes)?
│  YES → @polkadot-apps/statement-store
│
├─ Need address encoding/validation?
│  YES → @polkadot-apps/address
│
├─ Need encryption/decryption?
│  YES → @polkadot-apps/crypto
│
├─ Need byte encoding (hex, UTF-8) or token formatting (planck)?
│  YES → @polkadot-apps/utils
│
├─ Need persistent key-value storage (browser/host)?
│  YES → @polkadot-apps/storage
│
└─ Need structured logging?
   YES → @polkadot-apps/logger
```

## Common App Patterns

### Query-Only App (read chain state)
```
@polkadot-apps/chain-client
polkadot-api
```

### Transaction App (read + write)
```
@polkadot-apps/chain-client
@polkadot-apps/tx
polkadot-api
```

### dApp with Wallet (full user-facing app)
```
@polkadot-apps/chain-client
@polkadot-apps/tx
@polkadot-apps/signer
@polkadot-apps/address
@polkadot-apps/utils
polkadot-api
```

### Contract dApp (interact with smart contracts)
```
@polkadot-apps/chain-client
@polkadot-apps/contracts
@polkadot-apps/signer
polkadot-api
```

### Data Storage App (upload/download files)
```
@polkadot-apps/chain-client
@polkadot-apps/bulletin
@polkadot-apps/tx
polkadot-api
```

### Real-Time Messaging App
```
@polkadot-apps/chain-client
@polkadot-apps/statement-store
@polkadot-apps/keys
polkadot-api
```

### Full-Featured App (everything)
```
@polkadot-apps/chain-client
@polkadot-apps/contracts
@polkadot-apps/tx
@polkadot-apps/signer
@polkadot-apps/bulletin
@polkadot-apps/statement-store
@polkadot-apps/address
@polkadot-apps/crypto
@polkadot-apps/utils
@polkadot-apps/keys
@polkadot-apps/storage
@polkadot-apps/logger
polkadot-api
```

## Package Dependency Graph

```
address ─────────────────────────── (leaf)
crypto ──────────────────────────── (leaf)
utils ───────────────────────────── (leaf, depends on logger)
logger ──────────────────────────── (leaf)
host ────────────────────────────── (leaf)
storage ← host, logger
keys ← address, crypto, utils, storage
tx ← keys, logger
signer ← address, keys, logger
chain-client ← descriptors, host
contracts ← tx, signer, keys, logger
bulletin ← chain-client, descriptors, host, logger, tx
statement-store ← chain-client, descriptors, logger
```

Transitive dependencies are handled automatically by npm/pnpm — install only the packages you directly use.
