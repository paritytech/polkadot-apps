import { Command } from "commander";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve, basename } from "node:path";
import { createInterface } from "node:readline";
import { connect, fetchIpfs, unwrapOption } from "../connection.js";
import { type AppMetadata } from "../config.js";
import { spinner, bold, green, dim } from "../ui.js";

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
    return Math.floor(Math.random() * 100).toString();
}

function detectPackageManager(dir: string): "pnpm" | "npm" | "bun" {
    if (existsSync(resolve(dir, "pnpm-lock.yaml"))) return "pnpm";
    if (existsSync(resolve(dir, "bun.lockb")) || existsSync(resolve(dir, "bun.lock"))) return "bun";
    return "pnpm";
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
    } catch {}
}

export const remixCommand = new Command("remix")
    .description("Fork an app for local development")
    .argument("<domain>", "App domain to remix (e.g. my-app)")
    .argument("[dir]", "Target directory — also used as the new domain name")
    .option("-n, --name <chain>", "Chain to connect to", "paseo")
    .option("--ipfs-gateway-url <url>", "Override IPFS gateway URL")
    .option("--no-install", "Skip dependency installation")
    .action(async (rawDomain: string, dir: string | undefined, opts) => {
        const domain = rawDomain.endsWith(".dot") ? rawDomain : `${rawDomain}.dot`;
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
                process.exitCode = 1;
                return;
            }

            s.update("Fetching metadata...");
            const metadata = await fetchIpfs<AppMetadata>(cid, gateway);

            if (!metadata.repository) {
                s.fail(`App "${domain}" has no repository URL set. Cannot remix.`);
                process.exitCode = 1;
                return;
            }

            const defaultName = metadata.name ?? domain.replace(/\.dot$/, "");
            let newName: string;
            let newDomain: string;
            let targetDir: string;

            if (dir) {
                targetDir = dir;
                newDomain = basename(dir);
                newName = newDomain;
            } else {
                // Pause spinner for interactive prompt
                s.succeed(`Found ${bold(domain)}`);
                console.log();
                newName = await ask("Name for your remix", defaultName);
                newDomain = slugify(newName) + "-" + randomSuffix();
                console.log(`  ${dim("→ domain:")} ${bold(newDomain)}`);
                targetDir = newDomain;
            }

            if (existsSync(targetDir)) {
                console.error(`  Directory "${targetDir}" already exists.`);
                process.exitCode = 1;
                return;
            }

            // Clone
            const branchFlag = metadata.branch ? ` --branch ${metadata.branch}` : "";
            const s2 = spinner(
                "Clone",
                `${metadata.repository}${metadata.branch ? ` (${metadata.branch})` : ""}...`,
            );
            execSync(`git clone${branchFlag} ${metadata.repository} ${targetDir}`, {
                stdio: "pipe",
            });

            // Clean git history
            rmSync(`${targetDir}/.git`, { recursive: true, force: true });
            execSync(`git init`, { cwd: targetDir, stdio: "pipe" });

            // Strip postinstall scripts that may fail in a fresh clone
            stripPostinstall(targetDir);

            // Update dot.json — merge with existing if present, override domain
            s2.update("Setting up dot.json...");
            const dotJsonPath = resolve(targetDir, "dot.json");
            let dotJson: Record<string, unknown> = {};
            if (existsSync(dotJsonPath)) {
                try {
                    dotJson = JSON.parse(readFileSync(dotJsonPath, "utf-8"));
                } catch {}
            }
            dotJson.domain = newDomain;
            dotJson.name = newName;
            // Keep existing fields (build, icon, tag, etc.) but fill in from metadata if missing
            if (!dotJson.description && metadata.description)
                dotJson.description = metadata.description;
            if (!dotJson.tag && metadata.tag) dotJson.tag = metadata.tag;
            writeFileSync(dotJsonPath, JSON.stringify(dotJson, null, 2) + "\n");

            s2.succeed(`Remixed ${bold(domain)} → ${bold(targetDir)}`);

            // Install dependencies
            if (opts.install !== false && existsSync(resolve(targetDir, "package.json"))) {
                const pm = detectPackageManager(targetDir);
                const installSpinner = spinner("Install", `Running ${pm} install...`);
                try {
                    execSync(`${pm} install`, { cwd: targetDir, stdio: "pipe" });
                    installSpinner.succeed("Dependencies installed");
                } catch {
                    installSpinner.fail(`${pm} install failed — run it manually`);
                }
            }

            console.log();
            console.log(`  ${dim("dot.json")}`);
            console.log(`    ${dim("domain")}: ${bold(newDomain)}`);
            if (metadata.name) console.log(`    ${dim("name")}: ${metadata.name}`);
            if (metadata.tag) console.log(`    ${dim("tag")}: ${metadata.tag}`);
            console.log();
            console.log(`  ${green("Next steps:")}`);
            console.log(`  ${dim("1.")} cd ${targetDir}`);
            console.log(`  ${dim("2.")} claude`);
            console.log(`  ${dim("3.")} dot deploy`);
            console.log();
        } catch (err) {
            s.fail(err instanceof Error ? err.message : String(err));
            process.exitCode = 1;
        } finally {
            conn?.destroy();
            process.exit(process.exitCode ?? 0);
        }
    });
