import { Command } from "commander";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeCid, BulletinClient } from "@polkadot-apps/bulletin";
import { connect } from "../connection.js";
import { TAGS } from "../config.js";
import {
    loadProjectConfig,
    getGitRemoteUrl,
    getGitBranch,
    resolveSigner,
    readReadme,
} from "../project.js";
import { spinner, bold, dim, cyan } from "../ui.js";

export const publishCommand = new Command("publish")
    .description("Publish or update app metadata in the playground registry")
    .option("--domain <name>", "App domain (e.g. my-app or my-app.dot)")
    .option("--app-name <name>", "Display name")
    .option("--description <text>", "Short description")
    .option("--repo <url>", "Source repository URL")
    .option("--branch <branch>", "Git branch to clone on remix")
    .option("--tag <tag>", `Category: ${TAGS.join(", ")}`)
    .option("--icon <path>", "Path to icon image file")
    .option("-n, --name <chain>", "Chain to connect to", "paseo")
    .option("--suri <suri>", "Signer secret URI (e.g. //Alice for dev)")
    .action(async (opts) => {
        const chain = opts.name;
        const s = spinner("Publish", "Reading project config...");
        let conn;
        try {
            const project = loadProjectConfig();
            const gitRemote = getGitRemoteUrl();

            const domain = opts.domain ?? project.domain;
            if (!domain) {
                throw new Error(
                    'No domain specified. Use --domain <name> or set "domain" in dot.json',
                );
            }
            const fullDomain = domain.endsWith(".dot") ? domain : `${domain}.dot`;

            const appName = opts.appName ?? project.name;
            const description = opts.description ?? project.description;
            const repository = opts.repo ?? project.repository ?? gitRemote;
            const branch = opts.branch ?? project.branch ?? getGitBranch();
            const tag = opts.tag ?? project.tag;
            const iconPath = opts.icon ?? project.icon;

            if (tag && !(TAGS as readonly string[]).includes(tag)) {
                throw new Error(`Invalid tag "${tag}". Must be one of: ${TAGS.join(", ")}`);
            }

            s.update("Preparing signer...");
            const { signer, origin } = resolveSigner(chain, opts.suri);

            // Read icon
            let iconBytes: Uint8Array | undefined;
            let iconCid: string | undefined;
            if (iconPath) {
                s.update("Reading icon...");
                iconBytes = new Uint8Array(readFileSync(resolve(process.cwd(), iconPath)));
                iconCid = computeCid(iconBytes);
            }

            // Build metadata
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
                    "No metadata to publish. Create a dot.json or pass --app-name, --description, etc.",
                );
            }

            const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
            const metadataCid = computeCid(metadataBytes);

            s.update("Connecting...");
            conn = await connect(chain);

            s.update("Uploading metadata & publishing to registry...");

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

            s.succeed(`Published ${bold(fullDomain)}`);
            console.log();
            console.log(`  ${dim("Domain")}        ${bold(fullDomain)}`);
            if (metadata.name) console.log(`  ${dim("Name")}          ${metadata.name}`);
            if (metadata.tag) console.log(`  ${dim("Tag")}           ${metadata.tag}`);
            if (metadata.description)
                console.log(`  ${dim("Description")}   ${metadata.description}`);
            if (metadata.repository)
                console.log(`  ${dim("Repository")}    ${metadata.repository}`);
            if (metadata.branch) console.log(`  ${dim("Branch")}        ${metadata.branch}`);
            if (iconCid) console.log(`  ${dim("Icon CID")}      ${iconCid}`);
            console.log(`  ${dim("Metadata CID")}  ${cyan(metadataCid)}`);
            console.log();
        } catch (err) {
            s.fail(err instanceof Error ? err.message : String(err));
            process.exitCode = 1;
        } finally {
            conn?.destroy();
            process.exit(process.exitCode ?? 0);
        }
    });
