# Plan: Implement `@polkadot-apps/keys`

## Context

`keys` is the P1 hierarchical key management package. It provides master-key derivation from cryptographic signatures, per-context symmetric key derivation, sr25519 account derivation, NaCl keypair derivation, and session key lifecycle. Consumers: hackm3, mark3t, task-rabbit, t3rminal.

### Key ownership model

There are two distinct layers of keys in the Polkadot app ecosystem, and this package deliberately operates in only one of them:

| Layer | Owner | Examples | Managed by |
|---|---|---|---|
| **Account keys** | Container (Host API) | Sr25519 account keypairs, wallet signing, transaction authorization | `@novasamatech/product-sdk` — the container holds private keys, apps never see them |
| **App-level keys** | Application | Document encryption keys, NaCl keypairs for sharing, session keys for fee delegation | `@polkadot-apps/keys` — derived from signatures or mnemonics, held in app memory |

The Host API enforces this separation by design:
- Apps call `hostApi.signRaw({ address, data })` to get a signature — they never access the private key
- The Host API's anti-patterns explicitly forbid "backend key management" and "exposing private keys"
- `hostApi.accountGet/accountCreateProof` retrieves accounts and Ring VRF proofs, but no key material

**How `@polkadot-apps/keys` fits in:** It takes a *signature* (obtained from the container via `signRaw` or from any other source) and derives app-level keys from it via HKDF. The container doesn't know or care about the derived key hierarchy — it's application-level cryptography for things like document encryption and peer-to-peer key exchange. This is why `KeyManager.fromSignature` takes raw signature bytes rather than a signer or wallet — it has no dependency on the container, the Host API, or any specific signing mechanism.

The full flow in container mode:
```
Container (Host API)              @polkadot-apps/wallet (future)           @polkadot-apps/keys
─────────────────────             ──────────────────────────────           ────────────────────
hostApi.signRaw(address, msg)  →  passes signature to keys             →  KeyManager.fromSignature(sig, addr)
                                                                          ├── deriveSymmetricKey("doc:123")
                                                                          ├── deriveKeypairs()
                                                                          └── deriveAccount("session")
```

In standalone mode (no container), the app obtains the signature via browser wallet extension instead — the keys package works identically either way.

### Two paths to session accounts

The package offers two ways to create session accounts. They serve different scenarios:

| | Mnemonic path (`SessionKeyManager`) | Master key path (`KeyManager.deriveAccount`) |
|---|---|---|
| **How** | Generates a random BIP39 mnemonic, derives sr25519 from it | HKDF from master key + context string, derives sr25519 from seed |
| **Requires wallet interaction** | No — works before the user connects a wallet | Yes — needs a signature to create the `KeyManager` first |
| **Persistence** | Mnemonic stored in localStorage (auto-detected) | Master key must be stored/restored by consumer |
| **Key relationship** | Independent of the user's identity — anyone with the mnemonic controls it | Deterministically tied to the user's account (same signature → same derived keys) |
| **When to use** | Session key needed before/without wallet auth (task-rabbit creates one on first visit, hackm3 host mode workaround) | Session key should be bound to user identity (derived deterministically, no extra secret to store) |
| **Security profile** | Mnemonic in localStorage is extractable — acceptable for low-value ephemeral keys | Derived from master key which is derived from a signature — no separate secret in storage |

**When to use which:**

```ts
// Path A: Mnemonic — no wallet needed, works immediately
const session = new SessionKeyManager()
const { account } = await session.getOrCreate()
// Good for: anonymous session keys, host-mode fee payers, first-visit onboarding

// Path B: Derived — tied to user identity, no mnemonic to store
const km = KeyManager.fromSignature(sig, addr)
const sessionAccount = km.deriveAccount("session")
// Good for: per-user session keys, deterministic recovery, no localStorage dependency
```

Both paths produce equivalent `DerivedAccount` objects with the same `signer`, `ss58Address`, and `h160Address` fields. The choice depends on whether the app has a wallet signature available at the time it needs a session key.

**Future consideration:** If the Host API's `hostApi.createTransaction` becomes reliable for all transaction types (including contract calls that currently hang), session keys may become unnecessary entirely — the container would sign everything directly.

---

## File Structure

```
packages/keys/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts               # public re-exports
    ├── types.ts               # DerivedAccount, DerivedKeypairs, SessionKeyInfo
    ├── seed-to-account.ts     # seedToAccount() standalone function
    ├── key-manager.ts         # KeyManager class (master key + derivation)
    └── session-key-manager.ts # SessionKeyManager class (mnemonic-based ephemeral keys)
```

---

## Critical Reference Files

| File | What to take |
|---|---|
| `reference-repos/hackm3/frontend/src/lib/document-keys.ts` | Master key from signature pattern, HKDF contexts for doc keys + keypairs |
| `reference-repos/hackm3/frontend/src/lib/session-key.ts` | Mnemonic → sr25519 + signer pattern, storage lifecycle |
| `reference-repos/task-rabbit/apps/frontend/src/lib/session-key.ts` | Clean mnemonic → sr25519CreateDerive("//0") pattern |
| `packages/crypto/src/hkdf.ts` | `deriveKey(ikm, salt, info)` — reuse for all HKDF derivation |
| `packages/crypto/src/nacl.ts` | `nacl` re-export — reuse for keypair derivation |
| `packages/address/src/h160.ts` | `deriveH160(publicKey)` — reuse for EVM address |
| `packages/address/src/ss58.ts` | `ss58Encode(publicKey, prefix)` — reuse for SS58 address |

---

## Modules

### `src/types.ts`

```ts
import type { PolkadotSigner } from "polkadot-api";

export interface DerivedAccount {
    publicKey: Uint8Array;         // sr25519 public key (32 bytes)
    ss58Address: string;           // SS58 address (generic prefix 42)
    h160Address: `0x${string}`;    // H160 EVM address from keccak256(pubkey)
    signer: PolkadotSigner;        // ready-to-use signer
}

export interface DerivedKeypairs {
    encryption: { publicKey: Uint8Array; secretKey: Uint8Array };
    signing: { publicKey: Uint8Array; secretKey: Uint8Array };
}

export interface SessionKeyInfo {
    mnemonic: string;
    account: DerivedAccount;
}

```

### `src/seed-to-account.ts`

Standalone function: mnemonic → `DerivedAccount`. Core derivation logic shared by `SessionKeyManager` and available standalone.

```ts
export function seedToAccount(
    mnemonic: string,
    derivationPath?: string,  // defaults to "//0"
    ss58Prefix?: number,       // defaults to 42
): DerivedAccount;
```

Implementation:
1. `mnemonicToEntropy(mnemonic)` → `entropyToMiniSecret(entropy)` → `sr25519CreateDerive(miniSecret)`
2. `derive(derivationPath)` → keypair with `publicKey` and `sign`
3. `ss58Encode(publicKey, prefix)` for SS58
4. `deriveH160(publicKey)` for EVM H160
5. `getPolkadotSigner(publicKey, "Sr25519", sign)` for signer

### `src/key-manager.ts`

Holds a 32-byte master key in memory, derives child keys via HKDF. All methods are **synchronous** (noble/hashes HKDF is sync).

```ts
export class KeyManager {
    private constructor(masterKey: Uint8Array);

    // HKDF(signatureBytes, salt, signerAddress) → 32-byte master key
    static fromSignature(
        signature: Uint8Array | string,  // hex (with/without 0x) or raw bytes
        signerAddress: string,
        options?: { salt?: string },      // default: "polkadot-apps-keys-v1"
    ): KeyManager;

    // Restore from raw 32-byte key material
    static fromRawKey(masterKey: Uint8Array): KeyManager;

    // HKDF(masterKey, salt="", info=context) → 32-byte symmetric key
    deriveSymmetricKey(context: string): Uint8Array;

    // HKDF → seed → sr25519CreateDerive → DerivedAccount
    deriveAccount(context: string): DerivedAccount;

    // NaCl encryption (Box) + signing (Sign) keypairs from HKDF-derived seeds
    deriveKeypairs(): DerivedKeypairs;

    // Export raw master key bytes for consumer-managed persistence
    exportKey(): Uint8Array;
}
```

Key derivation paths:
- `deriveSymmetricKey(ctx)`: `deriveKey(masterKey, "", ctx)`
- `deriveAccount(ctx)`: `deriveKey(masterKey, "", "account:" + ctx)` → seed → sr25519
- `deriveKeypairs()`: `deriveKey(masterKey, "", "encryption-keypair")` → `nacl.box.keyPair.fromSecretKey` and `deriveKey(masterKey, "", "signing-keypair")` → `nacl.sign.keyPair.fromSeed`

### `src/session-key-manager.ts`

Manages an sr25519 account from a BIP39 mnemonic with optional storage.

```ts
export class SessionKeyManager {
    constructor(options?: { name?: string });

    create(): Promise<SessionKeyInfo>;              // generate + persist
    get(): Promise<SessionKeyInfo | null>;          // load from storage
    getOrCreate(): Promise<SessionKeyInfo>;          // load or generate
    fromMnemonic(mnemonic: string): SessionKeyInfo;  // stateless derivation
    clear(): Promise<void>;                          // remove from storage
}
```

No singleton. No balance checking/funding/dispatch (app-specific). Storage is auto-detected (`localStorage` in browser, stateless in Node/SSR, `@polkadot-apps/storage` in future). The `name` option separates independent session keys (stored as `session-key:<name>`, defaults to `"default"`).

### `src/index.ts`

```ts
export { KeyManager } from "./key-manager.js";
export { SessionKeyManager } from "./session-key-manager.js";
export { seedToAccount } from "./seed-to-account.js";
export type { DerivedAccount, DerivedKeypairs, SessionKeyInfo } from "./types.js";
```

---

## Dependencies

### Catalog additions (`pnpm-workspace.yaml`)

```yaml
"@polkadot-labs/hdkd": ^0.0.26
"@polkadot-labs/hdkd-helpers": ^0.0.27
```

### `packages/keys/package.json`

```json
{
    "name": "@polkadot-apps/keys",
    "version": "0.1.0",
    "type": "module",
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": {
        ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
    },
    "files": ["dist"],
    "publishConfig": { "access": "public" },
    "scripts": {
        "build": "tsc -p tsconfig.json",
        "clean": "rm -rf dist"
    },
    "dependencies": {
        "@polkadot-apps/crypto": "workspace:*",
        "@polkadot-apps/address": "workspace:*",
        "@polkadot-labs/hdkd": "catalog:",
        "@polkadot-labs/hdkd-helpers": "catalog:",
        "polkadot-api": "catalog:"
    },
    "devDependencies": {
        "typescript": "catalog:"
    }
}
```

No `ethers` — EVM addresses use `deriveH160` (keccak256 of sr25519 pubkey).
No direct `tweetnacl` — import `nacl` from `@polkadot-apps/crypto`.

---

## In-Source Tests

**`seed-to-account.ts`**:
- Fixed mnemonic produces deterministic SS58 + H160 + publicKey
- Custom derivation path produces different addresses
- Custom SS58 prefix changes address encoding

**`key-manager.ts`**:
- `fromSignature`: fixed sig + address always produces same master key
- `fromSignature`: accepts hex string (with/without 0x) and Uint8Array
- `fromRawKey`: rejects non-32-byte input
- `deriveSymmetricKey`: deterministic, different contexts produce different keys
- `deriveAccount`: deterministic, produces valid SS58 and H160
- `deriveKeypairs`: NaCl encrypt/decrypt round-trip, sign/verify round-trip

**`session-key-manager.ts`**:
- `fromMnemonic`: deterministic from fixed mnemonic
- `getOrCreate`: with mock storage — creates first time, returns cached second time
- `get`: returns null when storage empty
- `clear`: removes from mock storage

---

## Implementation Sequence

1. Add `@polkadot-labs/hdkd` and `@polkadot-labs/hdkd-helpers` to `pnpm-workspace.yaml` catalog
2. Create `packages/keys/package.json` and `tsconfig.json`
3. `pnpm install` to resolve new deps
4. Implement `src/types.ts`
5. Implement `src/seed-to-account.ts` + tests
6. Implement `src/key-manager.ts` + tests
7. Implement `src/session-key-manager.ts` + tests
8. Implement `src/index.ts`
9. `pnpm changeset` for minor bump

---

## Files to Create/Modify

- **Create** `/workspace/packages/keys/package.json`
- **Create** `/workspace/packages/keys/tsconfig.json`
- **Create** `/workspace/packages/keys/src/index.ts`
- **Create** `/workspace/packages/keys/src/types.ts`
- **Create** `/workspace/packages/keys/src/seed-to-account.ts`
- **Create** `/workspace/packages/keys/src/key-manager.ts`
- **Create** `/workspace/packages/keys/src/session-key-manager.ts`
- **Modify** `/workspace/pnpm-workspace.yaml` — add hdkd catalog entries

## Verification

```sh
pnpm install
pnpm --filter @polkadot-apps/keys build   # must pass tsc
pnpm test                                   # all in-source tests pass
pnpm format:check                           # biome formatting
```

---

## Coverage: Reference App Feature Mapping

### What the package covers

| Reference feature | Package equivalent |
|---|---|
| hackm3 `deriveMasterKeyFromSignature()` — Web Crypto HKDF, manual hex parsing | `KeyManager.fromSignature()` |
| hackm3 `deriveDocumentKeyFromMaster()` — Web Crypto HKDF with doc context | `KeyManager.deriveSymmetricKey()` |
| hackm3 `deriveKeypairSeed()` + NaCl Box/Sign keypairs | `KeyManager.deriveKeypairs()` |
| hackm3 `deriveKeypairs()` returning base64 KeyPair strings | `KeyManager.deriveKeypairs()` (returns raw `Uint8Array` — cleaner, no base64 encoding) |
| hackm3 `getMasterKey()` + sessionStorage persist/restore | `KeyManager.exportKey()` + `KeyManager.fromRawKey()` |
| hackm3 `clearSession()` — wipe master key + caches | Consumer drops the `KeyManager` reference (immutable, no internal state to clear) |
| hackm3 `SessionKeyManager.generate/get/has/clear` | `SessionKeyManager.create/get/getOrCreate/clear` |
| hackm3 `deriveFromMnemonic()` — sr25519 + ethers secp256k1 | `seedToAccount()` (sr25519 only — see ethers note below) |
| hackm3 `getSigner()` — manual `getPolkadotSigner` construction | `DerivedAccount.signer` (included automatically) |
| hackm3 `getCandidatePublicKey()` via `derive("//wallet")` | `seedToAccount(mnemonic, "//wallet")` |
| task-rabbit `deriveFromMnemonic()` — sr25519CreateDerive + ss58ToEthereum | `seedToAccount()` |
| task-rabbit `getSessionKey/getOrCreateSessionKey/clearSessionKey` | `SessionKeyManager` (same methods, auto-detects localStorage) |
| t3rminal `createDevSigner()` — 6 hdkd imports, 5-line mnemonic→signer boilerplate | `seedToAccount(DEV_PHRASE, "//Alice").signer` (1 line) |

### What stays app-specific (and why)

| Feature | App | Why it doesn't belong in the package |
|---|---|---|
| Document key cache (`Map<string, Uint8Array>`) | hackm3 | Domain-specific caching strategy. `deriveSymmetricKey` recomputes per call (HKDF is ~μs). |
| `decryptAndCacheSharedKey()` | hackm3 | Tied to DAM contract ABI + skiff-adapter asymmetric decryption. |
| Link ID management (`setLinkId`, `getLinkPrivateKey`) | hackm3 | Document sharing domain — these are app-level session bookmarks, not key derivation. |
| Guest/temp key fallback (`initializeTempKey`) | hackm3 | App-specific UX decision. Derives a weak deterministic key from just an address (insecure by design). |
| `signKeyDerivationMessage()` | hackm3 | Obtaining the signature is a wallet concern, not a key-derivation concern. Will live in `@polkadot-apps/wallet`. |
| `checkBalance()` / `fundTx()` | hackm3 | Needs chain-client API access, app-specific balance thresholds. Will live in app or `@polkadot-apps/tx`. |
| `dispatchOrSign()` / `dispatch()` / MetaTx | hackm3 | Transaction construction + Sentry spans. Will live in `@polkadot-apps/tx`. |
| `prepareRegisterTx()` / username storage | hackm3 | LitePerson registration — identity domain. Will live in `@polkadot-apps/identity`. |

### ethers dependency — dead code in hackm3

hackm3's `session-key.ts` imports `ethers` for `ethers.Wallet.fromPhrase(mnemonic)` which derives a secp256k1 private key. However, this private key is **never consumed** anywhere in the codebase — `getSigner()` uses sr25519, and H160 addresses are derived from the sr25519 public key via keccak256. The only other ethers usage is `ethers.getBytes()` in `document-keys.ts` which is just hex→bytes conversion (replaced by `hexToBytes` from `@polkadot-apps/crypto`).

All three reference apps (hackm3, task-rabbit, mark3t) use the same pattern: **sr25519 signer + keccak256-derived H160 for pallet-revive**. No app actually needs native EVM signing. The `ethers` dependency is legacy weight that can be removed entirely during migration.

### Migration examples

**hackm3 `document-keys.ts`** (354 → ~40 lines):
```ts
import { KeyManager } from '@polkadot-apps/keys'

const km = KeyManager.fromSignature(signature, address, { salt: 'DotDocs-v3-Master' })
const docKey = km.deriveSymmetricKey(`doc:${docId}`)
const { encryption, signing } = km.deriveKeypairs()
```

**hackm3 `session-key.ts`** (506 → ~30 lines):
```ts
import { SessionKeyManager } from '@polkadot-apps/keys'

const session = new SessionKeyManager()
const { account } = await session.getOrCreate()
// account.signer, account.ss58Address, account.h160Address all ready
```

**task-rabbit `session-key.ts`** (79 → 0 lines, delete entire file):
```ts
import { SessionKeyManager } from '@polkadot-apps/keys'

const session = new SessionKeyManager({ name: 'task-rabbit' })
const { account } = await session.getOrCreate()
```

**t3rminal `bulletin/upload.ts`** (`createDevSigner` function, 7 lines → 1):
```ts
// Before (6 imports, 7-line function)
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import { DEV_PHRASE, entropyToMiniSecret, mnemonicToEntropy } from "@polkadot-labs/hdkd-helpers";
import { getPolkadotSigner } from "polkadot-api/signer";

function createDevSigner(derivationPath: string) {
  const entropy = mnemonicToEntropy(DEV_PHRASE);
  const miniSecret = entropyToMiniSecret(entropy);
  const derive = sr25519CreateDerive(miniSecret);
  const keypair = derive(derivationPath);
  return getPolkadotSigner(keypair.publicKey, "Sr25519", keypair.sign);
}

// After (1 import, inline)
import { seedToAccount } from '@polkadot-apps/keys'
const signer = seedToAccount(DEV_PHRASE, "//Alice").signer
```

### Summary

| App | File | Before | After | Deps Removed |
|-----|------|--------|-------|--------------|
| hackm3 | `document-keys.ts` | 354 lines | ~40 lines | ethers, base64-js, tweetnacl (direct) |
| hackm3 | `session-key.ts` | 506 lines | ~30 lines | ethers (dead code), hdkd (6 imports) |
| task-rabbit | `session-key.ts` | 79 lines | 0 (delete) | hdkd, hdkd-helpers, sdk-ink |
| t3rminal | `bulletin/upload.ts` | 7-line function + 6 imports | 1 line | hdkd, hdkd-helpers |

Total: **~950 lines of app code → ~70 lines** of thin wrappers over `@polkadot-apps/keys`.

---

## Gaps

1. **`KeyManager.fromSignature` does not obtain the signature** — it takes a pre-obtained signature. The actual signing (`host_sign_raw` or browser wallet `signRaw`) is the consumer's responsibility. Intentional — signing belongs in `@polkadot-apps/wallet`.

2. **No `has()` method on SessionKeyManager** — hackm3 has `has()` to check existence without deriving. Omitted to keep API minimal. Consumers can use `(await session.get()) !== null`.

3. **No document key cache** — hackm3 caches derived document keys in a `Map`. The package recomputes each call (HKDF is ~μs). Caching is the consumer's concern.

4. **`components.md` dependency graph is stale** — lists `ethers` as a dependency of `keys`. Should be updated to: `keys → crypto, address, hdkd, polkadot-api`.

---

## Future Enhancements

### 1. Logging

Logging will be added via `@polkadot-apps/logger` once that package ships — low priority for `keys` since all derivation is pure and deterministic.

### 2. `KeyManager.destroy()` — secure memory clearing

hackm3's `clearSession()` zeroes the master key, clears the document key cache, and removes from sessionStorage. Our `KeyManager` is currently immutable — the consumer drops the reference to discard it. A `destroy()` method could actively zero the internal `masterKey` buffer to reduce the window for memory scanning attacks:

```ts
km.destroy() // zeroes masterKey buffer, subsequent calls throw
```

Low priority — JavaScript's GC makes true secure erasure unreliable anyway — but a reasonable defense-in-depth measure for security-conscious apps.

### 3. Multi-path derivation

Currently `seedToAccount` derives a single account via one hard path (`"//0"`). Some apps may need multiple derived accounts from one mnemonic (e.g., `"//wallet"`, `"//session"`, `"//backup"`). hackm3 already uses `derive("//wallet")` for candidate keys.

**Recommendation**: Keep current API. `seedToAccount(mnemonic, "//wallet")` is clear enough. No new API needed.

### 4. Key rotation / versioning

No support for key rotation or versioned key hierarchies. If a master key is compromised, all derived keys are compromised. Potential future enhancement:

- Version the HKDF salt: `"polkadot-apps-keys-v2"` for new derivations
- `KeyManager.version` property to track which generation a key belongs to
- Migration helper to re-encrypt document keys from v1 → v2

Post-v1 concern — not needed until there's a real rotation use case.

### 5. Integration with `@polkadot-apps/storage`

`SessionKeyManager` currently auto-detects `localStorage` in the browser and falls back to stateless in Node/SSR. Once `@polkadot-apps/storage` is implemented (Dexie + Host localStorage), the internals will switch to use it — providing uniform persistence across browser, Host API (Polkadot Desktop), and any future backends. No public API change needed.

### 6. Host API `host_sign_raw` integration

`components.md` notes that master key derivation should use `host_sign_raw` in container mode. This would be a factory function:

```ts
// Future: once @polkadot-apps/wallet exists
import { KeyManager } from '@polkadot-apps/keys'
import { hostSignRaw } from '@polkadot-apps/wallet'

const signature = await hostSignRaw(address, 'key-derivation-message')
const km = KeyManager.fromSignature(signature, address)
```

No changes needed in `keys` — the wallet package handles the signing, keys handles the derivation.
