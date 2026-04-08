# Contracts API Reference

## ContractManager

```ts
import { ContractManager } from "@polkadot-apps/contracts";

const manager = new ContractManager(cdmJson, inkSdk, options?);
```

### Constructor Parameters
- `cdmJson: CdmJson` — parsed cdm.json manifest
- `inkSdk: InkSdk` — created via `createInkSdk(client.raw.assetHub, { atBest: true })` from `@polkadot-api/sdk-ink`
- `options.signerManager?: SignerManager` — auto signer/origin from logged-in account
- `options.defaultOrigin?: SS58String` — static fallback origin
- `options.defaultSigner?: PolkadotSigner` — static fallback signer
- `options.targetHash?: string` — select specific target (defaults to first)

### Methods
- `getContract(library)` — returns typed contract handle
- `getAddress(library)` — returns contract hex address
- `setDefaults(defaults)` — update signerManager/origin/signer

## createContract

```ts
import { createContract } from "@polkadot-apps/contracts";

const handle = createContract(inkSdk, address, abi, options?);
```

### Parameters
- `inkSdk: InkSdk` — created via `createInkSdk(client.raw.assetHub, { atBest: true })` from `@polkadot-api/sdk-ink`
- `address: HexString` — contract address on-chain
- `abi: AbiEntry[]` — Solidity-compatible ABI array
- `options` — same signer options as ContractManager

## Contract Handle Methods

Every ABI function becomes a property with `.query()` and `.tx()`:

```ts
// Query (read-only dry-run)
const result = await handle.methodName.query(arg1, arg2, { origin?, value? });
// result: { success: boolean, value: T, gasRequired?: bigint }

// Transaction (submit on-chain)
const result = await handle.methodName.tx(arg1, arg2, {
    signer?,           // override signer
    origin?,           // override origin
    value?,            // native token to send
    gasLimit?,         // { ref_time, proof_size }
    storageDepositLimit?,
    waitFor?,          // "best-block" | "finalized"
    timeoutMs?,        // default 300_000
    mortalityPeriod?,  // default 256
    onStatus?,         // (status: TxStatus) => void
});
// result: TxResult from @polkadot-apps/tx
```

## generateContractTypes

```ts
import { generateContractTypes } from "@polkadot-apps/contracts/codegen";

const dts = generateContractTypes([
    { library: "@example/counter", abi: [...] },
]);
// Returns string content for .cdm/cdm.d.ts
```

### ABI Type Mapping
| Solidity | TypeScript |
|----------|-----------|
| uint8/16/32 | number |
| uint64+ | bigint |
| int8/16/32 | number |
| int64+ | bigint |
| address | HexString |
| bool | boolean |
| string | string |
| bytes | Binary |
| bytesN | FixedSizeBinary\<N> |
| tuple | { field: type } |
| T[] | T[] |
| (unrecognized) | unknown |

## Error Classes

```ts
import {
    ContractError,
    ContractSignerMissingError,
    ContractNotFoundError,
} from "@polkadot-apps/contracts";
```

All extend `ContractError` (which extends `Error`). Use `instanceof` to catch.

## cdm.json Schema

```ts
interface CdmJson {
    targets: Record<string, { "asset-hub": string; bulletin: string }>;
    dependencies: Record<string, Record<string, number | string>>;
    contracts?: Record<string, Record<string, {
        version: number;
        address: HexString;
        abi: AbiEntry[];
        metadataCid: string;
    }>>;
}
```

Target hash is the first key in `targets`. Each contract has its ABI embedded for offline type safety.
