import type { PolkadotSigner } from "polkadot-api";

/**
 * Load a persisted QR session from ~/.polkadot-apps/ and return its signer + origin.
 * Returns null if no session is available (e.g. user never ran `dot init`).
 */
export async function getSessionSigner(): Promise<{
    signer: PolkadotSigner;
    origin: string;
    destroy: () => void;
} | null> {
    try {
        const {
            createTerminalAdapter,
            createSessionSigner,
            DEFAULT_METADATA_URL,
            DEFAULT_PEOPLE_ENDPOINTS,
        } = await import("@polkadot-apps/terminal");

        const adapter = createTerminalAdapter({
            appId: "dot-cli",
            metadataUrl: DEFAULT_METADATA_URL,
            endpoints: DEFAULT_PEOPLE_ENDPOINTS,
        });

        const session = await new Promise<any | null>((resolve) => {
            let resolved = false;
            let unsub: (() => void) | null = null;
            unsub = adapter.sessions.sessions.subscribe((sessions: any[]) => {
                if (sessions.length > 0 && !resolved) {
                    resolved = true;
                    queueMicrotask(() => unsub?.());
                    resolve(sessions[0]);
                }
            });
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    unsub?.();
                    resolve(null);
                }
            }, 3000);
        });

        if (!session) {
            adapter.destroy();
            return null;
        }

        const { ss58Address } = await import("@polkadot-labs/hdkd-helpers");
        const signer = createSessionSigner(session);
        const origin = ss58Address(new Uint8Array(session.remoteAccount.accountId));

        return { signer, origin, destroy: () => adapter.destroy() };
    } catch {
        return null;
    }
}
