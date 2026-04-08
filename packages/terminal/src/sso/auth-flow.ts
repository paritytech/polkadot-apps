/**
 * SSO authentication flow for QR code pairing.
 *
 * Generates Sr25519 + P256 keypairs, produces the SCALE-encoded handshake
 * payload, and processes the encrypted response from the mobile wallet.
 *
 * Reference: papp-terminal/src/auth/mod.rs
 */
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import { entropyToMiniSecret, mnemonicToEntropy } from "@polkadot-labs/hdkd-helpers";
import { aesGcmDecryptPacked, bytesToHex, deriveKey } from "@polkadot-apps/crypto";

import {
    createEncrSecret,
    createSharedSecret,
    getEncrPublicKey,
    handshakeTopic,
} from "./crypto.js";
import {
    decodeHandshakeResponse,
    decodeSensitiveData,
    encodeHandshakeData,
} from "./handshake.js";

/** Result of a successful pairing. */
export interface PairedSession {
    /** Local Sr25519 account ID (32 bytes). */
    localAccountId: Uint8Array;
    /** Remote wallet's account ID (32 bytes). */
    remoteAccountId: Uint8Array;
    /** Remote wallet's P256 public key (65 bytes). */
    remoteEncrPublicKey: Uint8Array;
    /** Permanent ECDH shared secret (32 bytes). */
    sharedSecret: Uint8Array;
}

/**
 * SSO authentication flow.
 *
 * Holds the local keypairs and produces/processes handshake payloads.
 */
export class AuthFlow {
    /** Sr25519 public key (32 bytes), used as account ID. */
    readonly accountId: Uint8Array;
    /** P256 secret key (32 bytes). */
    private readonly encrSecret: Uint8Array;
    /** P256 uncompressed public key (65 bytes). */
    readonly encrPublicKey: Uint8Array;
    /** Metadata URL included in the handshake. */
    readonly metadataUrl: string;

    private constructor(
        accountId: Uint8Array,
        encrSecret: Uint8Array,
        encrPublicKey: Uint8Array,
        metadataUrl: string,
    ) {
        this.accountId = accountId;
        this.encrSecret = encrSecret;
        this.encrPublicKey = encrPublicKey;
        this.metadataUrl = metadataUrl;
    }

    /**
     * Create an auth flow from a BIP39 mnemonic.
     *
     * Derives Sr25519 keypair via `//wallet//sso` hard derivation,
     * then derives P256 keypair from the same entropy.
     */
    static fromMnemonic(mnemonic: string, metadataUrl: string): AuthFlow {
        // Sr25519: entropy → miniSecret → derive //wallet//sso
        const entropy = mnemonicToEntropy(mnemonic);
        const miniSecret = entropyToMiniSecret(entropy);
        const derive = sr25519CreateDerive(miniSecret);
        const walletKey = derive("//wallet//sso");
        const accountId = walletKey.publicKey;

        // P256: same entropy → miniSecret → P256 secret key
        const encrSecret = createEncrSecret(miniSecret);
        const encrPublicKey = getEncrPublicKey(encrSecret);

        return new AuthFlow(accountId, encrSecret, encrPublicKey, metadataUrl);
    }

    /** SCALE-encode the handshake payload for the deep link. */
    handshakePayload(): Uint8Array {
        return encodeHandshakeData(this.accountId, this.encrPublicKey, this.metadataUrl);
    }

    /** Generate the deep link URI: `polkadotapp://pair?handshake=0x<hex>` */
    deepLink(): string {
        const payload = this.handshakePayload();
        return `polkadotapp://pair?handshake=0x${bytesToHex(payload)}`;
    }

    /** Compute the statement store topic to subscribe on. */
    topic(): Uint8Array {
        return handshakeTopic(this.accountId, this.encrPublicKey);
    }

    /**
     * Process a pairing response from the statement store.
     *
     * 1. SCALE-decode the HandshakeResponsePayload
     * 2. P256 ECDH with the ephemeral tmp_key → temporary shared secret
     * 3. HKDF-SHA256 → AES-256 key
     * 4. AES-256-GCM decrypt the sensitive data
     * 5. Extract the remote account ID and permanent P256 key
     * 6. P256 ECDH with the permanent key → final shared secret
     */
    processResponse(data: Uint8Array): PairedSession {
        const response = decodeHandshakeResponse(data);

        // Step 1: ECDH with ephemeral key
        const tmpShared = createSharedSecret(this.encrSecret, response.tmpKey);

        // Step 2: Derive AES key (empty salt + info, matching SDK convention)
        const aesKey = deriveKey(tmpShared, new Uint8Array(0), new Uint8Array(0));

        // Step 3: Decrypt (format: nonce(12) || ciphertext || tag)
        const decrypted = aesGcmDecryptPacked(response.encrypted, aesKey);

        // Step 4: Decode sensitive data
        const sensitive = decodeSensitiveData(decrypted);

        // Step 5: Derive permanent shared secret
        const sharedSecret = createSharedSecret(this.encrSecret, sensitive.encrPublicKey);

        return {
            localAccountId: this.accountId,
            remoteAccountId: sensitive.accountId,
            remoteEncrPublicKey: sensitive.encrPublicKey,
            sharedSecret,
        };
    }
}

if (import.meta.vitest) {
    const { describe, test, expect } = import.meta.vitest;

    const TEST_MNEMONIC =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const TEST_METADATA = "https://example.com/metadata.json";

    describe("AuthFlow", () => {
        test("fromMnemonic produces deterministic keys", () => {
            const a = AuthFlow.fromMnemonic(TEST_MNEMONIC, TEST_METADATA);
            const b = AuthFlow.fromMnemonic(TEST_MNEMONIC, TEST_METADATA);

            expect(a.accountId).toEqual(b.accountId);
            expect(a.encrPublicKey).toEqual(b.encrPublicKey);
            expect(a.accountId.length).toBe(32);
            expect(a.encrPublicKey.length).toBe(65);
            expect(a.encrPublicKey[0]).toBe(0x04); // uncompressed
        });

        test("deepLink has correct scheme", () => {
            const auth = AuthFlow.fromMnemonic(TEST_MNEMONIC, TEST_METADATA);
            const link = auth.deepLink();
            expect(link.startsWith("polkadotapp://pair?handshake=0x")).toBe(true);
        });

        test("handshakePayload starts with variant 0 and ends with 3 None bytes", () => {
            const auth = AuthFlow.fromMnemonic(TEST_MNEMONIC, TEST_METADATA);
            const payload = auth.handshakePayload();
            expect(payload[0]).toBe(0);
            // sr25519 pub at 1..33, p256 pub at 33..98
            expect(payload.subarray(1, 33)).toEqual(auth.accountId);
            expect(payload.subarray(33, 98)).toEqual(auth.encrPublicKey);
            // Last 3 bytes: None for hostVersion, osType, osVersion
            expect(payload[payload.length - 3]).toBe(0);
            expect(payload[payload.length - 2]).toBe(0);
            expect(payload[payload.length - 1]).toBe(0);
        });

        test("topic is deterministic and 32 bytes", () => {
            const auth = AuthFlow.fromMnemonic(TEST_MNEMONIC, TEST_METADATA);
            const t1 = auth.topic();
            const t2 = auth.topic();
            expect(t1).toEqual(t2);
            expect(t1.length).toBe(32);
        });

        test("different mnemonics produce different keys", () => {
            const a = AuthFlow.fromMnemonic(TEST_MNEMONIC, TEST_METADATA);
            const b = AuthFlow.fromMnemonic(
                "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong",
                TEST_METADATA,
            );
            expect(a.accountId).not.toEqual(b.accountId);
            expect(a.encrPublicKey).not.toEqual(b.encrPublicKey);
        });
    });
}
