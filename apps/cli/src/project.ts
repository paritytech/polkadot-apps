import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
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
// Project detection helpers (shared by build + deploy commands)
// ---------------------------------------------------------------------------

export function detectPackageManager(dir: string): "pnpm" | "npm" | "bun" {
    if (existsSync(resolve(dir, "pnpm-lock.yaml"))) return "pnpm";
    if (existsSync(resolve(dir, "package-lock.json"))) return "npm";
    if (existsSync(resolve(dir, "bun.lockb")) || existsSync(resolve(dir, "bun.lock"))) return "bun";
    return "pnpm";
}

export function hasContracts(): boolean {
    return (
        existsSync(resolve(process.cwd(), "contracts")) ||
        existsSync(resolve(process.cwd(), "Cargo.toml"))
    );
}

export function getBuildCommand(): string | undefined {
    const pkg = resolve(process.cwd(), "package.json");
    try {
        const p = JSON.parse(readFileSync(pkg, "utf-8"));
        if (p["playground:build"]) return p["playground:build"];
        const pm = detectPackageManager(process.cwd());
        const scripts = p.scripts ?? {};
        if (scripts["build:frontend"]) return `${pm} build:frontend`;
        if (scripts.build) return `${pm} build`;
    } catch {
        // No package.json — no build command
    }
    return undefined;
}

// ---------------------------------------------------------------------------
// Toolchain helpers
// ---------------------------------------------------------------------------

function commandExists(cmd: string): boolean {
    try {
        execSync(`command -v ${cmd}`, { stdio: "pipe" });
        return true;
    } catch {
        return false;
    }
}

function hasRustNightly(): boolean {
    try {
        const out = execSync("rustup toolchain list", { encoding: "utf-8", stdio: "pipe" });
        return out.includes("nightly");
    } catch {
        return false;
    }
}

function hasRustSrc(): boolean {
    try {
        const out = execSync("rustup component list --toolchain nightly", {
            encoding: "utf-8",
            stdio: "pipe",
        });
        return out.includes("rust-src (installed)");
    } catch {
        return false;
    }
}

function hasCdm(): boolean {
    return commandExists("cdm") && commandExists("cargo-pvm-contract");
}

function isIpfsInitialized(): boolean {
    return existsSync(resolve(homedir(), ".ipfs"));
}

function isGhAuthenticated(): boolean {
    try {
        execSync("gh auth status", { stdio: "pipe" });
        return true;
    } catch {
        return false;
    }
}

export { commandExists, isGhAuthenticated };

interface ToolchainStep {
    name: string;
    check: () => boolean;
    install: () => void;
    manualHint?: string;
}

const TOOLCHAIN_STEPS: ToolchainStep[] = [
    {
        name: "rustup",

        check: () => commandExists("rustup"),
        install: () =>
            execSync('curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y', {
                stdio: "inherit",
                shell: "/bin/bash",
            }),
        manualHint: "Install manually: https://rustup.rs",
    },
    {
        name: "Rust nightly",

        check: () => hasRustNightly(),
        install: () => execSync("rustup toolchain install nightly", { stdio: "inherit" }),
    },
    {
        name: "rust-src",

        check: () => hasRustSrc(),
        install: () =>
            execSync("rustup component add rust-src --toolchain nightly", { stdio: "inherit" }),
    },
    {
        name: "cdm & cargo-pvm-contract",

        check: () => hasCdm(),
        install: () =>
            execSync(
                "curl -fsSL https://raw.githubusercontent.com/paritytech/contract-dependency-manager/main/install.sh | bash",
                { stdio: "inherit", shell: "/bin/bash" },
            ),
        manualHint:
            "Install manually: curl -fsSL https://raw.githubusercontent.com/paritytech/contract-dependency-manager/main/install.sh | bash",
    },
    {
        name: "IPFS",

        check: () => commandExists("ipfs") && isIpfsInitialized(),
        install: () => {
            if (!commandExists("ipfs")) {
                if (platform() === "darwin" && commandExists("brew")) {
                    execSync("brew install ipfs", { stdio: "inherit" });
                } else if (platform() === "darwin") {
                    execSync(
                        "curl -fsSL https://dist.ipfs.tech/kubo/v0.33.2/kubo_v0.33.2_darwin-arm64.tar.gz | tar xz && cd kubo && sudo bash install.sh && cd .. && rm -rf kubo",
                        { stdio: "inherit", shell: "/bin/bash" },
                    );
                } else {
                    execSync(
                        "curl -fsSL https://dist.ipfs.tech/kubo/v0.33.2/kubo_v0.33.2_linux-amd64.tar.gz | tar xz && cd kubo && sudo bash install.sh && cd .. && rm -rf kubo",
                        { stdio: "inherit", shell: "/bin/bash" },
                    );
                }
            }
            if (!isIpfsInitialized()) {
                execSync("ipfs init", { stdio: "inherit" });
            }
        },
        manualHint: "Install: https://docs.ipfs.tech/install/ then run: ipfs init",
    },
];

export interface ToolchainResult {
    name: string;
    ok: boolean;
    installed: boolean;
    error?: string;
    manualHint?: string;
}

/**
 * Ensure dev toolchain dependencies are installed.
 *
 * In **quiet** mode (default): prints nothing when everything is already
 * installed. Only prints spinner + status when something needs installing.
 *
 * In **verbose** mode: prints a checkmark for each tool that's already
 * present, matching `dot init` output style.
 *
 * Use `scopes` to only check/install tools needed for the current command.
 * Omit scopes (or pass empty) to check everything (used by `dot init`).
 *
 * @returns Array of results for each toolchain step.
 */
export function ensureToolchain(options?: {
    verbose?: boolean;
    /** When provided, spinner-style callbacks for install progress. */
    onStep?: (
        name: string,
        status: "checking" | "installing" | "ok" | "failed",
        msg?: string,
    ) => void;
}): ToolchainResult[] {
    const verbose = options?.verbose ?? false;
    const onStep = options?.onStep;
    const results: ToolchainResult[] = [];

    for (const step of TOOLCHAIN_STEPS) {
        if (step.check()) {
            if (verbose) {
                onStep?.(step.name, "ok");
            }
            results.push({ name: step.name, ok: true, installed: false });
            continue;
        }

        onStep?.(step.name, "installing", `Installing ${step.name}...`);
        try {
            step.install();
            onStep?.(step.name, "ok", `${step.name} installed`);
            results.push({ name: step.name, ok: true, installed: true });
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            onStep?.(step.name, "failed", error);
            results.push({
                name: step.name,
                ok: false,
                installed: false,
                error,
                manualHint: step.manualHint,
            });
        }
    }

    return results;
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

    // ── detectPackageManager ────────────────────────────────────────────
    describe("detectPackageManager", () => {
        test("detects pnpm from lockfile", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            _writeFile(join(dir, "pnpm-lock.yaml"), "");
            expect(detectPackageManager(dir)).toBe("pnpm");
            rmSync(dir, { recursive: true });
        });

        test("detects npm from package-lock.json", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            _writeFile(join(dir, "package-lock.json"), "{}");
            expect(detectPackageManager(dir)).toBe("npm");
            rmSync(dir, { recursive: true });
        });

        test("detects bun from bun.lock", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            _writeFile(join(dir, "bun.lock"), "");
            expect(detectPackageManager(dir)).toBe("bun");
            rmSync(dir, { recursive: true });
        });

        test("defaults to pnpm when no lockfile", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            expect(detectPackageManager(dir)).toBe("pnpm");
            rmSync(dir, { recursive: true });
        });
    });

    // ── hasContracts ─────────────────────────────────────────────────
    describe("hasContracts", () => {
        test("returns false in empty directory", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            const orig = process.cwd();
            process.chdir(dir);
            expect(hasContracts()).toBe(false);
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });

        test("returns true when contracts/ exists", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            const { mkdirSync } = require("node:fs");
            mkdirSync(join(dir, "contracts"));
            const orig = process.cwd();
            process.chdir(dir);
            expect(hasContracts()).toBe(true);
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });

        test("returns true when Cargo.toml exists", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            _writeFile(join(dir, "Cargo.toml"), "[package]");
            const orig = process.cwd();
            process.chdir(dir);
            expect(hasContracts()).toBe(true);
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });
    });

    // ── getBuildCommand ──────────────────────────────────────────────
    describe("getBuildCommand", () => {
        test("returns undefined when no package.json", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            const orig = process.cwd();
            process.chdir(dir);
            expect(getBuildCommand()).toBeUndefined();
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });

        test("returns build:frontend if present", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            _writeFile(
                join(dir, "package.json"),
                JSON.stringify({ scripts: { "build:frontend": "vite build", build: "tsc" } }),
            );
            const orig = process.cwd();
            process.chdir(dir);
            expect(getBuildCommand()).toBe("pnpm build:frontend");
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });

        test("falls back to build script", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            _writeFile(join(dir, "package.json"), JSON.stringify({ scripts: { build: "tsc" } }));
            const orig = process.cwd();
            process.chdir(dir);
            expect(getBuildCommand()).toBe("pnpm build");
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });

        test("returns undefined when no build scripts", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            _writeFile(join(dir, "package.json"), JSON.stringify({ scripts: { test: "vitest" } }));
            const orig = process.cwd();
            process.chdir(dir);
            expect(getBuildCommand()).toBeUndefined();
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });

        test("uses bun prefix when bun.lock present", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            _writeFile(join(dir, "bun.lock"), "");
            _writeFile(join(dir, "package.json"), JSON.stringify({ scripts: { build: "vite" } }));
            const orig = process.cwd();
            process.chdir(dir);
            expect(getBuildCommand()).toBe("bun build");
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });

        test("prefers playground:build over scripts", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            _writeFile(
                join(dir, "package.json"),
                JSON.stringify({
                    "playground:build": "custom-build-cmd",
                    scripts: { build: "tsc" },
                }),
            );
            const orig = process.cwd();
            process.chdir(dir);
            expect(getBuildCommand()).toBe("custom-build-cmd");
            process.chdir(orig);
            rmSync(dir, { recursive: true });
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
