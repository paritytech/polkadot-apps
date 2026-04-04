import { SignerManager } from "@polkadot-apps/signer";

let manager: SignerManager | null = null;

export function getSignerManager(): SignerManager {
    if (!manager) {
        manager = new SignerManager({
            ss58Prefix: 42,
            dappName: "t3rminal-lite",
        });
    }
    return manager;
}

export function destroySignerManager(): void {
    if (manager) {
        manager.destroy();
        manager = null;
    }
}
