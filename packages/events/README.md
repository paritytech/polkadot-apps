# @polkadot-apps/events

Blockchain event watching for Polkadot smart contracts with auto-resubscribe and typed decoding via Ink SDK.

## Install

```bash
pnpm add @polkadot-apps/events
```

This package depends on `@polkadot-apps/chain-client`, `@polkadot-apps/descriptors`, `@polkadot-apps/logger`, `polkadot-api`, and `@polkadot-api/sdk-ink`, which are installed automatically.

## Quick start

```typescript
import { EventClient } from "@polkadot-apps/events";
import { dam } from "./descriptors/dam.js"; // Ink codegen output

const client = new EventClient();
await client.connect();

const sub = client.watchContractEvent(dam, CONTRACT_ADDRESS, (event, meta) => {
  console.log(event.type, event.value);
  console.log(`Block #${meta.block.number}`);
});

// Later
sub.unsubscribe();
client.destroy();
```

## EventClient

The primary interface for watching smart contract events. Handles chain connection, address filtering, Ink ABI decoding, and resilient resubscription on transient errors.

### Creating a client

```typescript
import { EventClient } from "@polkadot-apps/events";

const client = new EventClient({
  env: "paseo", // Optional. Chain environment. Default: "paseo".
});
```

### Connecting

Call `connect()` before any watch method. Resolves the chain API via `@polkadot-apps/chain-client`.

```typescript
await client.connect();
```

Duplicate calls are ignored. If the underlying chain-client fails, an `EventConnectionError` is thrown.

### Watching contract events

Subscribe to typed events emitted by a deployed Ink smart contract. Events are decoded using the contract's ABI descriptors.

```typescript
import { dam } from "./descriptors/dam.js";

const sub = client.watchContractEvent(
  dam,                  // Ink contract descriptors (from codegen)
  "0xABCD...1234",      // Deployed contract address
  (event, meta) => {
    console.log(event.type);            // Typed event discriminant
    console.log(event.value);           // Typed event payload
    console.log(meta.block.number);     // Block number
    console.log(meta.block.hash);       // Block hash
  },
  {
    retryDelayMs: 2000, // Optional. Delay before retry. Default: 2000.
    maxRetries: 5,      // Optional. Max consecutive retries (0 = unlimited). Default: 5.
    onRetry: (error, attempt) => {
      console.warn(`Retry ${attempt}: ${error.message}`);
    },
    onFatalError: (error) => {
      console.error("Gave up:", error.message);
    },
  },
);

sub.unsubscribe();
```

Internally, the client watches `Revive.ContractEmitted` events filtered by the contract address (case-insensitive), then decodes each raw event through the Ink SDK. Decode errors are logged and skipped — the subscription stays alive.

### Watching raw contract events

If you don't use Ink descriptors (e.g. CDM contracts) or need the raw bytes, use `watchRawContractEvent`. It filters `Revive.ContractEmitted` by address but skips Ink SDK decoding — the callback receives the raw papi payload directly.

```typescript
import type { RawContractEvent } from "@polkadot-apps/events";

const sub = client.watchRawContractEvent(
  "0xABCD...1234",
  (event: RawContractEvent, meta) => {
    console.log(event.contract.asHex()); // Contract address
    console.log(event.data.asHex());     // Raw event data
    console.log(event.topics);           // Event topics
    console.log(meta.block.number);      // Block number
  },
  { mode: "best" }, // Optional. Same options as watchContractEvent.
);

sub.unsubscribe();
```

### Block mode: finalized vs best

By default, events come from **finalized** blocks — safe from reorgs but with ~12-18s of latency. For lower-latency use cases (e.g. UI updates), pass `mode: "best"` to watch events from the latest unfinalized blocks:

```typescript
// Low-latency: events from best (unfinalized) blocks
const sub = client.watchContractEvent(dam, address, (event, meta) => {
  console.log("Best block event:", event.type);
}, { mode: "best" });

// Default: events from finalized blocks
const sub2 = client.watchContractEvent(dam, address, (event, meta) => {
  console.log("Finalized event:", event.type);
}, { mode: "finalized" }); // same as omitting mode
```

The `"best"` mode uses papi's unsafe API to watch `System.Events` storage at best blocks, bypassing the finalized-only limitation of papi's `.watch()`. Events from best blocks may be reverted during chain reorganizations.

### Cleanup

```typescript
client.destroy(); // Stops all subscriptions and resets state. Safe to call multiple times.
```

## Error handling

All errors extend `EventError`. Catch the base class to handle any error from this package.

```typescript
import {
  EventError,
  EventConnectionError,
  EventSubscriptionError,
} from "@polkadot-apps/events";

try {
  await client.connect();
} catch (err) {
  if (err instanceof EventConnectionError) {
    console.error("Connection failed:", err.message);
  } else if (err instanceof EventError) {
    console.error("Events error:", err.message);
  }
}
```

| Error class | When it is thrown | Extra properties |
|-------------|-------------------|------------------|
| `EventConnectionError` | `connect()` fails or watch called before `connect()` | -- |
| `EventSubscriptionError` | Subscription retries exhausted | `attempts: number` |

## API

### EventClient

```typescript
class EventClient {
  constructor(config?: EventClientConfig)
  connect(): Promise<void>
  watchContractEvent<D>(
    contractDescriptors: D,
    address: string,
    callback: (event: D["__types"]["event"], meta: EventOccurrence["meta"]) => void,
    options?: WatchOptions,
  ): Unsubscribable
  watchRawContractEvent(
    address: string,
    callback: (event: RawContractEvent, meta: EventOccurrence["meta"]) => void,
    options?: WatchOptions,
  ): Unsubscribable
  destroy(): void
}
```

## Types

```typescript
interface EventClientConfig {
  env?: Environment; // Default: "paseo"
}

type BlockMode = "finalized" | "best";

interface WatchOptions {
  mode?: BlockMode;                             // Default: "finalized"
  retryDelayMs?: number;                        // Default: 2000
  maxRetries?: number;                          // Default: 5 (0 = unlimited)
  onRetry?: (error: Error, attempt: number) => void;
  onFatalError?: (error: Error) => void;
}

interface EventOccurrence<T = unknown> {
  payload: T;
  meta: {
    phase: { type: string; value?: number };
    block: { hash: string; number: number };
  };
}

interface RawContractEvent {
  contract: { asHex: () => string };
  data: { asHex: () => string };
  topics: Array<{ asHex: () => string }>;
}

interface Unsubscribable {
  unsubscribe: () => void;
}
```

## License

Apache-2.0
