/**
 * Node.js adapter for the Polkadot host-papp SDK.
 *
 * Provides Node.js-compatible implementations of the SDK's storage and
 * transport layers, enabling QR login, attestation, and signing in
 * terminal/CLI environments.
 */
import {
    createPappAdapter,
    type PappAdapter,
    type HostMetadata,
    SS_STABLE_STAGE_ENDPOINTS,
    SS_PASEO_STABLE_STAGE_ENDPOINTS,
} from "@novasamatech/host-papp";
import { createLazyClient, createPapiStatementStoreAdapter } from "@novasamatech/statement-store";
import { getWsProvider } from "@polkadot-api/ws-provider/node";

import { createStorageAdapter } from "./node-storage.js";

/** Options for creating a terminal adapter. */
export interface TerminalAdapterOptions {
    /** Unique app identifier. Used as the storage namespace. */
    appId: string;
    /** URL to the app's metadata JSON (name + icon), shown during pairing. */
    metadataUrl: string;
    /** Statement store WebSocket endpoints. Defaults to Paseo stable endpoints. */
    endpoints?: string[];
    /** Optional host metadata for the Sign-In screen. */
    hostMetadata?: HostMetadata;
}

/**
 * Create a terminal adapter backed by the host-papp SDK.
 *
 * This sets up:
 * - File-based storage in `~/.polkadot-apps/` (since Node.js has no localStorage)
 * - WebSocket connection to the statement store
 * - The full SSO flow: QR pairing + on-chain attestation
 * - Session manager for signing requests
 */
/** A PappAdapter with an additional `destroy` method for cleanup. */
export type TerminalAdapter = PappAdapter & {
    /** Disconnect the WebSocket and release resources. */
    destroy(): void;
};

export async function createTerminalAdapter(
    options: TerminalAdapterOptions,
): Promise<TerminalAdapter> {
    const endpoints = options.endpoints ?? SS_PASEO_STABLE_STAGE_ENDPOINTS;

    const storage = await createStorageAdapter(options.appId);

    // The `@polkadot-api/ws-provider@0.7.5` used by `polkadot-api@1.23.3` returns
    // a `JsonRpcProvider` typed against `@polkadot-api/json-rpc-provider@0.0.4`
    // (string messages), whereas `@novasamatech/statement-store@0.6.17`'s
    // `createLazyClient` expects the same interface from `json-rpc-provider@0.2.0`
    // (typed `JsonRpcMessage` objects). The two declarations are structurally
    // incompatible in TypeScript but behaviorally identical at runtime — both
    // serialize to JSON strings over the WebSocket. The cast bridges the type
    // split until the upstream packages agree on a single json-rpc-provider
    // version.
    const wsProvider = getWsProvider({
        endpoints,
        heartbeatTimeout: Number.POSITIVE_INFINITY,
    }) as unknown as Parameters<typeof createLazyClient>[0];
    const lazyClient = createLazyClient(wsProvider);
    const statementStore = createPapiStatementStoreAdapter(lazyClient);

    const adapter = createPappAdapter({
        appId: options.appId,
        metadata: options.metadataUrl,
        hostMetadata: options.hostMetadata,
        adapters: {
            storage,
            lazyClient,
            statementStore,
        },
    });

    let destroyed = false;
    return {
        ...adapter,
        destroy() {
            if (destroyed) return;
            destroyed = true;

            // The statement-store logs `console.error("Statement subscription error:", err)`
            // when the WebSocket disconnects while subscriptions are still active.
            // This is expected during teardown. Temporarily mute it.
            const origError = console.error;
            console.error = (...args: unknown[]) => {
                if (typeof args[0] === "string" && args[0].includes("Statement subscription")) {
                    return;
                }
                origError.apply(console, args);
            };

            adapter.sessions.dispose();
            try {
                lazyClient.disconnect();
            } catch {
                // best-effort
            }

            setTimeout(() => {
                console.error = origError;
            }, 50);
        },
    };
}

export { SS_STABLE_STAGE_ENDPOINTS, SS_PASEO_STABLE_STAGE_ENDPOINTS };
