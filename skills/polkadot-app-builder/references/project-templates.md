# Project Templates

Starter configurations for new Polkadot apps using `@polkadot-apps` packages.

## package.json

### Minimal (query-only)

```json
{
  "name": "my-polkadot-app",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@polkadot-apps/chain-client": "latest",
    "polkadot-api": "^1.23.3"
  },
  "devDependencies": {
    "typescript": "^5.9.3"
  }
}
```

### Full-featured (transactions + storage)

```json
{
  "name": "my-polkadot-app",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@polkadot-apps/chain-client": "latest",
    "@polkadot-apps/contracts": "latest",
    "@polkadot-apps/tx": "latest",
    "@polkadot-apps/bulletin": "latest",
    "@polkadot-apps/address": "latest",
    "@polkadot-apps/logger": "latest",
    "@polkadot-api/sdk-ink": "latest",
    "polkadot-api": "^1.23.3"
  },
  "devDependencies": {
    "typescript": "^5.9.3"
  }
}
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "sourceMap": false,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

## Starter src/index.ts

### Query chain state

```typescript
import { getChainAPI, destroyAll } from "@polkadot-apps/chain-client";

async function main() {
    const client = await getChainAPI("paseo");

    // Query block number
    const blockNumber = await client.assetHub.query.System.Number.getValue();
    console.log("Block number:", blockNumber);

    // Query account balance
    const account = await client.assetHub.query.System.Account.getValue(
        "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY", // Alice
    );
    console.log("Free balance:", account.data.free);

    destroyAll();
}

main().catch(console.error);
```

### Submit a transaction

```typescript
import { getChainAPI, destroyAll } from "@polkadot-apps/chain-client";
import { submitAndWatch, createDevSigner } from "@polkadot-apps/tx";
import { Binary } from "polkadot-api";

async function main() {
    const client = await getChainAPI("paseo");
    const signer = createDevSigner("Alice");

    // Build a System.remark transaction
    const tx = client.assetHub.tx.System.remark({
        remark: Binary.fromText("Hello from my Polkadot app!"),
    });

    // Submit and watch lifecycle
    const result = await submitAndWatch(tx, signer, { waitFor: "finalized" });
    console.log("Transaction finalized in block:", result.block.hash);

    destroyAll();
}

main().catch(console.error);
```

### Interact with a smart contract

```typescript
import { createChainClient, destroyAll } from "@polkadot-apps/chain-client";
import { createInkSdk } from "@polkadot-api/sdk-ink";
import { paseo_asset_hub } from "@polkadot-apps/descriptors/paseo-asset-hub";
import { ContractManager } from "@polkadot-apps/contracts";
import { createDevSigner } from "@polkadot-apps/tx";
import cdmJson from "./cdm.json";

async function main() {
    const client = await createChainClient({
        chains: { assetHub: paseo_asset_hub },
        rpcs: { assetHub: ["wss://sys.ibp.network/asset-hub-paseo"] },
    });
    const inkSdk = createInkSdk(client.raw.assetHub, { atBest: true });
    const manager = new ContractManager(cdmJson, inkSdk);
    const counter = manager.getContract("@example/counter");

    // Query (read-only, no signer needed)
    const { value } = await counter.getCount.query();
    console.log("Count:", value);

    // Transaction (requires signer)
    const alice = createDevSigner("Alice");
    await counter.increment.tx({ signer: alice });

    destroyAll();
}

main().catch(console.error);
```

### Upload to Bulletin Chain

```typescript
import { BulletinClient } from "@polkadot-apps/bulletin";
import { createDevSigner } from "@polkadot-apps/tx";
import { destroyAll } from "@polkadot-apps/chain-client";

async function main() {
    const bulletin = await BulletinClient.create("paseo");
    const signer = createDevSigner("Alice");

    // Upload JSON data
    const data = new TextEncoder().encode(
        JSON.stringify({ message: "Hello Bulletin!", timestamp: Date.now() }),
    );
    const result = await bulletin.upload(data, signer);
    console.log("Uploaded CID:", result.cid);

    // Fetch it back
    const fetched = await bulletin.fetchJson(result.cid);
    console.log("Fetched:", fetched);

    destroyAll();
}

main().catch(console.error);
```

## For Monorepo Consumers (workspace packages)

When the app lives inside a monorepo using `@polkadot-apps` as workspace packages:

```json
{
  "dependencies": {
    "@polkadot-apps/chain-client": "workspace:*",
    "@polkadot-apps/tx": "workspace:*",
    "polkadot-api": "catalog:"
  }
}
```

Use `"workspace:*"` for internal deps and `"catalog:"` for shared versions from `pnpm-workspace.yaml`.
