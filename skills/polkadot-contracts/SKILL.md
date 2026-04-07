---
name: polkadot-contracts
description: >
  Interact with smart contracts (Solidity and ink!) on Polkadot Asset Hub.
  Use when: reading contract state, submitting contract transactions, integrating
  CDM-managed contracts via cdm.json, or working with raw contract ABIs.
  Covers @polkadot-apps/contracts (ContractManager, createContract, codegen).
---

# Polkadot Smart Contract Interactions

This skill covers the `@polkadot-apps/contracts` package for typed contract interactions on Asset Hub.

| Export | Import | Purpose |
|--------|--------|---------|
| ContractManager | `@polkadot-apps/contracts` | CDM-managed contracts from cdm.json |
| createContract | `@polkadot-apps/contracts` | Single contract from raw address + ABI |
| generateContractTypes | `@polkadot-apps/contracts/codegen` | Build-time type generation |

## Quick Start: Query and Transact with a Contract

```ts
import { getChainAPI } from "@polkadot-apps/chain-client";
import { ContractManager } from "@polkadot-apps/contracts";
import { SignerManager } from "@polkadot-apps/signer";
import cdmJson from "./cdm.json";

const api = await getChainAPI("paseo");
const signerManager = new SignerManager();
await signerManager.connect();

const manager = new ContractManager(cdmJson, api.contracts, { signerManager });
const counter = manager.getContract("@example/counter");

// Read (dry-run, no gas cost)
const { value } = await counter.getCount.query();

// Write (signs and submits via signerManager)
await counter.increment.tx();
```

## Without CDM (Raw Address + ABI)

```ts
import { getChainAPI } from "@polkadot-apps/chain-client";
import { createContract } from "@polkadot-apps/contracts";

const api = await getChainAPI("paseo");
const counter = createContract(api.contracts, "0xC472...", abi, { signerManager });

await counter.getCount.query();
await counter.increment.tx();
```

## Key Concepts

### Signer Resolution (checked at call time)
1. Explicit `{ signer }` in call options (highest priority)
2. `signerManager.getSigner()` (logged-in account)
3. Static `defaultSigner`
4. `ContractSignerMissingError` if none available

### Origin Resolution
- **For tx**: explicit `{ origin }` → signerManager address → `defaultOrigin` → derived from signer's publicKey (always valid)
- **For query**: explicit `{ origin }` → signerManager address → `defaultOrigin` → Alice dev address fallback

### Contract Handles
Each method on a contract handle exposes:
- `.query(...args, opts?)` — dry-run, returns `{ success, value, gasRequired }`
- `.tx(...args, opts?)` — submit via `submitAndWatch`, returns `TxResult`

Options can be passed as the last argument after positional args:
```ts
await counter.add.tx(5, { waitFor: "finalized", onStatus: console.log });
```

### Typed Errors
- `ContractSignerMissingError` — no signer available for tx
- `ContractNotFoundError` — contract not in cdm.json
- Tx errors from `@polkadot-apps/tx` propagate (`TxTimeoutError`, `TxDispatchError`, etc.)

### Codegen (Module Augmentation)
`cdm install` generates `.cdm/cdm.d.ts` which augments the `Contracts` interface:
```ts
declare module "@polkadot-apps/contracts" {
    interface Contracts {
        "@example/counter": {
            methods: {
                getCount: { args: []; response: number };
                increment: { args: []; response: undefined };
            };
        };
    }
}
```

This provides full autocomplete on `manager.getContract("@example/counter")`.

## See Also

- **Chain connection**: `polkadot-chain-connection` skill (chain-client, descriptors)
- **Transaction submission**: `polkadot-transactions` skill (tx, signer, keys)
- **CDM CLI**: `cdm install`, `cdm deploy` — manages contract dependencies
