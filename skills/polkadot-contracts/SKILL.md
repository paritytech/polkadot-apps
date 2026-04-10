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
| ContractManager.fromClient | `@polkadot-apps/contracts` | Convenience: CDM-managed contracts from a ChainClient (creates InkSdk internally) |
| createContract | `@polkadot-apps/contracts` | Single contract from raw address + ABI (size-optimized) |
| createContractFromClient | `@polkadot-apps/contracts` | Convenience: single contract from a ChainClient (creates InkSdk internally) |
| generateContractTypes | `@polkadot-apps/contracts/codegen` | Build-time type generation |

## Quick Start: Size-Optimized Path (Recommended for Production)

The constructor + explicit `createInkSdk` path gives you full control over the InkSdk instance and avoids pulling `@polkadot-api/sdk-ink` as a transitive dependency of `@polkadot-apps/contracts`.

```ts
import { getChainAPI } from "@polkadot-apps/chain-client";
import { createInkSdk } from "@polkadot-api/sdk-ink";
import { ContractManager } from "@polkadot-apps/contracts";
import { SignerManager } from "@polkadot-apps/signer";
import cdmJson from "./cdm.json";

// Connect and create InkSdk from raw PolkadotClient
const client = await getChainAPI("paseo");
const inkSdk = createInkSdk(client.raw.assetHub, { atBest: true });

const signerManager = new SignerManager();
await signerManager.connect();

const manager = new ContractManager(cdmJson, inkSdk, { signerManager });
const counter = manager.getContract("@example/counter");

// Read (dry-run, no gas cost)
const { value } = await counter.getCount.query();

// Write (signs and submits via signerManager)
await counter.increment.tx();
```

### BYOD Path (Bring Your Own Descriptors)

```ts
import { createChainClient } from "@polkadot-apps/chain-client";
import { createInkSdk } from "@polkadot-api/sdk-ink";
import { paseo_asset_hub } from "@polkadot-apps/descriptors/paseo-asset-hub";
import { ContractManager } from "@polkadot-apps/contracts";
import cdmJson from "./cdm.json";

const client = await createChainClient({
    chains: { assetHub: paseo_asset_hub },
    rpcs: { assetHub: ["wss://sys.ibp.network/asset-hub-paseo"] },
});
const inkSdk = createInkSdk(client.raw.assetHub, { atBest: true });

const manager = new ContractManager(cdmJson, inkSdk, { signerManager });
```

## Convenience Path (fromClient)

`ContractManager.fromClient()` and `createContractFromClient()` create the InkSdk internally from a `ChainClient`. Simpler to use, but pulls in `@polkadot-api/sdk-ink` as a transitive dependency.

```ts
import { getChainAPI } from "@polkadot-apps/chain-client";
import { ContractManager } from "@polkadot-apps/contracts";
import { SignerManager } from "@polkadot-apps/signer";
import cdmJson from "./cdm.json";

const client = await getChainAPI("paseo");
const signerManager = new SignerManager();
await signerManager.connect();

const manager = await ContractManager.fromClient(cdmJson, client, { signerManager });
const counter = manager.getContract("@example/counter");

await counter.getCount.query();
await counter.increment.tx();
```

## Without CDM (Raw Address + ABI)

### Size-optimized (explicit InkSdk)

```ts
import { getChainAPI } from "@polkadot-apps/chain-client";
import { createInkSdk } from "@polkadot-api/sdk-ink";
import { createContract } from "@polkadot-apps/contracts";

const client = await getChainAPI("paseo");
const inkSdk = createInkSdk(client.raw.assetHub, { atBest: true });
const counter = createContract(inkSdk, "0xC472...", abi, { signerManager });

await counter.getCount.query();
await counter.increment.tx();
```

### Convenience (fromClient)

```ts
import { getChainAPI } from "@polkadot-apps/chain-client";
import { createContractFromClient } from "@polkadot-apps/contracts";

const client = await getChainAPI("paseo");
const counter = await createContractFromClient(client, "0xC472...", abi, { signerManager });

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

## Resources

- **Repository**: https://github.com/paritytech/polkadot-apps
- **npm**: https://www.npmjs.com/package/@polkadot-apps/contracts
- **polkadot-api docs**: https://papi.how

## See Also

- **Chain connection**: `polkadot-chain-connection` skill (chain-client, descriptors)
- **Transaction submission**: `polkadot-transactions` skill (tx, signer, keys)
- **CDM CLI**: `cdm install`, `cdm deploy` — manages contract dependencies
