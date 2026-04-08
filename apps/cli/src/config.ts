// Chain presets
export const CHAINS: Record<string, { assetHub: string; bulletin: string; ipfsGateway: string }> = {
    paseo: {
        assetHub: "wss://asset-hub-paseo-rpc.n.dwellir.com",
        bulletin: "wss://paseo-bulletin-rpc.polkadot.io",
        ipfsGateway: "https://paseo-ipfs.polkadot.io/ipfs",
    },
    polkadot: {
        assetHub: "wss://polkadot-asset-hub-rpc.polkadot.io",
        bulletin: "wss://polkadot-bulletin-rpc.polkadot.io",
        ipfsGateway: "https://polkadot-bulletin-rpc.polkadot.io/ipfs",
    },
    "preview-net": {
        assetHub: "wss://previewnet.substrate.dev/asset-hub",
        bulletin: "wss://previewnet.substrate.dev/bulletin",
        ipfsGateway: "https://previewnet.substrate.dev/ipfs/",
    },
    local: {
        assetHub: "ws://127.0.0.1:10020",
        bulletin: "ws://127.0.0.1:10030",
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

    test("CHAINS has all expected presets", () => {
        expect(Object.keys(CHAINS)).toEqual(
            expect.arrayContaining(["paseo", "polkadot", "preview-net", "local"]),
        );
    });

    test("each chain has required fields", () => {
        for (const [name, chain] of Object.entries(CHAINS)) {
            expect(chain.assetHub, `${name}.assetHub`).toBeTruthy();
            expect(chain.bulletin, `${name}.bulletin`).toBeTruthy();
            expect(chain.ipfsGateway, `${name}.ipfsGateway`).toBeTruthy();
        }
    });

    test("paseo chain uses correct Asset Hub URL", () => {
        expect(CHAINS.paseo.assetHub).toBe("wss://asset-hub-paseo-rpc.n.dwellir.com");
    });

    test("local chain uses localhost URLs", () => {
        expect(CHAINS.local.assetHub).toContain("127.0.0.1");
        expect(CHAINS.local.bulletin).toContain("127.0.0.1");
        expect(CHAINS.local.ipfsGateway).toContain("127.0.0.1");
    });

    test("TAGS contains expected categories", () => {
        expect(TAGS).toContain("social");
        expect(TAGS).toContain("defi");
        expect(TAGS).toContain("gaming");
        expect(TAGS.length).toBe(7);
    });
}
