import { Command } from "commander";
import { connect, fetchIpfs, unwrapOption } from "../connection.js";
import { type AppMetadata } from "../config.js";
import { spinner, bold, dim, cyan } from "../ui.js";

/* @integration */
export const infoCommand = new Command("info")
    .description("Show detailed information about an app")
    .argument("<domain>", "App domain (e.g. my-app.dot)")
    .option("-n, --name <chain>", "Chain to connect to", "paseo")
    .option("--ipfs-gateway-url <url>", "Override IPFS gateway URL")
    .action(async (rawDomain: string, opts) => {
        const domain = rawDomain.endsWith(".dot") ? rawDomain : `${rawDomain}.dot`;
        const s = spinner("Info", "Connecting...");
        let conn;
        try {
            conn = await connect(opts.name);
            const gateway = opts.ipfsGatewayUrl ?? conn.ipfsGateway;

            s.update(`Querying ${domain}...`);

            const [metaRes, ownerRes] = await Promise.all([
                conn.registry.getMetadataUri.query(domain),
                conn.registry.getOwner.query(domain),
            ]);

            const owner = ownerRes.success ? String(ownerRes.value) : undefined;
            const cid = unwrapOption<string>(metaRes.success ? metaRes.value : undefined);

            if (!cid && (!owner || owner === "0x0000000000000000000000000000000000000000")) {
                s.fail(`App "${domain}" not found in registry.`);
                process.exitCode = 1;
                return;
            }

            let metadata: AppMetadata | undefined;
            if (cid) {
                s.update("Fetching metadata from IPFS...");
                try {
                    metadata = await fetchIpfs<AppMetadata>(cid, gateway);
                } catch {}
            }

            s.succeed(domain);
            console.log();

            const lines: [string, string][] = [
                ["Domain", bold(domain)],
                ["Name", metadata?.name ?? dim("not set")],
                ["Description", metadata?.description ?? dim("not set")],
                ["Owner", owner ? cyan(owner) : dim("unknown")],
                ["Repository", metadata?.repository ?? dim("not set")],
                ["Tag", metadata?.tag ?? dim("not set")],
                ["Metadata CID", cid ?? dim("none")],
            ];

            if (metadata?.icon_cid) {
                lines.push(["Icon", `${gateway}/${metadata.icon_cid}`]);
            }

            const maxLabel = Math.max(...lines.map(([l]) => l.length));
            for (const [label, value] of lines) {
                console.log(`  ${dim(label.padEnd(maxLabel))}  ${value}`);
            }
        } catch (err) {
            s.fail(err instanceof Error ? err.message : String(err));
            process.exitCode = 1;
        } finally {
            conn?.destroy();
        }
    });
