import type { PolkadotSigner } from "polkadot-api";

/** Derivation result for a Substrate/EVM account from seed material. */
export interface DerivedAccount {
    /** Public key (32 bytes). Sr25519 or Ed25519 depending on key type. */
    publicKey: Uint8Array;
    /** SS58 address (generic prefix 42 by default) */
    ss58Address: string;
    /** H160 EVM address derived via keccak256(publicKey) */
    h160Address: `0x${string}`;
    /** PolkadotSigner for signing extrinsics */
    signer: PolkadotSigner;
}

/** NaCl encryption + signing keypairs derived from a master key. */
export interface DerivedKeypairs {
    /** Curve25519 keypair for NaCl Box (asymmetric encryption) */
    encryption: { publicKey: Uint8Array; secretKey: Uint8Array };
    /** Ed25519 keypair for NaCl Sign (digital signatures) */
    signing: { publicKey: Uint8Array; secretKey: Uint8Array };
}

/** Session key info returned by SessionKeyManager. */
export interface SessionKeyInfo {
    /** The BIP39 mnemonic (the only thing that needs persisting) */
    mnemonic: string;
    /** The derived account info */
    account: DerivedAccount;
}
