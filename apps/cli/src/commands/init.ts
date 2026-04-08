import { Command } from "commander";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import { createInterface } from "node:readline";
import { TAGS } from "../config.js";
import { bold, green, dim } from "../ui.js";

async function ask(prompt: string, fallback?: string): Promise<string> {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const suffix = fallback ? ` ${dim(`(${fallback})`)}` : "";
    return new Promise((resolve) => {
        rl.question(`  ${prompt}${suffix}: `, (answer) => {
            rl.close();
            resolve(answer.trim() || fallback || "");
        });
    });
}

async function askTag(): Promise<string> {
    const tagList = TAGS.map((t, i) => `${i + 1}) ${t}`).join("  ");
    console.log(`  ${dim("Tags:")} ${tagList}`);
    const answer = await ask("Tag (number or name)");
    if (!answer) return "";

    const num = parseInt(answer, 10);
    if (num >= 1 && num <= TAGS.length) return TAGS[num - 1];
    if ((TAGS as readonly string[]).includes(answer)) return answer;

    console.log(`  ${dim("Invalid tag, skipping.")}`);
    return "";
}

export const initCommand = new Command("init")
    .description("Initialize dot.json in the current project")
    .option("--domain <name>", "App domain (e.g. my-app)")
    .option("--app-name <name>", "Display name")
    .option("--description <text>", "Short description")
    .option("--tag <tag>", `Category: ${TAGS.join(", ")}`)
    .action(async (opts) => {
        try {
            const dotPath = resolve(process.cwd(), "dot.json");
            const dirName = basename(process.cwd());

            // Load existing dot.json if present
            let existing: Record<string, string> = {};
            if (existsSync(dotPath)) {
                try {
                    existing = JSON.parse(readFileSync(dotPath, "utf-8"));
                    console.log(`  ${dim("Updating existing dot.json")}`);
                } catch {}
            }

            // Resolve fields: CLI args > existing values > prompt
            const domain = opts.domain ?? existing.domain ?? (await ask("Domain", dirName));
            const appName = opts.appName ?? existing.name ?? (await ask("Name", domain));
            const description =
                opts.description ?? existing.description ?? (await ask("Description"));
            const tag = opts.tag ?? existing.tag ?? (await askTag());

            const dotJson: Record<string, string> = { domain };
            if (appName) dotJson.name = appName;
            if (description) dotJson.description = description;
            if (tag) dotJson.tag = tag;

            writeFileSync(dotPath, JSON.stringify(dotJson, null, 2) + "\n");

            console.log();
            console.log(`${green("✔")} ${existsSync(dotPath) ? "Updated" : "Created"} dot.json`);
            console.log();
            for (const [k, v] of Object.entries(dotJson)) {
                console.log(`  ${dim(k)}: ${v}`);
            }
            console.log();
        } catch (err) {
            console.error(err instanceof Error ? err.message : String(err));
            process.exitCode = 1;
        }
    });
