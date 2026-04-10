# @polkadot-apps/contracts

Typed contract interactions for Solidity and ink! smart contracts on Polkadot Asset Hub.

## Install

```bash
pnpm add @polkadot-apps/contracts
```

## Quick start

The fastest way to get started is `ContractManager.fromClient()`, which lazy-loads the Ink SDK internally:

```typescript
import { createChainClient } from "@polkadot-apps/chain-client";
import { paseo_asset_hub } from "@polkadot-apps/descriptors/paseo-asset-hub";
import { ContractManager } from "@polkadot-apps/contracts";
import cdmJson from "./cdm.json";

const client = await createChainClient({
  chains: { assetHub: paseo_asset_hub },
  rpcs: { assetHub: ["wss://sys.ibp.network/asset-hub-paseo"] },
});

const manager = await ContractManager.fromClient(
  cdmJson,
  client.raw.assetHub,
  { signerManager }, // from @polkadot-apps/signer
);

const counter = manager.getContract("@example/counter");
const { value } = await counter.getCount.query();
await counter.increment.tx();
```

### Size-optimized path

`fromClient()` dynamically imports `@polkadot-api/sdk-ink` (~4 MB of metadata). If your bundler cannot tree-shake the lazy import, construct the manager directly with a pre-created `InkSdk` to control exactly when that cost is paid:

```typescript
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
const manager = new ContractManager(cdmJson, inkSdk, {
  signerManager, // from @polkadot-apps/signer
});

const counter = manager.getContract("@example/counter");
const { value } = await counter.getCount.query();
await counter.increment.tx();
```

### Using preset chain clients

If you don't need custom RPC endpoints, `getChainAPI` gives you a pre-configured client:

```typescript
import { getChainAPI } from "@polkadot-apps/chain-client";
import { ContractManager } from "@polkadot-apps/contracts";
import cdmJson from "./cdm.json";

const client = await getChainAPI("paseo");
const manager = await ContractManager.fromClient(
  cdmJson,
  client.raw.assetHub,
);
```

## Usage with CDM

`ContractManager` reads contract addresses and ABIs from a `cdm.json` manifest. Each method on a contract handle exposes `.query()` for read-only dry-runs and `.tx()` for signed on-chain transactions.

```typescript
import { createChainClient } from "@polkadot-apps/chain-client";
import { paseo_asset_hub } from "@polkadot-apps/descriptors/paseo-asset-hub";
import { ContractManager } from "@polkadot-apps/contracts";
import cdmJson from "./cdm.json";

const client = await createChainClient({
  chains: { assetHub: paseo_asset_hub },
  rpcs: { assetHub: ["wss://sys.ibp.network/asset-hub-paseo"] },
});

const manager = await ContractManager.fromClient(cdmJson, client.raw.assetHub);

const counter = manager.getContract("@example/counter");

// Read-only query (dry-run, no gas cost)
const result = await counter.getCount.query();
console.log(result.value); // 42

// Signed transaction
const txResult = await counter.increment.tx();
console.log(txResult.txHash, txResult.ok);
```

Methods with arguments use positional parameters. Pass an options object as the last argument to override defaults.

```typescript
const token = manager.getContract("@example/token");

await token.transfer.tx("0xRecipient", 1000n, {
  value: 0n,
  waitFor: "finalized",
});

const { value } = await token.balanceOf.query("0xOwner");
```

When `cdm.json` contains multiple targets, the first target is selected by default. Pass `targetHash` to select a specific one.

```typescript
const manager = await ContractManager.fromClient(cdmJson, client.raw.assetHub, {
  targetHash: "abc123",
});
```

## Usage without CDM

`createContractFromClient` builds a contract handle from a raw address and ABI -- no `cdm.json` needed. This is useful for one-off interactions or contracts not managed by CDM.

```typescript
import { createChainClient } from "@polkadot-apps/chain-client";
import { paseo_asset_hub } from "@polkadot-apps/descriptors/paseo-asset-hub";
import { createContractFromClient } from "@polkadot-apps/contracts";

const client = await createChainClient({
  chains: { assetHub: paseo_asset_hub },
  rpcs: { assetHub: ["wss://sys.ibp.network/asset-hub-paseo"] },
});

const abi = [
  {
    type: "function",
    name: "getCount",
    inputs: [],
    outputs: [{ name: "", type: "uint32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "increment",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
];

const counter = await createContractFromClient(
  client.raw.assetHub,
  "0xC472...",
  abi,
  {
    defaultOrigin: "5GrwvaEF...",
    defaultSigner: signer,
  },
);

const { value } = await counter.getCount.query();
await counter.increment.tx();
```

### Size-optimized standalone path

Like the constructor vs `fromClient()` distinction, `createContract` takes an explicit `InkSdk` and avoids the dynamic import:

```typescript
import { createInkSdk } from "@polkadot-api/sdk-ink";
import { createContract } from "@polkadot-apps/contracts";

const inkSdk = createInkSdk(client.raw.assetHub, { atBest: true });

const counter = createContract(inkSdk, "0xC472...", abi, {
  signerManager,
});

await counter.getCount.query();
await counter.increment.tx();
```

## SignerManager integration

Pass a `SignerManager` from `@polkadot-apps/signer` so the currently logged-in account is used automatically as the signer and origin for all contract interactions. The account is resolved at call time, so account switches are reflected immediately.

```typescript
import { SignerManager } from "@polkadot-apps/signer";
import { ContractManager } from "@polkadot-apps/contracts";

const signerManager = new SignerManager();
await signerManager.connect();
signerManager.selectAccount(accounts[0].address);

const manager = await ContractManager.fromClient(cdmJson, client.raw.assetHub, {
  signerManager,
});

// Uses the logged-in account automatically -- no manual signer wiring
const counter = manager.getContract("@example/counter");
await counter.increment.tx();
```

Signer resolution order (highest priority wins):

1. Explicit override in call options (`{ signer }`)
2. `signerManager` (current logged-in account)
3. Static `defaultSigner` / `defaultOrigin`

For read-only queries, when no origin is available from any source, a dev fallback address (Alice) is used automatically. This is safe because queries are dry-run simulations.

You can also update defaults after construction:

```typescript
manager.setDefaults({ signerManager: newSignerManager });
manager.setDefaults({ origin: "5NewOrigin" });
```

## Codegen

`generateContractTypes` produces a TypeScript module augmentation that extends the `Contracts` interface with typed method signatures for each installed contract. This gives `ContractManager.getContract()` fully-typed handles with autocomplete for method names, arguments, and return types.

```typescript
import { generateContractTypes } from "@polkadot-apps/contracts/codegen";
import { writeFileSync } from "node:fs";

const source = generateContractTypes([
  { library: "@example/counter", abi },
]);
writeFileSync(".cdm/contracts.d.ts", source);
```

The generated file looks like:

```typescript
// Auto-generated by cdm install — do not edit
import type { HexString, Binary, FixedSizeBinary } from "polkadot-api";

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

Solidity ABI types are mapped to TypeScript equivalents: `uint8`/`uint16`/`uint32` become `number`, larger integers become `bigint`, `address` becomes `HexString`, `bytes` becomes `Binary`, `bytesN` becomes `FixedSizeBinary<N>`, and tuples become inline object types.

## Error handling

All errors extend `ContractError`. Use `instanceof` to catch any contract-related error, or narrow to specific types.

```typescript
import {
  ContractError,
  ContractSignerMissingError,
  ContractNotFoundError,
} from "@polkadot-apps/contracts";

try {
  await counter.increment.tx();
} catch (error) {
  if (error instanceof ContractSignerMissingError) {
    console.error("No signer -- connect a wallet first");
  } else if (error instanceof ContractNotFoundError) {
    console.error(`${error.library} not in cdm.json for target ${error.targetHash}`);
  } else if (error instanceof ContractError) {
    console.error("Contract error:", error.message);
  }
}
```

Transaction calls also propagate errors from `@polkadot-apps/tx` (`TxTimeoutError`, `TxDispatchError`, `TxSigningRejectedError`) since they use `submitAndWatch` internally.

## API

### `ContractManager`

#### `constructor(cdmJson, inkSdk, options?)`

Create a manager backed by a `cdm.json` manifest. This is the size-optimized path -- you provide the `InkSdk` directly.

| Parameter | Type | Description |
|-----------|------|-------------|
| `cdmJson` | `CdmJson` | Parsed `cdm.json` manifest with targets, dependencies, and contracts. |
| `inkSdk` | `InkSdk` | Ink SDK instance created via `createInkSdk(client.raw.assetHub, { atBest: true })`. |
| `options` | `ContractManagerOptions` | Optional. See below. |

#### `static fromClient(cdmJson, client, options?): Promise<ContractManager>`

Convenience async factory that creates the `InkSdk` internally via a dynamic import of `@polkadot-api/sdk-ink`. The ~4 MB sdk-ink metadata is loaded lazily only when this method is called.

| Parameter | Type | Description |
|-----------|------|-------------|
| `cdmJson` | `CdmJson` | Parsed `cdm.json` manifest. |
| `client` | `PolkadotClient` | A `PolkadotClient` for the chain where contracts are deployed (e.g., `client.raw.assetHub`). |
| `options` | `ContractManagerOptions` | Optional. See below. |

#### `getContract<K>(library): Contract<Contracts[K]>`

Return a typed contract handle. Each method has `.query()` and `.tx()`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `library` | `string` | Contract library name as it appears in `cdm.json` (e.g. `"@example/counter"`). |

**Throws**: `ContractNotFoundError` when the library is not in the manifest for the selected target.

#### `getAddress(library): HexString`

Return the on-chain address of an installed contract.

| Parameter | Type | Description |
|-----------|------|-------------|
| `library` | `string` | Contract library name. |

**Throws**: `ContractNotFoundError` when the library is not found.

#### `setDefaults(defaults): void`

Update the default origin, signer, or signerManager used by all contract handles.

| Parameter | Type | Description |
|-----------|------|-------------|
| `defaults` | `ContractDefaults` | Partial defaults to merge. |

### `createContract(inkSdk, address, abi, options?): Contract<ContractDef>`

Create a contract handle from a raw address and ABI -- no `cdm.json` needed. This is the size-optimized standalone path.

| Parameter | Type | Description |
|-----------|------|-------------|
| `inkSdk` | `InkSdk` | Ink SDK instance created via `createInkSdk(client.raw.assetHub, { atBest: true })`. |
| `address` | `HexString` | On-chain contract address. |
| `abi` | `AbiEntry[]` | Solidity-compatible ABI array. |
| `options` | `ContractOptions` | Optional signer/origin configuration. |

### `createContractFromClient(client, address, abi, options?): Promise<Contract<ContractDef>>`

Convenience async wrapper that creates the `InkSdk` internally via dynamic import. For size-sensitive apps, use `createContract` with a pre-created `InkSdk`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `client` | `PolkadotClient` | A `PolkadotClient` for the contracts chain (e.g., `client.raw.assetHub`). |
| `address` | `HexString` | On-chain contract address. |
| `abi` | `AbiEntry[]` | Solidity-compatible ABI array. |
| `options` | `ContractOptions` | Optional signer/origin configuration. |

### `generateContractTypes(contracts): string`

Generate a TypeScript module augmentation for typed contract handles. Exported from the `@polkadot-apps/contracts/codegen` subpath.

| Parameter | Type | Description |
|-----------|------|-------------|
| `contracts` | `{ library: string; abi: AbiEntry[] }[]` | Contracts to generate types for. |

**Returns**: TypeScript source string to write to `.cdm/contracts.d.ts`.

## Types

```typescript
interface CdmJson {
  targets: Record<string, CdmJsonTarget>;
  dependencies: Record<string, Record<string, number | string>>;
  contracts?: Record<string, Record<string, CdmJsonContract>>;
}

interface CdmJsonTarget {
  "asset-hub": string;
  bulletin: string;
}

interface CdmJsonContract {
  version: number;
  address: HexString;
  abi: AbiEntry[];
  metadataCid: string;
}

interface AbiEntry {
  type: string;
  name?: string;
  inputs: AbiParam[];
  outputs?: AbiParam[];
  stateMutability?: string;
}

interface AbiParam {
  name: string;
  type: string;
  components?: AbiParam[];
}

interface ContractDef {
  methods: Record<string, { args: any[]; response: any }>;
}

interface QueryResult<T> {
  success: boolean;
  value: T;
  gasRequired?: bigint;
}

interface QueryOptions {
  origin?: SS58String;
  value?: bigint;
}

interface TxOptions extends SubmitOptions {
  signer?: PolkadotSigner;
  origin?: SS58String;
  value?: bigint;
  gasLimit?: Weight;
  storageDepositLimit?: bigint;
}

interface ContractDefaults {
  origin?: SS58String;
  signer?: PolkadotSigner;
  signerManager?: SignerManager;
}

interface ContractOptions {
  signerManager?: SignerManager;
  defaultOrigin?: SS58String;
  defaultSigner?: PolkadotSigner;
}

interface ContractManagerOptions extends ContractOptions {
  targetHash?: string;
}
```

### Error classes

| Class | Extends | Key properties |
|-------|---------|---------------|
| `ContractError` | `Error` | Base class for all contract errors. |
| `ContractSignerMissingError` | `ContractError` | No signer available for a transaction call. |
| `ContractNotFoundError` | `ContractError` | `library: string`, `targetHash: string` |

## License

Apache-2.0
