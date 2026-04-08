import { Command } from "commander";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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

    // Accept number or name
    const num = parseInt(answer, 10);
    if (num >= 1 && num <= TAGS.length) return TAGS[num - 1];
    if ((TAGS as readonly string[]).includes(answer)) return answer;

    console.log(`  ${dim("Invalid tag, skipping.")}`);
    return "";
}

export const newCommand = new Command("new")
    .description("Scaffold a new .dot app project")
    .argument("<path>", "Directory to create the project in")
    .option("--domain <name>", "App domain (e.g. my-app)")
    .option("--app-name <name>", "Display name")
    .option("--description <text>", "Short description")
    .option("--tag <tag>", `Category: ${TAGS.join(", ")}`)
    .action(async (targetPath: string, opts) => {
        try {
            // Resolve target directory
            const absPath = resolve(process.cwd(), targetPath);
            const dirName = basename(absPath);

            if (existsSync(absPath)) {
                console.error(`Directory "${targetPath}" already exists.`);
                process.exitCode = 1;
                return;
            }

            // Resolve fields: use args first, then prompt for missing ones
            const domain = opts.domain ?? (await ask("Domain", dirName));
            const appName = opts.appName ?? (await ask("Name", domain));
            const description = opts.description ?? (await ask("Description"));
            const tag = opts.tag ?? (await askTag());

            console.log();

            // Create project directory
            mkdirSync(absPath, { recursive: true });

            // Write dot.json
            const dotJson: Record<string, string> = { domain };
            if (appName) dotJson.name = appName;
            if (description) dotJson.description = description;
            if (tag) dotJson.tag = tag;

            writeFileSync(resolve(absPath, "dot.json"), JSON.stringify(dotJson, null, 2) + "\n");

            console.log(`${green("✔")} Created ${bold(targetPath)}`);
            console.log();
            console.log(`  ${dim("dot.json")}`);
            for (const [k, v] of Object.entries(dotJson)) {
                console.log(`    ${dim(k)}: ${v}`);
            }
            console.log();
            console.log(`  ${green("Next steps:")}`);
            console.log(`  ${dim("1.")} cd ${targetPath}`);
            console.log(`  ${dim("2.")} Build your app`);
            console.log(`  ${dim("3.")} dot publish`);
            console.log();
        } catch (err) {
            console.error(err instanceof Error ? err.message : String(err));
            process.exitCode = 1;
        }
    });
