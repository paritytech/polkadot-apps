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

if (import.meta.vitest) {
    const { describe, test, expect, vi } = import.meta.vitest;
    const { ok, err } = await import("neverthrow");

    /**
     * Build a minimal `UserSession`-shaped stub whose `signRaw` is a Vitest spy.
     * Only the fields used by `createSessionSigner` are populated.
     */
    function makeSession(
        signRaw: (req: unknown) => Promise<unknown>,
        accountIdBytes: number[] = new Array(32).fill(0).map((_, i) => i),
    ): UserSession {
        return {
            remoteAccount: { accountId: accountIdBytes },
            signRaw: vi.fn(signRaw),
        } as unknown as UserSession;
    }

    describe("createSessionSigner", () => {
        test("exposes Sr25519 public key matching remoteAccount.accountId", () => {
            const bytes = Array.from({ length: 32 }, (_, i) => i);
            const signer = createSessionSigner(
                makeSession(async () => ok({ signature: new Uint8Array() }), bytes),
            );
            expect(signer.publicKey).toEqual(new Uint8Array(bytes));
        });

        test("signBytes returns signature on success", async () => {
            const sig = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1]);
            const session = makeSession(async () => ok({ signature: sig }));
            const signer = createSessionSigner(session);

            const out = await signer.signBytes(new Uint8Array([1, 2, 3]));
            expect(out).toEqual(sig);
        });

        test("forwards request as { tag: 'Bytes', value } with hex-formatted address", async () => {
            const bytes = Array.from({ length: 32 }, (_, i) => i + 1);
            const captured: unknown[] = [];
            const session = makeSession(async (req) => {
                captured.push(req);
                return ok({ signature: new Uint8Array([42]) });
            }, bytes);
            const signer = createSessionSigner(session);

            // Note: polkadot-api wraps signBytes payloads in <Bytes>...</Bytes>
            // before invoking the underlying callback. We only care here that
            // our wrapping (`{ tag: 'Bytes', value }` envelope + hex address) is
            // correct — not the byte-level payload contents.
            await signer.signBytes(new Uint8Array([10, 20, 30]));

            expect(captured).toHaveLength(1);
            const req = captured[0] as {
                address: string;
                data: { tag: string; value: Uint8Array };
            };
            expect(req.address).toBe("0x" + Buffer.from(new Uint8Array(bytes)).toString("hex"));
            expect(req.address).toMatch(/^0x[0-9a-f]{64}$/);
            expect(req.data.tag).toBe("Bytes");
            expect(req.data.value).toBeInstanceOf(Uint8Array);
        });

        test("signBytes throws when mobile signing is rejected", async () => {
            const session = makeSession(async () => err({ message: "user declined" }));
            const signer = createSessionSigner(session);

            await expect(signer.signBytes(new Uint8Array([1]))).rejects.toThrow(
                "Mobile signing rejected: user declined",
            );
        });
    });
}
