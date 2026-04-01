# @polkadot-apps/solidity-contracts

Solidity ABI contract interaction for Polkadot Asset Hub (pallet-revive). Read, write, and decode Solidity contracts deployed via Revive without code generation.

## Install

```bash
pnpm add @polkadot-apps/solidity-contracts
```

**Peer dependency**: `polkadot-api` must be installed in your project.

```bash
pnpm add polkadot-api
```

## When to use this package

There are two ways to interact with Solidity contracts on pallet-revive chains:

| Approach | Package | Best for |
|----------|---------|----------|
| **Pre-generated descriptors** | `@polkadot-apps/chain-client` | Apps with known contracts at build time. Run `papi generate` with the `"sol"` key to get typed descriptors, then use `api.contracts.getContract(descriptor, address)`. Full type safety. |
| **Runtime ABI** | `@polkadot-apps/solidity-contracts` | Apps that load contract ABIs at runtime (e.g., user-uploaded ABIs, multi-contract explorers). No code generation needed. |

This package implements the second approach.

## Quick start

```typescript
import { getChainAPI } from "@polkadot-apps/chain-client";
import { createSolidityContract } from "@polkadot-apps/solidity-contracts";
import { submitAndWatch, ensureAccountMapped } from "@polkadot-apps/tx";

// 1. Get the typed API for Asset Hub
const api = await getChainAPI("paseo");

// 2. Create a contract instance from a Solidity ABI
const erc20Abi = [
    {
        type: "function",
        name: "balanceOf",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "transfer",
        inputs: [
            { name: "to", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "nonpayable",
    },
] as const;

const contract = createSolidityContract(api.assetHub, "0xContractAddress", erc20Abi);
```

## Reading view functions

```typescript
const balance = await contract.read("balanceOf", ["0xOwnerAddress"]);
console.log("Balance:", balance); // bigint
```

`read()` encodes the call using the ABI, dry-runs it via `ReviveApi.eth_transact`, and decodes the result. No on-chain transaction is created.

## Writing state-changing functions

```typescript
// Ensure the account is mapped before writing (one-time per account)
await ensureAccountMapped(address, signer, api.contracts, api.assetHub);

// Dry-run the transaction
const result = await contract.write("transfer", ["0xRecipient", 1000n], senderAddress);

console.log("Dry-run response:", result.response); // true

// Submit on-chain
const tx = result.send();
await submitAndWatch(tx, signer);
```

`write()` does a dry-run for validation, then returns:
- `response` — the decoded return value from the simulation
- `send()` — creates a `tx.Revive.call` extrinsic for on-chain submission
- `diagnose()` — re-runs the dry-run to decode the revert reason after an on-chain failure

## Sending value (payable functions)

```typescript
const result = await contract.write(
    "deposit",
    [],
    senderAddress,
    1_000_000_000_000_000_000n, // 1 ETH in wei
);
const tx = result.send();
await submitAndWatch(tx, signer);
```

The wei value is automatically converted to planck using the chain's `NativeToEthRatio` constant.

## Error handling

```typescript
try {
    await contract.read("balanceOf", ["0xInvalidAddress"]);
} catch (error) {
    // Error message includes the function name and revert reason:
    // "balanceOf: insufficient funds for gas * price + value"
    // "balanceOf: OwnableUnauthorizedAccount(0x1234...)"
    console.error(error.message);
}
```

After an on-chain failure, use `diagnose()` to get the revert reason:

```typescript
const result = await contract.write("transfer", args, origin);
const tx = result.send();

try {
    await submitAndWatch(tx, signer);
} catch {
    const reason = await result.diagnose();
    console.error("Revert reason:", reason);
}
```

## Low-level utilities

For advanced use cases, the package exports the building blocks used internally:

```typescript
import {
    buildEthTransactTx,
    buildReviveCallTx,
    extractRevertReason,
    toU256,
} from "@polkadot-apps/solidity-contracts";

// Build a raw eth_transact dry-run parameter
const ethTx = buildEthTransactTx({
    to: "0xContractAddress",
    callData: "0xEncodedCallData",
    from: senderSs58OrH160,
    value: 1_000_000_000_000_000_000n,
});

// Execute dry-run directly
const result = await typedApi.apis.ReviveApi.eth_transact(ethTx, { at: "best" });

// Build a tx.Revive.call from dry-run results
const tx = buildReviveCallTx(typedApi, {
    dest: "0xContractAddress",
    callData: "0xEncodedCallData",
    value: 1_000_000_000_000_000_000n,
    nativeToEvmRatio: 1_000_000n,
    gasRequired: result.value.weight_required,
    storageDeposit: result.value.max_storage_deposit,
});

// Decode revert reasons from dry-run failures
const reason = extractRevertReason(result.value, contractAbi);

// Convert bigint to U256 (four u64 limbs, little-endian)
const weiValue = toU256(1_000_000_000_000_000_000n);
```

## API

### `createSolidityContract(typedApi, address, abi, options?): SolidityContract`

Create a contract instance for read/write interactions.

| Parameter | Type | Description |
|-----------|------|-------------|
| `typedApi` | `ReviveTypedApi` | A PAPI typed API with the Revive pallet (e.g., `api.assetHub`). |
| `address` | `` `0x${string}` `` | The H160 contract address. |
| `abi` | `Abi` | The Solidity ABI (viem `Abi` type — a parsed JSON array). |
| `options` | `CreateSolidityContractOptions` | Optional. Override `nativeToEvmRatio`. |

### `SolidityContract.read(functionName, args?): Promise<unknown>`

Call a `view`/`pure` function. Returns the decoded result.

### `SolidityContract.write(functionName, args, origin, value?): Promise<SolidityWriteResult>`

Dry-run a state-changing function. Returns `{ response, send(), diagnose() }`.

### `buildEthTransactTx(opts): EthTransactTx`

Build an Ethereum-style transaction for `ReviveApi.eth_transact` dry-runs.

### `buildReviveCallTx(typedApi, opts): SubmittableTransaction`

Build a `tx.Revive.call` extrinsic from dry-run results. Applies a 2x safety margin to weight and storage estimates.

### `extractRevertReason(errValue, abi): string | undefined`

Decode a revert reason from an `eth_transact` failure. Handles runtime messages, standard `Error(string)`, and custom ABI errors.

### `toU256(value): U256`

Convert a bigint to a U256 (four u64 limbs, little-endian).

## Types

```typescript
interface SolidityContract {
    read(functionName: string, args?: unknown[]): Promise<unknown>;
    write(functionName: string, args: unknown[], origin: string, value?: bigint): Promise<SolidityWriteResult>;
}

interface SolidityWriteResult {
    response: unknown;
    send(): SubmittableTransaction;
    diagnose(): Promise<string | undefined>;
}

interface CreateSolidityContractOptions {
    nativeToEvmRatio?: bigint;
}

type U256 = [bigint, bigint, bigint, bigint];
```

## Related packages

- [`@polkadot-apps/chain-client`](../chain-client) — Multi-chain API client with Ink SDK for descriptor-based contract interaction
- [`@polkadot-apps/tx`](../tx) — Transaction submission, dry-run utilities, and account mapping
- [`@polkadot-apps/address`](../address) — SS58/H160 address conversion utilities

## License

Apache-2.0
