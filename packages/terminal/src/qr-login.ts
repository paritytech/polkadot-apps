/**
 * QR code login via the Polkadot SSO handshake protocol.
 *
 * The CLI generates Sr25519 + P256 keypairs, encodes them as a
 * `polkadotapp://pair?handshake=0x...` deep link, displays a QR code,
 * and subscribes to a Statement Store topic derived from the keypairs.
 * The Polkadot mobile app scans the QR, performs ECDH, and publishes
 * an encrypted response containing the user's account ID.
 *
 * Reference: papp-terminal/src/cli.rs
 */
import { createLogger } from "@polkadot-apps/logger";
import { createTransport, decodeStatement } from "@polkadot-apps/statement-store";
import type { Unsubscribable } from "@polkadot-apps/statement-store";
import { createKvStore } from "@polkadot-apps/storage";
import type { KvStore } from "@polkadot-apps/storage";
import { ss58Encode } from "@polkadot-apps/address";
import { bytesToHex, hexToBytes } from "@polkadot-apps/crypto";
import { generateMnemonic } from "@polkadot-labs/hdkd-helpers";

import { QrLoginCancelledError, QrLoginTimeoutError } from "./errors.js";
import { AuthFlow } from "./sso/auth-flow.js";
import type {
    QrLoginController,
    QrLoginOptions,
    QrLoginResult,
    TerminalSession,
} from "./types.js";

const log = createLogger("terminal:qr-login");

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes
const DEFAULT_ENDPOINTS = ["wss://paseo-people-next-rpc.polkadot.io"];
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const STORAGE_PREFIX = "polkadot-apps:terminal";
const SESSION_KEY = "session";

/**
 * Start a QR login session using the Polkadot SSO handshake protocol.
 *
 * 1. Generates a fresh BIP39 mnemonic
 * 2. Derives Sr25519 (//wallet//sso) and P256 keypairs
 * 3. SCALE-encodes the handshake payload
 * 4. Produces the `polkadotapp://pair?handshake=0x...` deep link
 * 5. Subscribes to a Statement Store topic derived from the keypairs
 * 6. Waits for the wallet's encrypted response
 * 7. Decrypts and extracts the remote account ID
 */
/* @integration */
export async function startQrLogin(options: QrLoginOptions): Promise<QrLoginController> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const metadataUrl = options.metadataUrl;
    const endpoints = options.endpoints ?? DEFAULT_ENDPOINTS;

    const mnemonic = generateMnemonic();
    const auth = AuthFlow.fromMnemonic(mnemonic, metadataUrl);

    const deepLink = auth.deepLink();
    const topic = auth.topic();
    const sessionId = bytesToHex(auth.accountId);
    const topicHex = bytesToHex(topic);

    log.info("SSO handshake starting", { endpoint: endpoints[0] });

    options?.onPairingUri?.(deepLink);

    const transport = await createTransport({ endpoint: endpoints[0] });

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sub: Unsubscribable | null = null;
    let rejectResult: ((error: Error) => void) | null = null;

    const result = new Promise<QrLoginResult>((resolve, reject) => {
        rejectResult = reject;

        timer = setTimeout(() => {
            if (!cancelled) {
                log.warn("QR login timed out", { timeoutMs });
                cancelled = true;
                cleanup();
                reject(new QrLoginTimeoutError(timeoutMs));
            }
        }, timeoutMs);

        const topicFilter = {
            matchAll: [topic as Uint8Array & { readonly __brand: "TopicHash" }],
        };

        sub = transport.subscribe(
            topicFilter,
            (statementHex: string) => {
                if (cancelled) return;

                try {
                    const statement = decodeStatement(statementHex);
                    if (!statement.data || statement.data.length === 0) return;

                    const session = auth.processResponse(statement.data);
                    const address = ss58Encode(session.remoteAccountId);

                    log.info("Pairing successful", { address });

                    const loginResult: QrLoginResult = {
                        address,
                        publicKey: session.remoteAccountId,
                        name: null,
                        sessionId,
                    };

                    cancelled = true;
                    cleanup();
                    persistSession(loginResult).catch(() => {});
                    resolve(loginResult);
                } catch (err) {
                    log.debug("Ignoring statement (not a valid handshake response)", {
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            },
            (error: Error) => {
                if (!cancelled) {
                    log.warn("Subscription error", { error: error.message });
                }
            },
        );
    });

    function cleanup() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        sub?.unsubscribe();
        sub = null;
    }

    return {
        pairingUri: deepLink,
        sessionId,
        result,
        cancel() {
            if (cancelled) return;
            cancelled = true;
            cleanup();
            rejectResult?.(new QrLoginCancelledError());
        },
        destroy() {
            if (!cancelled) {
                cancelled = true;
                cleanup();
                rejectResult?.(new QrLoginCancelledError());
            }
            transport.destroy();
        },
    };
}

/**
 * Resume an existing session from storage.
 * Returns null if no valid (non-expired) session exists.
 */
export async function resumeSession(storagePrefix?: string): Promise<QrLoginResult | null> {
    const store = await getStore(storagePrefix);
    const session = await store.getJSON<TerminalSession>(SESSION_KEY);

    if (!session) return null;
    if (Date.now() > session.expiresAt) {
        log.debug("Session expired, clearing");
        await store.remove(SESSION_KEY);
        return null;
    }

    return {
        address: session.address,
        publicKey: hexToBytes(session.publicKeyHex),
        name: session.name,
        sessionId: session.sessionId,
    };
}

/** Clear the persisted session. */
export async function clearSession(storagePrefix?: string): Promise<void> {
    const store = await getStore(storagePrefix);
    await store.remove(SESSION_KEY);
}

async function persistSession(result: QrLoginResult): Promise<void> {
    try {
        const store = await getStore();
        const session: TerminalSession = {
            sessionId: result.sessionId,
            address: result.address,
            publicKeyHex: bytesToHex(result.publicKey),
            name: result.name,
            createdAt: Date.now(),
            expiresAt: Date.now() + SESSION_TTL_MS,
        };
        await store.setJSON(SESSION_KEY, session);
        log.debug("Session persisted");
    } catch (err) {
        log.warn("Failed to persist session", {
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

let _store: KvStore | null = null;

async function getStore(prefix?: string): Promise<KvStore> {
    if (!_store) {
        _store = await createKvStore({ prefix: prefix ?? STORAGE_PREFIX });
    }
    return _store;
}

if (import.meta.vitest) {
    const { describe, test, expect } = import.meta.vitest;

    describe("resumeSession", () => {
        test("returns null when no session stored", async () => {
            const result = await resumeSession("test-nonexistent-prefix");
            expect(result).toBeNull();
        });
    });
}
