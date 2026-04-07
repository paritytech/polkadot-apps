# @polkadot-apps/keys API Reference

> **`SS58String`** is a branded `string` type from `@polkadot-apps/address` (re-exported from `@polkadot-api/substrate-bindings`). `DerivedAccount.ss58Address` uses this type.

## KeyManager

Hierarchical key manager. Holds a 32-byte master key in memory and derives child keys via HKDF-SHA256. Does not persist anything -- persistence is the consumer's responsibility.

```ts
import { KeyManager } from "@polkadot-apps/keys";
```

### Static Constructors

#### fromSignature

```ts
static fromSignature(
  signature: Uint8Array | string,
  signerAddress: string,
  options?: { salt?: string },
): KeyManager
```

Create a `KeyManager` from a cryptographic signature.

Derives master key via HKDF-SHA256:
- IKM = signatureBytes
- salt = `options.salt` (default: `"polkadot-apps-keys-v1"`)
- info = `signerAddress`

**Parameters:**
- `signature` - Hex string (with or without `0x` prefix) or raw bytes. Must be at least 32 bytes.
- `signerAddress` - SS58 address of the signer (used as HKDF info).
- `options.salt` - HKDF salt. Default: `"polkadot-apps-keys-v1"`.

**Throws:** `Error` if signature is shorter than 32 bytes.

#### fromRawKey

```ts
static fromRawKey(masterKey: Uint8Array): KeyManager
```

Create a `KeyManager` from raw 32-byte key material. For restoring from storage, testing, etc.

**Throws:** `Error` if `masterKey` is not exactly 32 bytes.

Note: Copies the input -- mutating the original array does not affect internal state.

### Instance Methods

#### deriveSymmetricKey

```ts
deriveSymmetricKey(context: string): Uint8Array
```

Derive a 32-byte symmetric key for a given context string.

Uses HKDF-SHA256: IKM = masterKey, salt = `""`, info = `context`.

Different contexts produce different keys. Deterministic for the same context.

#### deriveAccount

```ts
deriveAccount(context: string, ss58Prefix?: number): DerivedAccount
```

Derive a Substrate sr25519 account for a given context string.

Derivation: `HKDF(masterKey, "", "account:" + context)` produces a 32-byte seed, then sr25519 keypair is derived via hard derivation at path `"//0"`.

**Parameters:**
- `context` - Context string (e.g., `"doc-account:123"`).
- `ss58Prefix` - SS58 prefix for address encoding. Default: `42`.

**Returns:** `DerivedAccount` with `publicKey`, `ss58Address`, `h160Address`, and `signer`.

#### deriveKeypairs

```ts
deriveKeypairs(): DerivedKeypairs
```

Derive NaCl encryption and signing keypairs from the master key.

- **Encryption:** `HKDF(masterKey, "", "encryption-keypair")` -> `nacl.box.keyPair.fromSecretKey` (Curve25519)
- **Signing:** `HKDF(masterKey, "", "signing-keypair")` -> `nacl.sign.keyPair.fromSeed` (Ed25519)

**Returns:** `DerivedKeypairs` with `encryption` and `signing` keypairs.

#### exportKey

```ts
exportKey(): Uint8Array
```

Export the raw master key bytes for consumer-managed persistence. Returns a copy.

---

## SessionKeyManager

Manages an sr25519 account derived from a BIP39 mnemonic, with persistence via a `KvStore`.

```ts
import { SessionKeyManager } from "@polkadot-apps/keys";
import { createKvStore } from "@polkadot-apps/storage";
```

### Constructor

```ts
new SessionKeyManager(options: {
  store: KvStore;       // From @polkadot-apps/storage
  name?: string;        // Identifies this session key. Default: "default"
})
```

Use different `name` values to manage multiple independent session keys in the same store.

### Methods

#### create

```ts
create(): Promise<SessionKeyInfo>
```

Create a new session key from a fresh BIP39 mnemonic. Persists the mnemonic to the store. Overwrites any existing key with the same name.

#### get

```ts
get(): Promise<SessionKeyInfo | null>
```

Load an existing session key from the store. Returns `null` if no mnemonic is stored for this name.

#### getOrCreate

```ts
getOrCreate(): Promise<SessionKeyInfo>
```

Load existing or create a new session key. Idempotent -- returns the same key on subsequent calls.

#### fromMnemonic

```ts
fromMnemonic(mnemonic: string): SessionKeyInfo
```

Derive a session key from an explicit mnemonic. No storage interaction -- does not read or write the store.

**Throws:** `Error` with message `"Invalid mnemonic phrase"` if the mnemonic is invalid.

#### clear

```ts
clear(): Promise<void>
```

Clear the stored mnemonic from the store for this name.

---

## seedToAccount

Derive a `DerivedAccount` from a BIP39 mnemonic phrase.

```ts
import { seedToAccount } from "@polkadot-apps/keys";

function seedToAccount(
  mnemonic: string,
  derivationPath?: string,     // Default: "//0"
  ss58Prefix?: number,         // Default: 42
  keyType?: "sr25519" | "ed25519",  // Default: "sr25519"
): DerivedAccount
```

**Parameters:**
- `mnemonic` - BIP39 mnemonic phrase.
- `derivationPath` - Hard derivation path. Default: `"//0"`.
- `ss58Prefix` - SS58 network prefix. Default: `42` (generic).
- `keyType` - Key type for derivation. Default: `"sr25519"`.

**Returns:** `DerivedAccount` with `publicKey`, `ss58Address`, `h160Address`, and `signer`.

**Throws:** `Error` with message `"Invalid mnemonic phrase"` if the mnemonic is invalid.

Note: This function is also used internally by `createDevSigner` in the tx package.

---

## Types

### DerivedAccount

```ts
interface DerivedAccount {
  /** Public key (32 bytes). Sr25519 or Ed25519 depending on key type. */
  publicKey: Uint8Array;
  /** SS58 address (generic prefix 42 by default). */
  ss58Address: SS58String;
  /** H160 EVM address derived via keccak256(publicKey). */
  h160Address: `0x${string}`;
  /** PolkadotSigner for signing extrinsics. */
  signer: PolkadotSigner;
}
```

### DerivedKeypairs

```ts
interface DerivedKeypairs {
  /** Curve25519 keypair for NaCl Box (asymmetric encryption). */
  encryption: {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
  };
  /** Ed25519 keypair for NaCl Sign (digital signatures). */
  signing: {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
  };
}
```

### SessionKeyInfo

```ts
interface SessionKeyInfo {
  /** The BIP39 mnemonic (the only thing that needs persisting). */
  mnemonic: string;
  /** The derived account info. */
  account: DerivedAccount;
}
```
