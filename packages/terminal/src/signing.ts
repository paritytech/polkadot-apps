/**
 * Transaction signing via the paired Polkadot mobile wallet.
 *
 * After QR login, the terminal can request the wallet to sign
 * extrinsics or raw messages via the encrypted session channel.
 *
 * Reference: triangle-js-sdks/packages/host-papp/src/sso/sessionManager/
 */
import { createLogger } from "@polkadot-apps/logger";
import { bytesToHex } from "@polkadot-apps/crypto";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import { entropyToMiniSecret, mnemonicToEntropy } from "@polkadot-labs/hdkd-helpers";

import { createSigningSession } from "./sso/session.js";
import type { QrLoginResult } from "./types.js";

const log = createLogger("terminal:signing");

// ============================================================================
// SCALE Codecs (hand-rolled, matching the reference SDK)
// ============================================================================

function encodeCompact(value: number): Uint8Array {
    if (value < 64) return new Uint8Array([value << 2]);
    if (value < 0x4000) return new Uint8Array([(value << 2) | 1, value >> 6]);
    if (value < 0x40000000) {
        return new Uint8Array([(value << 2) | 2, value >> 6, value >> 14, value >> 22]);
    }
    throw new Error(`Value too large for compact encoding: ${value}`);
}

function decodeCompact(bytes: Uint8Array, offset: number): [number, number] {
    const mode = bytes[offset] & 0x03;
    if (mode === 0) return [bytes[offset] >> 2, 1];
    if (mode === 1) return [((bytes[offset] | (bytes[offset + 1] << 8)) >> 2) & 0x3fff, 2];
    if (mode === 2) {
        const val =
            (bytes[offset] |
                (bytes[offset + 1] << 8) |
                (bytes[offset + 2] << 16) |
                (bytes[offset + 3] << 24)) >>>
            2;
        return [val, 4];
    }
    throw new Error("Big-integer compact encoding not supported");
}

function encodeString(s: string): Uint8Array {
    const utf8 = new TextEncoder().encode(s);
    const len = encodeCompact(utf8.length);
    const result = new Uint8Array(len.length + utf8.length);
    result.set(len);
    result.set(utf8, len.length);
    return result;
}

function decodeString(bytes: Uint8Array, offset: number): [string, number] {
    const [len, lenSize] = decodeCompact(bytes, offset);
    const str = new TextDecoder().decode(bytes.slice(offset + lenSize, offset + lenSize + len));
    return [str, lenSize + len];
}

function encodeBytes(data: Uint8Array): Uint8Array {
    const len = encodeCompact(data.length);
    const result = new Uint8Array(len.length + data.length);
    result.set(len);
    result.set(data, len.length);
    return result;
}

function decodeBytes(bytes: Uint8Array, offset: number): [Uint8Array, number] {
    const [len, lenSize] = decodeCompact(bytes, offset);
    return [bytes.slice(offset + lenSize, offset + lenSize + len), lenSize + len];
}

function mergeUint8(arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}

// -- StatementData envelope --

function encodeStatementDataRequest(requestId: string, innerPayload: Uint8Array): Uint8Array {
    return mergeUint8([
        new Uint8Array([0]), // variant 0 = request
        encodeString(requestId),
        encodeCompact(1), // Vec<Bytes> with 1 element
        encodeBytes(innerPayload),
    ]);
}

// -- RemoteMessage --

function encodeRemoteMessage(messageId: string, innerVariant: number, innerData: Uint8Array): Uint8Array {
    return mergeUint8([
        encodeString(messageId),
        new Uint8Array([0]), // data variant 0 = v1
        new Uint8Array([innerVariant]),
        innerData,
    ]);
}

// -- SigningRequest types --

/** A raw message signing request. */
export interface SigningRawRequest {
    address: string;
    data: { type: "Bytes"; value: Uint8Array } | { type: "Payload"; value: string };
}

function encodeSigningRawRequest(req: SigningRawRequest): Uint8Array {
    const addressEnc = encodeString(req.address);
    if (req.data.type === "Bytes") {
        return mergeUint8([addressEnc, new Uint8Array([0]), encodeBytes(req.data.value)]);
    }
    return mergeUint8([addressEnc, new Uint8Array([1]), encodeString(req.data.value)]);
}

// -- SigningResponse decoding --

/** Result of a successful signing operation. */
export interface SigningResponseData {
    signature: Uint8Array;
    signedTransaction?: Uint8Array;
}

function decodeSigningResponse(
    bytes: Uint8Array,
    expectedMessageId: string,
): SigningResponseData | undefined {
    try {
        let offset = 0;

        const [_msgId, msgIdLen] = decodeString(bytes, offset);
        offset += msgIdLen;

        if (bytes[offset++] !== 0) return undefined; // must be v1
        if (bytes[offset++] !== 2) return undefined; // must be SignResponse

        const [respondingTo, rtLen] = decodeString(bytes, offset);
        offset += rtLen;

        if (respondingTo !== expectedMessageId) return undefined;

        const resultVariant = bytes[offset++];
        if (resultVariant === 0) {
            const [signature, sigLen] = decodeBytes(bytes, offset);
            offset += sigLen;

            const optByte = bytes[offset++];
            let signedTransaction: Uint8Array | undefined;
            if (optByte === 1) {
                const [tx] = decodeBytes(bytes, offset);
                signedTransaction = tx;
            }

            return { signature, signedTransaction };
        } else if (resultVariant === 1) {
            const [errorMsg] = decodeString(bytes, offset);
            throw new Error(`Wallet rejected signing: ${errorMsg}`);
        }

        return undefined;
    } catch (err) {
        if (err instanceof Error && err.message.startsWith("Wallet rejected")) throw err;
        return undefined;
    }
}

// ============================================================================
// Public API
// ============================================================================

/** Options for creating a wallet signer. */
export interface WalletSignerOptions {
    /** Statement store endpoint. If omitted, uses chain-client. */
    endpoint?: string;
    /** Timeout for signing requests in milliseconds. Default: 120_000 (2 minutes). */
    timeoutMs?: number;
}

/** A signer that delegates to the paired Polkadot mobile wallet. */
export interface WalletSigner {
    /** The SS58 address of the signing account. */
    address: string;

    /** Request the wallet to sign a raw message. */
    signRaw(request: SigningRawRequest): Promise<SigningResponseData>;

    /** Destroy the signer and release statement store resources. */
    destroy(): void;
}

let messageCounter = 0;

function generateMessageId(): string {
    return `${Date.now()}-${++messageCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a wallet signer from a completed QR login result.
 *
 * The signer communicates with the paired mobile wallet via encrypted
 * messages over the statement store.
 */
export async function createWalletSigner(
    loginResult: QrLoginResult,
    options?: WalletSignerOptions,
): Promise<WalletSigner> {
    const timeoutMs = options?.timeoutMs ?? 120_000;

    // Re-derive the Sr25519 keypair from the persisted mnemonic
    const entropy = mnemonicToEntropy(loginResult.mnemonic);
    const miniSecret = entropyToMiniSecret(entropy);
    const derive = sr25519CreateDerive(miniSecret);
    const walletKey = derive("//wallet//sso");

    const session = await createSigningSession({
        sharedSecret: loginResult.sharedSecret,
        localAccountId: loginResult.localAccountId,
        remoteAccountId: loginResult.publicKey,
        sign: (message) => walletKey.sign(message),
        endpoint: options?.endpoint,
    });

    log.info("Wallet signer ready", { address: loginResult.address });

    return {
        address: loginResult.address,

        async signRaw(request: SigningRawRequest): Promise<SigningResponseData> {
            const messageId = generateMessageId();

            const rawEncoded = encodeSigningRawRequest(request);
            const signingRequest = mergeUint8([new Uint8Array([1]), rawEncoded]); // 1 = Raw variant
            const remoteMessage = encodeRemoteMessage(messageId, 1, signingRequest); // 1 = SignRequest
            const statementData = encodeStatementDataRequest(messageId, remoteMessage);

            log.debug("Sending signRaw request", { messageId });

            return session.request<SigningResponseData>(
                statementData,
                (decrypted) => decodeSigningResponse(decrypted, messageId),
                timeoutMs,
            );
        },

        destroy() {
            session.destroy();
        },
    };
}
