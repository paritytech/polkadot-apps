import { Command } from "commander";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { execSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { computeCid, BulletinClient } from "@polkadot-apps/bulletin";
import { connect } from "../connection.js";
import { TAGS } from "../config.js";
import {
    loadProjectConfig,
    saveDotJson,
    getGitRemoteUrl,
    getGitBranch,
    resolveSigner,
    loadMnemonic,
    readReadme,
} from "../project.js";
import { spinner, bold, dim, cyan, green, red, yellow } from "../ui.js";

function hasContracts(): boolean {
    return (
        existsSync(resolve(process.cwd(), "contracts")) ||
        existsSync(resolve(process.cwd(), "Cargo.toml"))
    );
}

function getBuildCommand(): string | undefined {
    const project = loadProjectConfig();
    if (project.build) return project.build;

    const pkg = resolve(process.cwd(), "package.json");
    try {
        const scripts = JSON.parse(readFileSync(pkg, "utf-8")).scripts ?? {};
        if (scripts["build:frontend"]) return "pnpm build:frontend";
        if (scripts.build) return "pnpm build";
    } catch {}

    return undefined;
}

function hasDistDir(): boolean {
    return existsSync(resolve(process.cwd(), "dist"));
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

async function renameContracts(contracts: ContractInfo[]): Promise<void> {
    const project = loadProjectConfig();
    const suggestedOrg = project.domain ? `@${project.domain.replace(/\.dot$/, "")}` : undefined;

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log();
    if (suggestedOrg) {
        console.log(`  ${dim(`Suggested org from dot.json domain: ${bold(suggestedOrg)}`)}`);
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

export const deployCommand = new Command("deploy")
    .description("Deploy contracts, frontend, and optionally publish to playground registry")
    .option("-n, --name <chain>", "Target chain", "paseo")
    .option("--suri <suri>", "Signer secret URI (e.g. //Alice for dev)")
    .option("--skip-contracts", "Skip contract build & deploy")
    .option("--skip-frontend", "Skip frontend build & deploy")
    .option("--playground", "Also publish metadata to the playground registry")
    .option("--bootstrap", "Also deploy the ContractRegistry (contracts only)")
    .option("--domain <name>", "App domain (overrides dot.json)")
    .option("--app-name <name>", "Display name (overrides dot.json)")
    .option("--description <text>", "Short description (overrides dot.json)")
    .option("--repo <url>", "Source repository URL (overrides dot.json)")
    .option("--branch <branch>", "Git branch (overrides dot.json)")
    .option("--tag <tag>", `Category: ${TAGS.join(", ")}`)
    .option("--icon <path>", "Path to icon image file")
    .option("-y, --yes", "Skip interactive prompts (deploy contracts as-is)")
    .action(async (opts) => {
        const chain = opts.name;
        let failed = false;

        // ── Resolve domain + persist CLI overrides to dot.json ────────────
        const project = loadProjectConfig();
        const domain = opts.domain ?? project.domain;
        if (!domain) {
            console.error('No domain specified. Use --domain <name> or run "dot init" first.');
            process.exit(1);
        }
        const fullDomain = domain.endsWith(".dot") ? domain : `${domain}.dot`;

        // Save any CLI overrides to dot.json so they persist
        const updates: Record<string, string> = {};
        if (opts.domain && opts.domain !== project.domain)
            updates.domain = opts.domain.replace(/\.dot$/, "");
        if (opts.appName && opts.appName !== project.name) updates.name = opts.appName;
        if (opts.description && opts.description !== project.description)
            updates.description = opts.description;
        if (opts.repo && opts.repo !== project.repository) updates.repository = opts.repo;
        if (opts.branch && opts.branch !== project.branch) updates.branch = opts.branch;
        if (opts.tag && opts.tag !== project.tag) updates.tag = opts.tag;
        if (opts.icon && opts.icon !== project.icon) updates.icon = opts.icon;
        if (Object.keys(updates).length > 0) {
            saveDotJson(updates);
            console.log(`  ${dim("Updated dot.json with CLI overrides")}`);
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

        // ── Step 2: Frontend ──────────────────────────────────────────────
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
                const mnemonic = opts.suri ? undefined : loadMnemonic(chain);
                const env: Record<string, string> = {
                    ...(process.env as Record<string, string>),
                };
                if (mnemonic) env.MNEMONIC = mnemonic;

                execSync(`npx bulletin-deploy ./dist ${fullDomain}`, {
                    stdio: ["inherit", "inherit", "pipe"],
                    env,
                });

                s.succeed(`Frontend deployed to ${bold(fullDomain)}`);
            } catch (err) {
                s.fail(err instanceof Error ? err.message : "Frontend deployment failed");
                failed = true;
            }
        }

        // ── Step 3: Playground registry publish (--playground only) ───────
        if (opts.playground) {
            const s = spinner("Registry", "Publishing metadata...");
            let conn;
            try {
                const projConfig = loadProjectConfig();
                const gitRemote = getGitRemoteUrl();

                const appName = opts.appName ?? projConfig.name;
                const description = opts.description ?? projConfig.description;
                const repository = opts.repo ?? projConfig.repository ?? gitRemote;
                const branch = opts.branch ?? projConfig.branch ?? getGitBranch();
                const tag = opts.tag ?? projConfig.tag;
                const iconPath = opts.icon ?? projConfig.icon;

                if (tag && !(TAGS as readonly string[]).includes(tag)) {
                    throw new Error(`Invalid tag "${tag}". Must be one of: ${TAGS.join(", ")}`);
                }

                s.update("Preparing signer...");
                const { signer, origin } = resolveSigner(chain, opts.suri);

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
                        "No metadata. Create a dot.json or pass --app-name, --description, etc.",
                    );
                }

                const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
                const metadataCid = computeCid(metadataBytes);

                s.update("Connecting...");
                conn = await connect(chain);

                s.update("Uploading metadata & publishing...");

                const bulletinPromise = (async () => {
                    const client = await BulletinClient.create(chain);
                    const items: { data: Uint8Array; label: string }[] = [];
                    if (iconBytes) items.push({ data: iconBytes, label: "icon" });
                    items.push({ data: metadataBytes, label: "metadata" });
                    await client.batchUpload(items);
                    if (typeof (client as any).destroy === "function") (client as any).destroy();
                })();

                const registryPromise = (async () => {
                    const result = await conn!.registry.publish.tx(fullDomain, metadataCid, {
                        signer,
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
                })();

                const results = await Promise.allSettled([bulletinPromise, registryPromise]);
                const failures = results.filter(
                    (r): r is PromiseRejectedResult => r.status === "rejected",
                );
                if (failures.length > 0) throw failures[0].reason;

                s.succeed(`Published ${bold(fullDomain)} to registry`);
                console.log(`  ${dim("Metadata CID")}  ${cyan(metadataCid)}`);
            } catch (err) {
                s.fail(err instanceof Error ? err.message : "Registry publish failed");
                failed = true;
            } finally {
                conn?.destroy();
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
