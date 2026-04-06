---
"@polkadot-apps/bulletin": minor
---

Add `hashToCid` function to reconstruct a CIDv1 from a `0x`-prefixed hex hash — the reverse of `cidToPreimageKey`. Supports all hash algorithms (blake2b-256, sha2-256, keccak-256) and codecs (raw, dag-pb, dag-cbor) used by the Bulletin Chain. Also exports `HashAlgorithm` and `CidCodec` constants, and broadens `cidToPreimageKey` to accept any supported hash algorithm.
