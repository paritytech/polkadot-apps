# @polkadot-apps/keys

Hierarchical key derivation and session key management for Polkadot accounts.

## Install

```bash
pnpm add @polkadot-apps/keys
```

Peer dependencies are pulled in automatically via the monorepo workspace:

- `@polkadot-apps/crypto` -- symmetric encryption and HKDF
- `@polkadot-apps/address` -- SS58 and H160 address encoding
- `@polkadot-apps/storage` -- persistence for session keys
- `polkadot-api` -- `PolkadotSigner` type

## Quick start

```typescript
import { KeyManager } from "@polkadot-apps/keys";

// Derive a key manager from a wallet signature
const km = KeyManager.fromSignature(signature, signerAddress);

// Derive a symmetric encryption key for a specific context
const encKey = km.deriveSymmetricKey("document:abc123");

// Derive a Substrate account
const account = km.deriveAccount("voting-proxy");
console.log(account.ss58Address);
```

## KeyManager

Holds a 32-byte master key in memory and derives child keys via HKDF-SHA256. Does not persist anything -- persistence is the caller's responsibility.

### Creating a KeyManager

**From a cryptographic signature** (most common). Derives the master key via HKDF-SHA256 with `IKM=signature`, `salt=options.salt` (default `"polkadot-apps-keys-v1"`), `info=signerAddress`.

```typescript
import { KeyManager } from "@polkadot-apps/keys";

const km = KeyManager.fromSignature(signature, signerAddress);

// With custom salt
const km2 = KeyManager.fromSignature(signature, signerAddress, {
  salt: "my-app-v2",
});
```

The `signature` parameter accepts a `Uint8Array` or a hex string (with or without `0x` prefix). It must be at least 32 bytes.

**From a raw 32-byte key** (for restoring from storage or testing):

```typescript
const km = KeyManager.fromRawKey(masterKeyBytes);
```

### Deriving symmetric keys

Returns a 32-byte key via HKDF-SHA256 with `IKM=masterKey`, `salt=""`, `info=context`.

```typescript
const encryptionKey = km.deriveSymmetricKey("document:abc123");
const signingKey = km.deriveSymmetricKey("hmac:notifications");
```

### Deriving Substrate accounts

Derives an Sr25519 account for a given context. Internally runs `HKDF(masterKey, "", "account:" + context)` to produce a 32-byte seed, then derives an Sr25519 keypair at `//0`.

```typescript
const account = km.deriveAccount("voting-proxy");
console.log(account.ss58Address); // generic prefix 42
console.log(account.h160Address); // 0x...

// With Polkadot network prefix
const polkadotAccount = km.deriveAccount("staking", 0);
```

### Deriving NaCl keypairs

Returns Curve25519 (encryption) and Ed25519 (signing) keypairs derived from the master key.

```typescript
import { nacl } from "@polkadot-apps/crypto";

const kp = km.deriveKeypairs();

// Encrypt for another party
const nonce = nacl.randomBytes(24);
const encrypted = nacl.box(message, nonce, recipientPubKey, kp.encryption.secretKey);

// Sign a message
const signed = nacl.sign(message, kp.signing.secretKey);
```

### Exporting the master key

```typescript
const raw = km.exportKey(); // Uint8Array (32 bytes), safe to persist
```

## SessionKeyManager

Manages a BIP39 mnemonic-derived Sr25519 account with automatic persistence via a `KvStore`.

```typescript
import { SessionKeyManager } from "@polkadot-apps/keys";
import { createKvStore } from "@polkadot-apps/storage";

const store = await createKvStore({ prefix: "session-key" });
const skm = new SessionKeyManager({ store });

// Load existing or create a new session key
const { mnemonic, account } = await skm.getOrCreate();
console.log(account.ss58Address);
```

### Managing multiple session keys

Pass a `name` to isolate different session keys in the same store.

```typescript
const main = new SessionKeyManager({ store, name: "main" });
const burner = new SessionKeyManager({ store, name: "burner" });

const mainKey = await main.getOrCreate();
const burnerKey = await burner.getOrCreate();
```

### Deriving without storage

```typescript
const info = skm.fromMnemonic("abandon abandon abandon ...");
console.log(info.account.ss58Address);
```

### Clearing a session key

```typescript
await skm.clear(); // removes mnemonic from the store
```

## seedToAccount

Standalone function to derive an account from a BIP39 mnemonic.

```typescript
import { seedToAccount } from "@polkadot-apps/keys";

const account = seedToAccount(mnemonic);

// With custom derivation path, SS58 prefix, and key type
const edAccount = seedToAccount(mnemonic, "//1", 0, "ed25519");
```

## API

### KeyManager

| Method | Signature | Returns |
|---|---|---|
| `KeyManager.fromSignature` | `(signature: Uint8Array \| string, signerAddress: string, options?: { salt?: string })` | `KeyManager` |
| `KeyManager.fromRawKey` | `(masterKey: Uint8Array)` | `KeyManager` |
| `km.deriveSymmetricKey` | `(context: string)` | `Uint8Array` (32 bytes) |
| `km.deriveAccount` | `(context: string, ss58Prefix?: number)` | `DerivedAccount` |
| `km.deriveKeypairs` | `()` | `DerivedKeypairs` |
| `km.exportKey` | `()` | `Uint8Array` (32 bytes) |

### SessionKeyManager

| Method | Signature | Returns |
|---|---|---|
| `constructor` | `(options: { store: KvStore, name?: string })` | `SessionKeyManager` |
| `skm.create` | `()` | `Promise<SessionKeyInfo>` |
| `skm.get` | `()` | `Promise<SessionKeyInfo \| null>` |
| `skm.getOrCreate` | `()` | `Promise<SessionKeyInfo>` |
| `skm.fromMnemonic` | `(mnemonic: string)` | `SessionKeyInfo` |
| `skm.clear` | `()` | `Promise<void>` |

### seedToAccount

| Function | Signature | Returns |
|---|---|---|
| `seedToAccount` | `(mnemonic: string, derivationPath?: string, ss58Prefix?: number, keyType?: "sr25519" \| "ed25519")` | `DerivedAccount` |

Default values: `derivationPath = "//0"`, `ss58Prefix = 42`, `keyType = "sr25519"`.

## Types

```typescript
interface DerivedAccount {
  publicKey: Uint8Array;
  ss58Address: SS58String;
  h160Address: `0x${string}`;
  signer: PolkadotSigner;
}

interface DerivedKeypairs {
  encryption: { publicKey: Uint8Array; secretKey: Uint8Array };
  signing: { publicKey: Uint8Array; secretKey: Uint8Array };
}

interface SessionKeyInfo {
  mnemonic: string;
  account: DerivedAccount;
}
```

## License

Apache-2.0
