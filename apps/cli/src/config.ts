// Chain presets — only ipfsGateway is used here.
// RPC connections go through @polkadot-apps/chain-client presets.
export const CHAINS: Record<string, { ipfsGateway: string }> = {
    paseo: {
        ipfsGateway: "https://paseo-ipfs.polkadot.io/ipfs",
    },
    local: {
        ipfsGateway: "http://127.0.0.1:8283/ipfs",
    },
};

export const DEFAULT_CHAIN = "paseo";

// Metadata schema
export interface AppMetadata {
    name?: string;
    description?: string;
    repository?: string;
    branch?: string;
    icon_cid?: string;
    tag?: string;
}

// Valid tags
export const TAGS = ["social", "chat", "defi", "utility", "gaming", "marketplace", "irl"] as const;

if (import.meta.vitest) {
    const { test, expect } = import.meta.vitest;

    test("DEFAULT_CHAIN is paseo", () => {
        expect(DEFAULT_CHAIN).toBe("paseo");
    });

    test("CHAINS has expected presets", () => {
        expect(Object.keys(CHAINS)).toEqual(expect.arrayContaining(["paseo", "local"]));
    });

    test("each chain has ipfsGateway", () => {
        for (const [name, chain] of Object.entries(CHAINS)) {
            expect(chain.ipfsGateway, `${name}.ipfsGateway`).toBeTruthy();
        }
    });

    test("local chain uses localhost URL", () => {
        expect(CHAINS.local.ipfsGateway).toContain("127.0.0.1");
    });

    test("TAGS contains expected categories", () => {
        expect(TAGS).toContain("social");
        expect(TAGS).toContain("defi");
        expect(TAGS).toContain("gaming");
        expect(TAGS.length).toBe(7);
    });
}
