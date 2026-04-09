/**
 * Encrypted session messaging over the statement store.
 *
 * After QR login pairing, the terminal and mobile wallet communicate
 * via encrypted messages published to the statement store. This module
 * provides the session layer: topic derivation, encryption, and
 * request/response messaging.
 *
 * Reference: triangle-js-sdks/packages/statement-store/src/session/session.ts
 */
import { createLogger } from "@polkadot-apps/logger";
import {
    aesGcmDecryptPacked,
    aesGcmEncryptPacked,
    bytesToHex,
    deriveKey,
} from "@polkadot-apps/crypto";
import type { Unsubscribable, StatementFields, TopicHash } from "@polkadot-apps/statement-store";
import {
    createTransport,
    encodeStatement,
    createSignatureMaterial,
    toHex,
    decodeStatement,
} from "@polkadot-apps/statement-store";

import { khash } from "./crypto.js";

const log = createLogger("terminal:session");

// ============================================================================
// Topic / Channel derivation (matches @novasamatech/statement-store)
// ============================================================================

const textEncoder = new TextEncoder();

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

/**
 * Derive the session ID (topic) for post-handshake communication.
 *
 * Matches `createSessionId(sharedSecret, accountA, accountB)` from the
 * reference SDK. Both sides use the same sharedSecret but swap A/B order
 * for send vs receive topics.
 */
function createSessionId(
    sharedSecret: Uint8Array,
    accountAId: Uint8Array,
    accountBId: Uint8Array,
): Uint8Array {
    const sessionPrefix = textEncoder.encode("session");
    const pinSeparator = textEncoder.encode("/");
    const params = mergeUint8([accountAId, accountBId, pinSeparator, pinSeparator]);
    return khash(sharedSecret, mergeUint8([sessionPrefix, params]));
}

/** Derive the request channel from the session ID. */
function createRequestChannel(sessionId: Uint8Array): Uint8Array {
    return khash(sessionId, textEncoder.encode("request"));
}

// ============================================================================
// Encryption (matches @novasamatech/statement-store/session/encryption.ts)
// ============================================================================

function createEncryption(sharedSecret: Uint8Array) {
    const aesKey = deriveKey(sharedSecret, new Uint8Array(0), new Uint8Array(0));
    return {
        encrypt(data: Uint8Array): Uint8Array {
            return aesGcmEncryptPacked(data, aesKey);
        },
        decrypt(data: Uint8Array): Uint8Array {
            return aesGcmDecryptPacked(data, aesKey);
        },
    };
}

// ============================================================================
// Session
// ============================================================================

/** Options for creating a signing session. */
export interface SessionOptions {
    /** P256 ECDH shared secret from the pairing (32 bytes). */
    sharedSecret: Uint8Array;
    /** Local Sr25519 account ID (32 bytes). */
    localAccountId: Uint8Array;
    /** Remote wallet's account ID (32 bytes). */
    remoteAccountId: Uint8Array;
    /** Sr25519 signer — signs the statement proof so the node accepts it. */
    sign: (message: Uint8Array) => Uint8Array;
    /** Statement store endpoint. If omitted, uses chain-client. */
    endpoint?: string;
}

/** An encrypted session for sending signing requests to the paired wallet. */
export interface SigningSession {
    /**
     * Send an encrypted request and wait for a response.
     *
     * @param data - The SCALE-encoded request payload.
     * @param filter - Called for each incoming message. Return a value to resolve, or undefined to keep waiting.
     * @param timeoutMs - How long to wait for a response.
     */
    request<T>(
        data: Uint8Array,
        filter: (decryptedData: Uint8Array) => T | undefined,
        timeoutMs?: number,
    ): Promise<T>;

    /** Destroy the session and release resources. */
    destroy(): void;
}

/**
 * Create an encrypted signing session with the paired wallet.
 */
export async function createSigningSession(options: SessionOptions): Promise<SigningSession> {
    const { sharedSecret, localAccountId, remoteAccountId, sign, endpoint } = options;
    const encryption = createEncryption(sharedSecret);

    // Topic for sending: local → remote
    const sendSessionId = createSessionId(sharedSecret, localAccountId, remoteAccountId);
    const sendChannel = createRequestChannel(sendSessionId);

    // Topic for receiving: remote → local
    const receiveSessionId = createSessionId(sharedSecret, remoteAccountId, localAccountId);

    const transport = await createTransport({ endpoint });

    log.info("Signing session created", {
        sendTopic: bytesToHex(sendSessionId).slice(0, 16) + "...",
        recvTopic: bytesToHex(receiveSessionId).slice(0, 16) + "...",
    });

    return {
        async request<T>(
            data: Uint8Array,
            filter: (decryptedData: Uint8Array) => T | undefined,
            timeoutMs = 120_000,
        ): Promise<T> {
            const encrypted = encryption.encrypt(data);
            const expirationTimestamp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
            const sequenceNumber = Date.now() % 0xffffffff;

            const fields: StatementFields = {
                expirationTimestamp,
                sequenceNumber,
                topic1: sendSessionId,
                channel: sendChannel,
                data: encrypted,
            };

            // Sign with Sr25519 so the node accepts the statement
            const signatureMaterial = createSignatureMaterial(fields);
            const signature = sign(signatureMaterial);
            const encoded = encodeStatement(fields, localAccountId, signature);
            const hex = toHex(encoded);
            const status = await transport.submit(hex);

            log.info("Request submitted", { status });

            // Subscribe and wait for the filtered response
            return new Promise<T>((resolve, reject) => {
                let timer: ReturnType<typeof setTimeout> | null = null;
                let sub: Unsubscribable | null = null;

                function cleanup() {
                    if (timer) {
                        clearTimeout(timer);
                        timer = null;
                    }
                    sub?.unsubscribe();
                    sub = null;
                }

                timer = setTimeout(() => {
                    cleanup();
                    reject(new Error(`Signing request timed out after ${timeoutMs}ms`));
                }, timeoutMs);

                const topicFilter = {
                    matchAll: [receiveSessionId as TopicHash],
                };

                sub = transport.subscribe(
                    topicFilter,
                    (statementHex: string) => {
                        try {
                            const statement = decodeStatement(statementHex);
                            if (!statement.data || statement.data.length === 0) return;

                            const decrypted = encryption.decrypt(statement.data);
                            const result = filter(decrypted);
                            if (result !== undefined) {
                                cleanup();
                                resolve(result);
                            }
                        } catch (err) {
                            log.debug("Ignoring statement in session", {
                                error: err instanceof Error ? err.message : String(err),
                            });
                        }
                    },
                    (error: Error) => {
                        log.warn("Session subscription error", { error: error.message });
                    },
                );
            });
        },

        destroy() {
            transport.destroy();
        },
    };
}
