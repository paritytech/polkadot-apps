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

import { createNodeStorageAdapter } from "./node-storage.js";

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

/** Default metadata URL for the `dot` CLI app pairing screen. */
export const DEFAULT_METADATA_URL =
    "https://gist.githubusercontent.com/ReinhardHatko/1967dd3f4afe78683cc0ba14d6ec8744/raw/c1625eb7ed7671b7e09a3fa2a25998dde33c70b8/metadata.json";

/** Default People chain endpoints for SSO attestation. */
export const DEFAULT_PEOPLE_ENDPOINTS = ["wss://paseo-people-next-rpc.polkadot.io"];

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

export function createTerminalAdapter(options: TerminalAdapterOptions): TerminalAdapter {
    const endpoints = options.endpoints ?? SS_PASEO_STABLE_STAGE_ENDPOINTS;

    const storage = createNodeStorageAdapter(options.appId);
    const lazyClient = createLazyClient(
        getWsProvider({ endpoints, heartbeatTimeout: Number.POSITIVE_INFINITY }),
    );
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

    return {
        ...adapter,
        destroy() {
            adapter.sessions.dispose();
            lazyClient.disconnect();
        },
    };
}

export { SS_STABLE_STAGE_ENDPOINTS, SS_PASEO_STABLE_STAGE_ENDPOINTS };
