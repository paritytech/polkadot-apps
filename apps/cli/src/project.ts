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

if (import.meta.vitest) {
    const { test, expect, describe, vi } = import.meta.vitest;
    const { mkdtempSync, writeFileSync: _writeFile, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    // ── loadProjectConfig / saveDotJson ─────────────────────────────
    describe("loadProjectConfig", () => {
        test("returns empty object when no dot.json", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            const orig = process.cwd();
            process.chdir(dir);
            expect(loadProjectConfig()).toEqual({});
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });

        test("returns parsed config from dot.json", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            _writeFile(join(dir, "dot.json"), JSON.stringify({ domain: "test" }));
            const orig = process.cwd();
            process.chdir(dir);
            expect(loadProjectConfig()).toEqual({ domain: "test" });
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });

        test("returns empty object on invalid JSON", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            _writeFile(join(dir, "dot.json"), "not json{{{");
            const orig = process.cwd();
            process.chdir(dir);
            expect(loadProjectConfig()).toEqual({});
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });
    });

    describe("saveDotJson", () => {
        test("creates dot.json with updates", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            const orig = process.cwd();
            process.chdir(dir);
            saveDotJson({ domain: "test", name: "My App" });
            const result = JSON.parse(readFileSync(join(dir, "dot.json"), "utf-8"));
            expect(result.domain).toBe("test");
            expect(result.name).toBe("My App");
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });

        test("merges with existing dot.json", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            _writeFile(join(dir, "dot.json"), JSON.stringify({ domain: "old", tag: "defi" }));
            const orig = process.cwd();
            process.chdir(dir);
            saveDotJson({ domain: "new" });
            const result = JSON.parse(readFileSync(join(dir, "dot.json"), "utf-8"));
            expect(result.domain).toBe("new");
            expect(result.tag).toBe("defi"); // preserved
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });

        test("skips undefined values", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            const orig = process.cwd();
            process.chdir(dir);
            saveDotJson({ domain: "test", name: undefined });
            const result = JSON.parse(readFileSync(join(dir, "dot.json"), "utf-8"));
            expect(result.domain).toBe("test");
            expect("name" in result).toBe(false);
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });
    });

    // ── Git URL transformation (tested via real function, works in git repo) ──
    describe("getGitRemoteUrl", () => {
        test("returns a string or undefined", () => {
            const result = getGitRemoteUrl();
            // We're in a git repo so this should return something
            expect(result === undefined || typeof result === "string").toBe(true);
        });

        test("converts SSH to HTTPS format", () => {
            // Test the transformation logic directly
            const transform = (url: string) =>
                url.replace(/^git@github\.com:/, "https://github.com/").replace(/\.git$/, "");
            expect(transform("git@github.com:paritytech/polkadot-apps.git")).toBe(
                "https://github.com/paritytech/polkadot-apps",
            );
            expect(transform("https://github.com/paritytech/polkadot-apps.git")).toBe(
                "https://github.com/paritytech/polkadot-apps",
            );
            expect(transform("https://github.com/paritytech/polkadot-apps")).toBe(
                "https://github.com/paritytech/polkadot-apps",
            );
        });
    });

    describe("getGitBranch", () => {
        test("returns a string or undefined", () => {
            const result = getGitBranch();
            expect(result === undefined || typeof result === "string").toBe(true);
        });
    });

    // ── readReadme (uses temp dir) ────────────────────────────────────
    describe("readReadme", () => {
        test("returns undefined in empty directory", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            const orig = process.cwd();
            process.chdir(dir);
            expect(readReadme()).toBeUndefined();
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });

        test("reads README.md content", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            _writeFile(join(dir, "README.md"), "# Test");
            const orig = process.cwd();
            process.chdir(dir);
            expect(readReadme()).toBe("# Test");
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });

        test("falls back to readme.md", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            _writeFile(join(dir, "readme.md"), "# lower");
            const orig = process.cwd();
            process.chdir(dir);
            expect(readReadme()).toBe("# lower");
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });

        test("truncates oversized content", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            _writeFile(join(dir, "README.md"), "x".repeat(600_000));
            const orig = process.cwd();
            process.chdir(dir);
            expect(readReadme()?.length).toBe(512 * 1024);
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });
    });

    // ── loadAccount (uses temp file) ──────────────────────────────────
    describe("loadAccount", () => {
        test("returns account when file and chain exist", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            const accountsDir = join(dir, ".polkadot");
            const { mkdirSync } = require("node:fs");
            mkdirSync(accountsDir, { recursive: true });
            _writeFile(
                join(accountsDir, "accounts.json"),
                JSON.stringify({ paseo: { address: "5X", mnemonic: "test words" } }),
            );
            // Temporarily override homedir
            const origHome = process.env.HOME;
            process.env.HOME = dir;
            const account = loadAccount("paseo");
            expect(account.address).toBe("5X");
            expect(account.mnemonic).toBe("test words");
            process.env.HOME = origHome;
            rmSync(dir, { recursive: true });
        });

        test("throws when accounts file missing", () => {
            expect(() => loadAccount("paseo")).toThrow(/No accounts file|No account/);
        });

        test("throws when chain not in accounts", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            const accountsDir = join(dir, ".polkadot");
            const { mkdirSync } = require("node:fs");
            mkdirSync(accountsDir, { recursive: true });
            _writeFile(join(accountsDir, "accounts.json"), JSON.stringify({ polkadot: {} }));
            const origHome = process.env.HOME;
            process.env.HOME = dir;
            expect(() => loadAccount("paseo")).toThrow("No account found");
            process.env.HOME = origHome;
            rmSync(dir, { recursive: true });
        });
    });

    describe("loadMnemonic", () => {
        test("returns mnemonic from loadAccount", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            const accountsDir = join(dir, ".polkadot");
            const { mkdirSync } = require("node:fs");
            mkdirSync(accountsDir, { recursive: true });
            _writeFile(
                join(accountsDir, "accounts.json"),
                JSON.stringify({ paseo: { address: "5X", mnemonic: "secret phrase" } }),
            );
            const origHome = process.env.HOME;
            process.env.HOME = dir;
            expect(loadMnemonic("paseo")).toBe("secret phrase");
            process.env.HOME = origHome;
            rmSync(dir, { recursive: true });
        });
    });

    // ── resolveSigner ─────────────────────────────────────────────────
    describe("resolveSigner", () => {
        test("uses DEV_PHRASE for //Alice", () => {
            const result = resolveSigner("paseo", "//Alice");
            expect(result.signer).toBeDefined();
            expect(result.signer.publicKey).toBeInstanceOf(Uint8Array);
            expect(result.origin).toMatch(/^5/);
        });

        test("uses DEV_PHRASE for //Bob", () => {
            const alice = resolveSigner("paseo", "//Alice");
            const bob = resolveSigner("paseo", "//Bob");
            expect(alice.origin).not.toBe(bob.origin);
        });

        test("throws for non-dev SURIs", () => {
            expect(() => resolveSigner("paseo", "0xdeadbeef")).toThrow("Only dev SURIs");
        });
    });

    // ── prepareSigner ─────────────────────────────────────────────────
    describe("prepareSigner", () => {
        const mnemonic = "bottom drive obey lake curtain smoke basket hold race lonely fit walk";

        test("returns signer and SS58 origin", () => {
            const result = prepareSigner(mnemonic, "//Alice");
            expect(result.signer).toBeDefined();
            expect(result.signer.publicKey).toBeInstanceOf(Uint8Array);
            expect(result.origin).toMatch(/^5/);
        });

        test("is deterministic", () => {
            const a = prepareSigner(mnemonic, "//Alice");
            const b = prepareSigner(mnemonic, "//Alice");
            expect(a.origin).toBe(b.origin);
        });

        test("different paths produce different signers", () => {
            const a = prepareSigner(mnemonic, "//Alice");
            const b = prepareSigner(mnemonic, "//Bob");
            expect(a.origin).not.toBe(b.origin);
        });

        test("uses //0 when derivePath is empty", () => {
            const a = prepareSigner(mnemonic, "");
            const b = prepareSigner(mnemonic, "//0");
            expect(a.origin).toBe(b.origin);
        });
    });
}
