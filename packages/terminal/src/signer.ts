/**
 * Create a PolkadotSigner from a QR-paired session.
 *
 * Bridges the host-papp session's `signRaw()` to polkadot-api's
 * `PolkadotSigner` interface via `getPolkadotSigner`, enabling
 * mobile-approved signing for on-chain transactions from the CLI.
 *
 * @example
 * ```ts
 * const session = adapter.sessions.sessions.read()[0];
 * const signer = createSessionSigner(session);
 * await contract.publish.tx(domain, cid, { signer, origin });
 * ```
 */
import { getPolkadotSigner } from "polkadot-api/signer";
import type { PolkadotSigner } from "polkadot-api";
import type { UserSession } from "@novasamatech/host-papp";

/**
 * Create a `PolkadotSigner` backed by a QR-paired mobile wallet session.
 *
 * Each signing request is sent to the paired phone for approval.
 * The returned signer can be used anywhere polkadot-api expects a signer.
 */
export function createSessionSigner(session: UserSession): PolkadotSigner {
    const accountId = new Uint8Array(session.remoteAccount.accountId);
    const address = "0x" + Buffer.from(accountId).toString("hex");

    return getPolkadotSigner(
        accountId,
        "Sr25519",
        async (data: Uint8Array): Promise<Uint8Array> => {
            const result = await session.signRaw({
                address,
                data: { tag: "Bytes" as const, value: data },
            });

            if (result.isErr()) {
                throw new Error(`Mobile signing rejected: ${result.error.message}`);
            }

            return result.value.signature;
        },
    );
}
