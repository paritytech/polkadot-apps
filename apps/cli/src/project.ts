import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { seedToAccount } from "@polkadot-apps/keys";
import { DEV_PHRASE } from "@polkadot-labs/hdkd-helpers";

// ---------------------------------------------------------------------------
// dot.json config
// ---------------------------------------------------------------------------

export interface ProjectConfig {
    domain?: string;
    name?: string;
    description?: string;
    repository?: string;
    branch?: string;
    tag?: string;
    icon?: string;
    build?: string;
}

export function loadProjectConfig(): ProjectConfig {
    const dotPath = resolve(process.cwd(), "dot.json");
    if (!existsSync(dotPath)) return {};

    try {
        return JSON.parse(readFileSync(dotPath, "utf-8"));
    } catch {
        return {};
    }
}

export function saveDotJson(updates: Partial<ProjectConfig>) {
    const dotPath = resolve(process.cwd(), "dot.json");
    let existing: Record<string, unknown> = {};
    if (existsSync(dotPath)) {
        try {
            existing = JSON.parse(readFileSync(dotPath, "utf-8"));
        } catch {}
    }
    const merged = { ...existing };
    for (const [k, v] of Object.entries(updates)) {
        if (v !== undefined) merged[k] = v;
    }
    writeFileSync(dotPath, JSON.stringify(merged, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

export function getGitRemoteUrl(): string | undefined {
    try {
        const url = execSync("git remote get-url origin", {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
        }).trim();
        return url.replace(/^git@github\.com:/, "https://github.com/").replace(/\.git$/, "");
    } catch {
        return undefined;
    }
}

export function getGitBranch(): string | undefined {
    try {
        return execSync("git symbolic-ref --short HEAD", {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
        }).trim();
    } catch {
        return undefined;
    }
}

// ---------------------------------------------------------------------------
// README
// ---------------------------------------------------------------------------

const README_NAMES = ["README.md", "readme.md", "README.txt", "README"];
const MAX_README_SIZE = 512 * 1024; // 512 KB

export function readReadme(): string | undefined {
    for (const name of README_NAMES) {
        const path = resolve(process.cwd(), name);
        if (existsSync(path)) {
            const content = readFileSync(path, "utf-8");
            if (content.length > MAX_README_SIZE) {
                return content.slice(0, MAX_README_SIZE);
            }
            return content;
        }
    }
    return undefined;
}

// ---------------------------------------------------------------------------
// Account & signer
// ---------------------------------------------------------------------------

export function loadAccount(chain: string): { address: string; mnemonic: string } {
    const accountsPath = resolve(homedir(), ".polkadot/accounts.json");
    try {
        const accounts = JSON.parse(readFileSync(accountsPath, "utf-8"));
        if (!accounts[chain]) {
            throw new Error(
                `No account found for chain "${chain}". Run "dot init" or use --suri //Alice for dev.`,
            );
        }
        return accounts[chain];
    } catch (err: unknown) {
        if (err instanceof Error && "code" in err && (err as any).code === "ENOENT") {
            throw new Error(
                `No accounts file found. Run "dot init" or use --suri //Alice for dev.`,
            );
        }
        throw err;
    }
}

export function prepareSigner(mnemonic: string, derivePath: string = "") {
    const account = seedToAccount(mnemonic, derivePath || "//0");
    return { signer: account.signer, origin: account.ss58Address };
}

export function resolveSigner(chain: string, suri?: string) {
    if (suri) {
        if (suri.startsWith("//")) {
            return prepareSigner(DEV_PHRASE, suri);
        }
        throw new Error("Only dev SURIs (//Name) are currently supported. Use --suri //Alice");
    }
    const account = loadAccount(chain);
    return prepareSigner(account.mnemonic);
}

export function loadMnemonic(chain: string): string {
    return loadAccount(chain).mnemonic;
}
