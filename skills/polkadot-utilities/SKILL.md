---
name: polkadot-utilities
description: >
  Use when working with Polkadot address encoding, SS58, H160, EVM address conversion,
  cryptographic encryption (AES, ChaCha, NaCl, HKDF), byte encoding/decoding, token
  formatting (planck), key-value storage, or structured logging in @polkadot-apps packages.
  Covers address, crypto, utils, storage, and logger utilities.
---

# Polkadot Utility Packages

Five leaf packages provide foundational utilities across the monorepo. All are pure TypeScript, framework-agnostic, and published under the `@polkadot-apps/` scope.

## Decision Guide

| Need | Package | Import |
|------|---------|--------|
| Encode/decode SS58 addresses, validate addresses, convert between SS58 and H160 EVM addresses | `address` | `@polkadot-apps/address` |
| Symmetric encryption (AES-GCM, ChaCha20), key derivation (HKDF), asymmetric encryption (NaCl box), random bytes | `crypto` | `@polkadot-apps/crypto` |
| Byte encoding/decoding (hex, UTF-8, concat), hashing (blake2b-256, sha2-256, keccak-256), token formatting (planck to human-readable and back) | `utils` | `@polkadot-apps/utils` |
| Persistent key-value storage that auto-detects browser localStorage vs host container backend | `storage` | `@polkadot-apps/storage` |
| Structured logging with levels, namespaces, and pluggable handlers | `logger` | `@polkadot-apps/logger` |

## Quick Start: Address

```ts
import {
  isValidSs58,
  ss58Decode,
  ss58Encode,
  normalizeSs58,
  ss58ToH160,
  h160ToSs58,
  truncateAddress,
} from "@polkadot-apps/address";

// Validate
isValidSs58("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"); // true

// Decode to raw bytes + network prefix
const { publicKey, prefix } = ss58Decode("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY");

// Re-encode with Polkadot prefix (0)
const polkadotAddr = normalizeSs58("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY", 0);

// SS58 <-> H160 EVM address conversion
const evmAddr = ss58ToH160("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY");
const ss58Addr = h160ToSs58("0x9621dde636de098b43efb0fa9b61facfe328f99d");

// Display
truncateAddress("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"); // "5Grwva...utQY"
```

## Quick Start: Crypto

```ts
import {
  xchachaEncrypt,
  xchachaDecrypt,
  deriveKey,
  randomBytes,
  sealedBoxEncrypt,
  sealedBoxDecrypt,
} from "@polkadot-apps/crypto";

// Symmetric encryption (XChaCha20-Poly1305 recommended for random nonces)
const key = randomBytes(32);
const { ciphertext, nonce } = xchachaEncrypt(data, key);
const plaintext = xchachaDecrypt(ciphertext, key, nonce);

// Key derivation
const encKey = deriveKey(masterSecret, "myapp-v1", "encryption");

// Asymmetric sealed box (anonymous sender)
import nacl from "tweetnacl";
const recipient = nacl.box.keyPair();
const sealed = sealedBoxEncrypt(message, recipient.publicKey);
const opened = sealedBoxDecrypt(sealed, recipient.secretKey);
```

## Quick Start: Utils

```ts
import { bytesToHex, hexToBytes, utf8ToBytes, concatBytes } from "@polkadot-apps/utils";

// Byte encoding
const hex = bytesToHex(new Uint8Array([0xab, 0xcd])); // "abcd"
const bytes = hexToBytes("abcd");
const text = utf8ToBytes("hello");
const combined = concatBytes(header, payload);

// Hashing (32-byte output, all deterministic)
import { blake2b256, sha256, keccak256 } from "@polkadot-apps/utils";

const hash = blake2b256(new TextEncoder().encode("hello")); // Polkadot default
const sha = sha256(data);     // bulletin-deploy default
const kek = keccak256(data);  // Ethereum compat

// Token formatting (planck ↔ human-readable)
import { formatPlanck, parseToPlanck, formatBalance } from "@polkadot-apps/utils";

formatPlanck(10_000_000_000n);   // "1.0" (DOT, 10 decimals)
formatPlanck(15_000_000_000n);   // "1.5"
parseToPlanck("1.5");             // 15_000_000_000n
parseToPlanck("1.0", 12);        // 1_000_000_000_000n (KSM)

// Display formatting (locale-aware with symbol)
formatBalance(10_000_000_000_000n, { symbol: "DOT" }); // "1,000 DOT"
formatBalance(15_000_000_000n, { maxDecimals: 2, symbol: "DOT" }); // "1.5 DOT"

// Balance querying (typed wrapper for System.Account)
import { getBalance } from "@polkadot-apps/utils";

const balance = await getBalance(api.assetHub, aliceAddress);
console.log(formatBalance(balance.free, { symbol: "DOT" })); // "1,000.5 DOT"
```

## Quick Start: Storage

```ts
import { createKvStore } from "@polkadot-apps/storage";

const store = await createKvStore({ prefix: "myapp" });

await store.set("theme", "dark");
const theme = await store.get("theme"); // "dark"

await store.setJSON("prefs", { lang: "en" });
const prefs = await store.getJSON<{ lang: string }>("prefs");

await store.remove("theme");
```

## Quick Start: Logger

```ts
import { createLogger, configure } from "@polkadot-apps/logger";

// Create a namespaced logger
const log = createLogger("my-feature");

log.error("Connection failed", { url, status });
log.warn("Retrying...");
log.info("Connected");
log.debug("Payload received", payload);

// Configure globally (affects all loggers)
configure({
  level: "debug",                    // show all levels
  namespaces: ["my-feature", "tx"],  // only these get elevated level
  handler: (entry) => sendToServer(entry), // custom output
});
```

## Common Mistakes

### Address

- **Comparing SS58 addresses at different prefixes.** `addressesEqual("5Grw...", "15o...")` returns `false` even if the underlying public key is the same. Use `normalizeSs58()` to re-encode both to the same prefix before comparing.
- **Comparing SS58 with H160.** `addressesEqual` returns `false` for mixed types. Convert to the same format first with `ss58ToH160()` or `h160ToSs58()`.
- **Assuming `ss58ToH160` is reversible for native accounts.** The keccak256 derivation for native sr25519/ed25519 keys is one-way. Only EVM-derived accounts (0xEE-padded) round-trip through `h160ToSs58`.

### Crypto

- **Using `chachaEncrypt` for high-volume random nonces.** ChaCha20-Poly1305 has a 12-byte nonce (safe for ~2^32 encryptions per key). Use `xchachaEncrypt` (24-byte nonce) for high-volume scenarios.
- **Forgetting that all encrypt functions require exactly 32-byte keys.** Passing a 16-byte or 64-byte key throws. Use `deriveKey()` to derive a 32-byte key from arbitrary material.
- **Confusing `sealedBoxEncrypt` with `boxEncrypt`.** Sealed box is for anonymous senders (ephemeral keypair). Box is for identified senders (both parties known).
- **Importing encoding utilities from crypto.** `bytesToHex`, `hexToBytes`, `utf8ToBytes`, and `concatBytes` have moved to `@polkadot-apps/utils`. Only `randomBytes` remains in crypto.

### Utils

- **Passing a `0x`-prefixed string to `hexToBytes`.** The implementation expects raw hex without a prefix. Strip it first: `hexToBytes(hex.slice(2))`.
- **Using `formatPlanck` with the wrong `decimals` for a chain.** DOT uses 10, KSM uses 12, many parachains use 18. Always check the chain's token metadata.
- **Assuming `parseToPlanck` rounds excess decimals.** It truncates, not rounds.

### Storage

- **Calling `createKvStore` synchronously.** It returns a `Promise<KvStore>` because host detection is async. Always `await` it.
- **Assuming all KvStore methods are synchronous.** Every method (`get`, `set`, `remove`, `getJSON`, `setJSON`) returns a Promise.

### Logger

- **Creating loggers inside hot loops.** `createLogger()` is cheap but namespace strings should be stable. Create loggers at module scope.
- **Assuming `configure()` only affects future loggers.** It modifies global state, affecting all existing logger instances immediately.
- **Not understanding namespace filtering.** When `namespaces` is set, only listed namespaces get the configured `level`. All other namespaces fall back to the default level (`"warn"`), meaning they only emit `error` and `warn`.

## Reference Files

- [Address API](references/address-api.md) - SS58, H160, display utilities
- [Crypto API](references/crypto-api.md) - AES-GCM, ChaCha20, HKDF, NaCl, randomBytes
- [Utils API](references/utils-api.md) - Encoding (hex, UTF-8, concat), hashing (blake2b-256, sha2-256, keccak-256), token formatting (planck)
- [Storage API](references/storage-api.md) - KvStore creation and types
- [Logger API](references/logger-api.md) - configure, createLogger, types
