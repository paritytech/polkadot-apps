import { Command } from "commander";
import { execSync, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve, basename } from "node:path";
import { createInterface } from "node:readline";
import { connect, fetchIpfs, unwrapOption } from "../connection.js";
import { type AppMetadata } from "../config.js";
import { detectPackageManager, ensureToolchain } from "../project.js";
import { spinner, printTable, truncate, bold, green, dim, cyan, yellow, red } from "../ui.js";

/* @integration */
function ask(prompt: string, fallback?: string): Promise<string> {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const suffix = fallback ? ` ${dim(`(${fallback})`)}` : "";
    return new Promise((res) => {
        rl.question(`  ${prompt}${suffix}: `, (answer) => {
            rl.close();
            res(answer.trim() || fallback || "");
        });
    });
}

function slugify(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function randomSuffix(): string {
    return randomBytes(3).toString("hex");
}

function stripPostinstall(dir: string) {
    const pkgPath = resolve(dir, "package.json");
    if (!existsSync(pkgPath)) return;
    try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.scripts?.postinstall) {
            delete pkg.scripts.postinstall;
            writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
        }
    } catch {
        // Malformed package.json — leave as-is
    }
}

// ---------------------------------------------------------------------------
// Interactive app picker (used when no domain arg is provided)
// ---------------------------------------------------------------------------

/* @integration */
async function pickApp(
    chainName: string,
): Promise<{ domain: string; metadata?: AppMetadata } | null> {
    const s = spinner("Browse", "Connecting to registry...");
    let conn;
    try {
        conn = await connect(chainName);
        s.update("Loading apps...");

        const countRes = await conn.registry.getAppCount.query();
        const total = countRes.success ? Number(countRes.value) : 0;

        if (total === 0) {
            s.succeed("No apps in the registry yet.");
            return null;
        }

        const apps: { domain: string; metadata?: AppMetadata }[] = [];
        const gateway = conn.ipfsGateway;
        const BATCH = 10;
        const LIMIT = 30;

        for (let start = total - 1; start >= 0 && apps.length < LIMIT; start -= BATCH) {
            const batchEnd = Math.max(start - BATCH + 1, 0);
            const indices = [];
            for (let i = start; i >= batchEnd; i--) indices.push(i);

            const domains = await Promise.all(
                indices.map(async (idx) => {
                    const res = await conn!.registry.getDomainAt.query(idx);
                    if (!res.success) return null;
                    const domain = unwrapOption<string>(res.value);
                    return domain ?? null;
                }),
            );

            for (const domain of domains) {
                if (domain && apps.length < LIMIT) apps.push({ domain });
            }
        }

        // Fetch metadata
        s.update(`Loading metadata for ${apps.length} apps...`);
        await Promise.allSettled(
            apps.map(async (m) => {
                try {
                    const res = await conn!.registry.getMetadataUri.query(m.domain);
                    const cid = unwrapOption<string>(res.success ? res.value : undefined);
                    if (cid) m.metadata = await fetchIpfs<AppMetadata>(cid, gateway);
                } catch {}
            }),
        );

        s.succeed(`${apps.length} apps available`);
        console.log();

        // Display table
        const rows = apps.map((m, i) => [
            dim(`${i + 1}`),
            bold(m.domain),
            m.metadata?.name ?? dim("—"),
            truncate(m.metadata?.description ?? "", 40),
        ]);
        printTable(["#", "Domain", "Name", "Description"], rows);
        console.log();

        // Pick
        const choice = await ask("Select an app (number or domain)");
        const num = parseInt(choice, 10);
        if (num >= 1 && num <= apps.length) return apps[num - 1];
        const byDomain = apps.find((a) => a.domain === choice || a.domain === `${choice}.dot`);
        if (byDomain) return byDomain;

        console.log(`  ${dim("Invalid selection.")}`);
        return null;
    } catch (err) {
        s.fail(err instanceof Error ? err.message : String(err));
        return null;
    } finally {
        conn?.destroy();
    }
}

// ---------------------------------------------------------------------------
// Clone & setup (shared between interactive and direct modes)
// ---------------------------------------------------------------------------

/* @integration */
async function cloneAndSetup(
    domain: string,
    metadata: AppMetadata,
    targetDir: string,
    newDomain: string,
    newName: string,
    opts: { install: boolean },
) {
    const branchLabel = metadata.branch ? ` (${metadata.branch})` : "";
    const s = spinner("Clone", `${metadata.repository}${branchLabel}...`);
    const gitArgs = ["clone"];
    if (metadata.branch) gitArgs.push("--branch", metadata.branch);
    gitArgs.push(metadata.repository!, targetDir);
    execFileSync("git", gitArgs, { stdio: "pipe" });

    rmSync(`${targetDir}/.git`, { recursive: true, force: true });
    execSync(`git init`, { cwd: targetDir, stdio: "pipe" });
    stripPostinstall(targetDir);

    s.update("Setting up dot.json...");
    const dotJsonPath = resolve(targetDir, "dot.json");
    let dotJson: Record<string, unknown> = {};
    if (existsSync(dotJsonPath)) {
        try {
            dotJson = JSON.parse(readFileSync(dotJsonPath, "utf-8"));
        } catch {}
    }
    dotJson.domain = newDomain;
    dotJson.name = newName;
    if (!dotJson.description && metadata.description) dotJson.description = metadata.description;
    if (!dotJson.tag && metadata.tag) dotJson.tag = metadata.tag;
    writeFileSync(dotJsonPath, JSON.stringify(dotJson, null, 2) + "\n");

    s.succeed(`Remixed → ${bold(targetDir)}`);

    if (opts.install && existsSync(resolve(targetDir, "package.json"))) {
        const pm = detectPackageManager(targetDir);
        const installSpinner = spinner("Install", `Running ${pm} install...`);
        try {
            execSync(`${pm} install`, { cwd: targetDir, stdio: "pipe" });
            installSpinner.succeed("Dependencies installed");
        } catch {
            installSpinner.fail(`${pm} install failed — run it manually`);
        }
    }
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

/* @integration */
export const remixCommand = new Command("remix")
    .description("Fork an app to customize")
    .argument("[domain]", "App domain to remix (e.g. my-app)")
    .option("-n, --name <chain>", "Chain to connect to", "paseo")
    .option("--quest <id>", "Run a specific quest (non-interactive)")
    .option("--ipfs-gateway-url <url>", "Override IPFS gateway URL")
    .option("--no-install", "Skip dependency installation")
    .action(async (rawDomain: string | undefined, opts) => {
        // Ensure toolchain (quiet — only prints when installing)
        {
            let activeSpinner: ReturnType<typeof spinner> | null = null;
            const results = ensureToolchain({
                onStep: (name, status, msg) => {
                    if (status === "installing") {
                        activeSpinner = spinner(name, msg ?? `Installing ${name}...`);
                    } else if (status === "ok" && activeSpinner) {
                        activeSpinner.succeed(msg ?? name);
                        activeSpinner = null;
                    } else if (status === "failed") {
                        activeSpinner?.fail(msg ?? `Failed to install ${name}`);
                        activeSpinner = null;
                    }
                },
            });
            const failures = results.filter((r) => !r.ok);
            if (failures.length > 0) {
                for (const f of failures) {
                    console.log(`  ${red("✖")} ${f.name}: ${f.error}`);
                    if (f.manualHint) console.log(`    ${dim(f.manualHint)}`);
                }
                process.exit(1);
            }
        }

        let domain: string;
        let metadata: AppMetadata | undefined;

        // ── Resolve app (interactive or direct) ──────────────────────
        if (!rawDomain) {
            // Interactive mode: browse and pick
            const picked = await pickApp(opts.name);
            if (!picked) {
                process.exit(1);
            }
            domain = picked.domain;
            metadata = picked.metadata;
        } else {
            domain = rawDomain.endsWith(".dot") ? rawDomain : `${rawDomain}.dot`;

            // Fetch metadata for the specified domain
            const s = spinner("Remix", "Connecting...");
            let conn;
            try {
                conn = await connect(opts.name);
                const gateway = opts.ipfsGatewayUrl ?? conn.ipfsGateway;

                s.update(`Looking up ${domain}...`);
                const metaRes = await conn.registry.getMetadataUri.query(domain);
                const cid = unwrapOption<string>(metaRes.success ? metaRes.value : undefined);

                if (!cid) {
                    s.fail(`App "${domain}" not found or has no metadata.`);
                    process.exit(1);
                }

                s.update("Fetching metadata...");
                metadata = await fetchIpfs<AppMetadata>(cid, gateway);
                s.succeed(`Found ${bold(domain)}`);
            } catch (err) {
                s.fail(err instanceof Error ? err.message : String(err));
                process.exit(1);
            } finally {
                conn?.destroy();
            }
        }

        if (!metadata?.repository) {
            console.error(`  App "${domain}" has no repository URL set. Cannot remix.`);
            process.exit(1);
        }

        // ── Quest handling (stub) ────────────────────────────────────
        if (opts.quest) {
            console.log(`  ${yellow("!")} Quest support coming soon.`);
            console.log(`    ${dim(`Requested quest: ${opts.quest}`)}`);
        }

        // ── Clone the app ────────────────────────────────────────────
        const defaultName = metadata.name ?? domain.replace(/\.dot$/, "");
        const newName = await ask("Name for your remix", defaultName);
        const newDomain = slugify(newName) + "-" + randomSuffix();
        console.log(`  ${dim("→ domain:")} ${bold(newDomain)}`);

        if (existsSync(newDomain)) {
            console.error(`  Directory "${newDomain}" already exists.`);
            process.exit(1);
        }

        await cloneAndSetup(domain, metadata, newDomain, newDomain, newName, {
            install: opts.install !== false,
        });

        // ── Quest picker stub (after clone) ──────────────────────────
        if (!opts.quest) {
            console.log();
            console.log(`  ${yellow("!")} ${bold("Quests")} — coming soon`);
            console.log(
                `    ${dim("Interactive quest picker will be available in a future release")}`,
            );
        }

        console.log();
        console.log(`  ${green("Next steps:")}`);
        console.log(`  ${dim("1.")} cd ${newDomain}`);
        console.log(`  ${dim("2.")} claude`);
        console.log(`  ${dim("3.")} dot deploy`);
        console.log();
        process.exit(0);
    });

if (import.meta.vitest) {
    const { test, expect, describe } = import.meta.vitest;
    const {
        mkdtempSync,
        writeFileSync: _writeFile,
        readFileSync: _readFile,
        rmSync,
    } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    describe("slugify", () => {
        test("lowercases and replaces spaces", () => {
            expect(slugify("Hello World")).toBe("hello-world");
        });
        test("removes special characters", () => {
            expect(slugify("my_app@v2!")).toBe("my-app-v2");
        });
        test("trims leading/trailing hyphens", () => {
            expect(slugify("--test--")).toBe("test");
        });
        test("collapses multiple separators", () => {
            expect(slugify("a   b...c")).toBe("a-b-c");
        });
        test("handles empty string", () => {
            expect(slugify("")).toBe("");
        });
    });

    describe("stripPostinstall", () => {
        test("removes postinstall from package.json", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            _writeFile(
                join(dir, "package.json"),
                JSON.stringify({ scripts: { postinstall: "echo bad", build: "tsc" } }),
            );
            stripPostinstall(dir);
            const result = JSON.parse(_readFile(join(dir, "package.json"), "utf-8"));
            expect(result.scripts.postinstall).toBeUndefined();
            expect(result.scripts.build).toBe("tsc");
            rmSync(dir, { recursive: true });
        });

        test("does nothing when no package.json", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            stripPostinstall(dir); // should not throw
            rmSync(dir, { recursive: true });
        });

        test("does nothing when no postinstall script", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            const pkg = { scripts: { build: "tsc" } };
            _writeFile(join(dir, "package.json"), JSON.stringify(pkg));
            stripPostinstall(dir);
            const result = JSON.parse(_readFile(join(dir, "package.json"), "utf-8"));
            expect(result.scripts.build).toBe("tsc");
            // File shouldn't be rewritten (no postinstall to remove)
            rmSync(dir, { recursive: true });
        });
    });
}
