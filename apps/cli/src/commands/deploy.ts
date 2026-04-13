import { Command } from "commander";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { execSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { computeCid, BulletinClient } from "@polkadot-apps/bulletin";
import type { PolkadotSigner } from "polkadot-api";
import { connect } from "../connection.js";
import { TAGS } from "../config.js";
import {
    getGitRemoteUrl,
    getGitBranch,
    resolveSigner,
    loadMnemonic,
    readReadme,
} from "../project.js";
import { spinner, bold, dim, cyan, green, red, yellow } from "../ui.js";

// ---------------------------------------------------------------------------
// Read playground:* fields from package.json
// ---------------------------------------------------------------------------

interface PlaygroundConfig {
    domain?: string;
    name?: string;
    description?: string;
    tag?: string;
    icon?: string;
    branch?: string;
}

function loadPlaygroundConfig(): PlaygroundConfig {
    const pkgPath = resolve(process.cwd(), "package.json");
    try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        return {
            domain: pkg["playground:domain"],
            name: pkg["playground:name"] ?? pkg.name,
            description: pkg["playground:description"] ?? pkg.description,
            tag: pkg["playground:tag"],
            icon: pkg["playground:icon"],
            branch: pkg["playground:branch"],
        };
    } catch {
        return {};
    }
}

// WebSocket polyfill for host-papp SDK
import { WebSocket as _WS } from "ws";
if (!globalThis.WebSocket) {
    const WebSocket = new Proxy(_WS, {
        construct(target, args) {
            const [url, protocols, opts] = args;
            return new target(url, protocols, { followRedirects: true, ...opts });
        },
    });
    Object.assign(globalThis, { WebSocket });
}

function hasContracts(): boolean {
    return (
        existsSync(resolve(process.cwd(), "contracts")) ||
        existsSync(resolve(process.cwd(), "Cargo.toml"))
    );
}

function getBuildCommand(): string | undefined {
    const pkg = resolve(process.cwd(), "package.json");
    try {
        const p = JSON.parse(readFileSync(pkg, "utf-8"));
        if (p["playground:build"]) return p["playground:build"];
        const scripts = p.scripts ?? {};
        if (scripts["build:frontend"]) return "pnpm build:frontend";
        if (scripts.build) return "pnpm build";
    } catch {}

    return undefined;
}

function hasDistDir(): boolean {
    return existsSync(resolve(process.cwd(), "dist"));
}

// ---------------------------------------------------------------------------
// Signer resolution: QR session → --suri → mnemonic file
// ---------------------------------------------------------------------------

/* @integration */
async function getSessionSigner(): Promise<{
    signer: PolkadotSigner;
    origin: string;
} | null> {
    try {
        const { createTerminalAdapter, createSessionSigner } = await import(
            "@polkadot-apps/terminal"
        );

        const adapter = createTerminalAdapter({
            appId: "dot-cli",
            metadataUrl:
                "https://gist.githubusercontent.com/ReinhardHatko/27415c91178d74196d7c1116d39056d5/raw/56e61d719251170828a80f12d34343a8617b9935/metadata.json",
            endpoints: ["wss://paseo-people-next-rpc.polkadot.io"],
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

        // Don't destroy adapter — the session needs the WebSocket alive for signing
        return { signer, origin };
    } catch (err) {
        console.log(
            `  ${dim("QR session not available:")} ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
    }
}

/* @integration */
async function resolveDeploySigner(
    chain: string,
    suri?: string,
): Promise<{ signer: PolkadotSigner; origin: string }> {
    // 1. Explicit --suri flag (dev signing)
    if (suri) {
        return resolveSigner(chain, suri);
    }

    // 2. QR session from mobile wallet
    const session = await getSessionSigner();
    if (session) {
        console.log(`  ${dim("Signing via mobile wallet")}`);
        return session;
    }

    // 3. Mnemonic file fallback
    return resolveSigner(chain);
}

// ---------------------------------------------------------------------------
// Contract name detection & rename prompt
// ---------------------------------------------------------------------------

interface ContractInfo {
    file: string;
    name: string;
}

function detectContractNames(): ContractInfo[] {
    const results: ContractInfo[] = [];
    const cwd = process.cwd();

    const scanDir = (dir: string) => {
        if (!existsSync(dir)) return;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = resolve(dir, entry.name);
            if (entry.isDirectory() && entry.name !== "target") scanDir(full);
            else if (entry.name.endsWith(".rs")) {
                const content = readFileSync(full, "utf-8");
                const match = content.match(/#\[pvm::contract\(cdm\s*=\s*"([^"]+)"\)/);
                if (match) results.push({ file: full, name: match[1] });
            }
        }
    };

    scanDir(resolve(cwd, "contracts"));
    const rootLib = resolve(cwd, "lib.rs");
    if (existsSync(rootLib)) {
        const content = readFileSync(rootLib, "utf-8");
        const match = content.match(/#\[pvm::contract\(cdm\s*=\s*"([^"]+)"\)/);
        if (match) results.push({ file: rootLib, name: match[1] });
    }

    return results;
}

type ContractAction = "deploy" | "rename" | "skip";

/* @integration */
async function promptContractAction(contracts: ContractInfo[]): Promise<ContractAction> {
    const cwd = process.cwd();
    console.log();
    console.log(`  ${bold("Contracts detected:")}`);
    for (const c of contracts) {
        console.log(`    ${cyan(c.name)}  ${dim(relative(cwd, c.file))}`);
    }
    console.log();
    console.log(
        `  ${yellow("These contract names may already be registered by another publisher.")}`,
    );
    console.log();
    console.log(`    ${bold("d")} Deploy as-is  ${dim("(only works if you own these names)")}`);
    console.log(
        `    ${bold("r")} Rename        ${dim("(choose new @org/name for each contract)")}`,
    );
    console.log(`    ${bold("s")} Skip           ${dim("(reuse existing on-chain contracts)")}`);
    console.log();

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`  Choice [d/r/s]: `);
    rl.close();

    switch (answer.trim().toLowerCase()) {
        case "r":
            return "rename";
        case "s":
            return "skip";
        default:
            return "deploy";
    }
}

/* @integration */
async function renameContracts(contracts: ContractInfo[]): Promise<void> {
    const cfg = loadPlaygroundConfig();
    const suggestedOrg = cfg.domain ? `@${cfg.domain.replace(/\.dot$/, "")}` : undefined;

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log();
    if (suggestedOrg) {
        console.log(`  ${dim(`Suggested org from playground:domain: ${bold(suggestedOrg)}`)}`);
    }

    for (const c of contracts) {
        const parts = c.name.split("/");
        const shortName = parts.slice(1).join("/");
        const defaultNew = suggestedOrg ? `${suggestedOrg}/${shortName}` : undefined;
        const hint = defaultNew ? ` [${defaultNew}]` : "";

        const answer = await rl.question(`  New name for ${cyan(c.name)}${dim(hint)}: `);
        const newName = answer.trim() || defaultNew;

        if (newName && newName !== c.name) {
            const content = readFileSync(c.file, "utf-8");
            const updated = content.replace(`cdm = "${c.name}"`, `cdm = "${newName}"`);
            writeFileSync(c.file, updated);
            console.log(`  ${green("✔")} ${dim(c.name)} → ${cyan(newName)}`);
        } else if (!newName) {
            console.log(`  ${dim("  Keeping")} ${c.name}`);
        }
    }

    rl.close();
    console.log();
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

/* @integration */
export const deployCommand = new Command("deploy")
    .description("Deploy contracts, frontend, and optionally publish to playground registry")
    .option("-n, --name <chain>", "Target chain", "paseo")
    .option("--suri <suri>", "Signer secret URI (e.g. //Alice for dev)")
    .option("--skip-contracts", "Skip contract build & deploy")
    .option("--skip-frontend", "Skip frontend build & deploy")
    .option("--playground", "Also publish metadata to the playground registry")
    .option("--bootstrap", "Also deploy the ContractRegistry (contracts only)")
    .option("--domain <name>", "App domain (overrides package.json)")
    .option("--app-name <name>", "Display name (overrides package.json)")
    .option("--description <text>", "Short description (overrides package.json)")
    .option("--repo <url>", "Source repository URL (overrides package.json)")
    .option("--branch <branch>", "Git branch (overrides package.json)")
    .option("--tag <tag>", `Category: ${TAGS.join(", ")}`)
    .option("--icon <path>", "Path to icon image file")
    .option("-y, --yes", "Skip interactive prompts (deploy contracts as-is)")
    .action(async (opts) => {
        const chain = opts.name;
        let failed = false;

        // ── Resolve config from package.json playground:* fields ─────────
        const config = loadPlaygroundConfig();
        const domain = opts.domain ?? config.domain;
        if (!domain) {
            console.error(
                'No domain specified. Use --domain <name> or set "playground:domain" in package.json.',
            );
            process.exit(1);
        }
        const fullDomain = domain.endsWith(".dot") ? domain : `${domain}.dot`;

        // ── Resolve signer: QR session → --suri → mnemonic ──────────────
        const s0 = spinner("Signer", "Resolving...");
        let signer: PolkadotSigner;
        let origin: string;
        try {
            const resolved = await resolveDeploySigner(chain, opts.suri);
            signer = resolved.signer;
            origin = resolved.origin;
            s0.succeed(`Signer ready (${dim(origin.slice(0, 10) + "…")})`);
        } catch (err) {
            s0.fail(err instanceof Error ? err.message : "Failed to resolve signer");
            process.exit(1);
        }

        // ── Step 1: Contracts ─────────────────────────────────────────────
        if (!opts.skipContracts && hasContracts()) {
            let skipContracts = false;

            if (!opts.yes) {
                const contracts = detectContractNames();
                const expectedOrg = `@${domain.replace(/\.dot$/, "")}`;
                const allMatch =
                    contracts.length > 0 &&
                    contracts.every((c) => c.name.startsWith(expectedOrg + "/"));

                if (contracts.length > 0 && !allMatch) {
                    const action = await promptContractAction(contracts);
                    if (action === "skip") {
                        skipContracts = true;
                        console.log(`  ${dim("Skipping contract deployment.")}`);
                    } else if (action === "rename") {
                        await renameContracts(contracts);
                    }
                }
            }

            if (!skipContracts) {
                const s = spinner("Contracts", "Building & deploying...");
                try {
                    let args = `deploy -n ${chain}`;
                    if (opts.bootstrap) args += " --bootstrap";
                    if (opts.suri) args += ` --suri "${opts.suri}"`;
                    execSync(`cdm ${args}`, { stdio: "inherit" });
                    s.succeed("Contracts deployed");
                } catch {
                    s.fail("Contract deployment failed");
                    failed = true;
                }
            }
        } else if (!opts.skipContracts) {
            console.log(`  ${dim("No contracts detected")}`);
        }

        // ── Step 2: Playground registry publish (--playground only) ───────
        // Runs before frontend deploy so QR session is still fresh.
        if (opts.playground) {
            let conn;
            try {
                const gitRemote = getGitRemoteUrl();

                const appName = opts.appName ?? config.name;
                const description = opts.description ?? config.description;
                const repository = opts.repo ?? gitRemote;
                const branch = opts.branch ?? config.branch ?? getGitBranch();
                const tag = opts.tag ?? config.tag;
                const iconPath = opts.icon ?? config.icon;

                if (tag && !(TAGS as readonly string[]).includes(tag)) {
                    throw new Error(`Invalid tag "${tag}". Must be one of: ${TAGS.join(", ")}`);
                }

                let iconBytes: Uint8Array | undefined;
                let iconCid: string | undefined;
                if (iconPath) {
                    iconBytes = new Uint8Array(readFileSync(resolve(process.cwd(), iconPath)));
                    iconCid = computeCid(iconBytes);
                }

                const readme = readReadme();
                const metadata: Record<string, unknown> = {};
                if (appName) metadata.name = appName;
                if (description) metadata.description = description;
                if (repository) metadata.repository = repository;
                if (branch) metadata.branch = branch;
                if (tag) metadata.tag = tag;
                if (iconCid) metadata.icon_cid = iconCid;
                if (readme) metadata.readme = readme;

                if (Object.keys(metadata).length === 0) {
                    throw new Error(
                        "No metadata. Add playground:* fields to package.json or pass --app-name, --description, etc.",
                    );
                }

                const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
                const metadataCid = computeCid(metadataBytes);

                console.log(`  ${dim("Connecting to registry...")}`);
                conn = await connect(chain);

                // Signing must be sequential (QR session handles one at a time),
                // but transactions confirm in parallel after signing.
                // A mutex ensures signing requests don't overlap.
                let signingQueue: Promise<any> = Promise.resolve();
                const queuedSigner: typeof signer = {
                    publicKey: signer.publicKey,
                    signTx(...args: Parameters<typeof signer.signTx>) {
                        const prev = signingQueue;
                        const result = prev.then(() => signer.signTx(...args));
                        signingQueue = result.catch(() => {});
                        return result;
                    },
                    signBytes(...args: Parameters<typeof signer.signBytes>) {
                        const prev = signingQueue;
                        const result = prev.then(() => signer.signBytes(...args));
                        signingQueue = result.catch(() => {});
                        return result;
                    },
                };

                const s1 = spinner("Upload metadata", "");
                const s2 = spinner("Playground register", "");

                const bulletinPromise = (async () => {
                    const client = await BulletinClient.create(chain);
                    const items: { data: Uint8Array; label: string }[] = [];
                    if (iconBytes) items.push({ data: iconBytes, label: "icon" });
                    items.push({ data: metadataBytes, label: "metadata" });
                    await client.batchUpload(items, queuedSigner);
                    if (typeof (client as any).destroy === "function") (client as any).destroy();
                    s1.succeed();
                })();

                const registryPromise = (async () => {
                    const result = await conn!.registry.publish.tx(fullDomain, metadataCid, {
                        signer: queuedSigner,
                        origin,
                    });
                    if (!result.ok) {
                        const errDetail = result.dispatchError
                            ? JSON.stringify(result.dispatchError, (_: string, v: unknown) =>
                                  typeof v === "bigint" ? v.toString() : v,
                              )
                            : "Transaction failed";
                        throw new Error(errDetail);
                    }
                    s2.succeed();
                })();

                const results = await Promise.allSettled([bulletinPromise, registryPromise]);
                const failures = results.filter(
                    (r): r is PromiseRejectedResult => r.status === "rejected",
                );
                if (failures.length > 0) {
                    if (!s1.done) s1.fail();
                    if (!s2.done) s2.fail();
                    throw failures[0].reason;
                }
            } catch (err) {
                console.log(
                    `\n  ${red("✖")} ${bold("Registry publish failed:")} ${err instanceof Error ? err.message : String(err)}`,
                );
                failed = true;
            } finally {
                conn?.destroy();
            }
        }

        // ── Step 3: Frontend build + deploy to Bulletin ───────────────────
        const buildCmd = getBuildCommand();
        if (opts.skipFrontend) {
            console.log(`  ${dim("Skipping frontend (--skip-frontend)")}`);
        } else if (!buildCmd) {
            console.log(`  ${dim("No frontend detected (no build script)")}`);
        } else {
            const s = spinner("Frontend", "Building...");
            try {
                execSync(buildCmd, { stdio: "inherit" });

                if (!hasDistDir()) {
                    throw new Error("Build did not produce a dist/ directory");
                }

                s.update(`Deploying ${fullDomain} to Bulletin...`);
                const { deploy: bulletinDeploy } = await import("bulletin-deploy");

                let mnemonic: string | undefined;
                try {
                    mnemonic = opts.suri ? undefined : loadMnemonic(chain);
                } catch {}

                const deployOpts: any = {};
                if (opts.suri) {
                    deployOpts.mnemonic = mnemonic;
                } else if (mnemonic) {
                    deployOpts.mnemonic = mnemonic;
                } else {
                    // QR session signer for DotNS (storage uses pool)
                    deployOpts.signer = signer;
                    deployOpts.signerAddress = origin;
                }

                const result = await bulletinDeploy(
                    "./dist",
                    fullDomain.replace(".dot", ""),
                    deployOpts,
                );
                s.succeed(`Frontend deployed to ${bold(result.fullDomain)} (${dim(result.cid)})`);
            } catch (err) {
                s.fail(err instanceof Error ? err.message : "Frontend deployment failed");
                failed = true;
            }
        }

        // ── Done ──────────────────────────────────────────────────────────
        console.log();
        if (failed) {
            console.log(`${red("Some steps failed.")} Check the output above.`);
            process.exit(1);
        } else {
            console.log(`${green("✔")} Deploy complete.`);
            process.exit(0);
        }
    });

if (import.meta.vitest) {
    const { test, expect, describe } = import.meta.vitest;
    const { mkdtempSync, writeFileSync: _writeFile, mkdirSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    describe("loadPlaygroundConfig", () => {
        test("reads playground:* fields from package.json", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            _writeFile(
                join(dir, "package.json"),
                JSON.stringify({
                    name: "my-app",
                    "playground:domain": "test",
                    "playground:tag": "defi",
                    "playground:description": "A test app",
                }),
            );
            const orig = process.cwd();
            process.chdir(dir);
            const config = loadPlaygroundConfig();
            expect(config.domain).toBe("test");
            expect(config.tag).toBe("defi");
            expect(config.description).toBe("A test app");
            expect(config.name).toBe("my-app"); // falls back to pkg.name
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });

        test("returns empty when no package.json", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            const orig = process.cwd();
            process.chdir(dir);
            expect(loadPlaygroundConfig()).toEqual({});
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });

        test("prefers playground:name over name", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            _writeFile(
                join(dir, "package.json"),
                JSON.stringify({ name: "pkg-name", "playground:name": "Display Name" }),
            );
            const orig = process.cwd();
            process.chdir(dir);
            expect(loadPlaygroundConfig().name).toBe("Display Name");
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });
    });

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
    });

    describe("hasDistDir", () => {
        test("returns false when no dist/", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            const orig = process.cwd();
            process.chdir(dir);
            expect(hasDistDir()).toBe(false);
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });

        test("returns true when dist/ exists", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            mkdirSync(join(dir, "dist"));
            const orig = process.cwd();
            process.chdir(dir);
            expect(hasDistDir()).toBe(true);
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });
    });

    describe("detectContractNames", () => {
        test("returns empty in directory without contracts", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            const orig = process.cwd();
            process.chdir(dir);
            expect(detectContractNames()).toEqual([]);
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });

        test("detects #[pvm::contract(cdm = ...)] in Rust files", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            mkdirSync(join(dir, "contracts"));
            _writeFile(
                join(dir, "contracts", "lib.rs"),
                '#[pvm::contract(cdm = "@myorg/counter")]\npub fn main() {}',
            );
            const orig = process.cwd();
            process.chdir(dir);
            const names = detectContractNames();
            expect(names.length).toBe(1);
            expect(names[0].name).toBe("@myorg/counter");
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });
    });
}
