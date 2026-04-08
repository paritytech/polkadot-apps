import { Command } from "commander";
import { connect, fetchIpfs, unwrapOption } from "../connection.js";
import { type AppMetadata } from "../config.js";
import { spinner, printTable, truncate, bold, dim } from "../ui.js";

export const searchCommand = new Command("search")
    .description("Search the playground registry for apps")
    .argument("[query]", "Search term (filters by domain name)")
    .option("-n, --name <chain>", "Chain to connect to", "paseo")
    .option("--limit <count>", "Maximum results to display", "20")
    .option("--ipfs-gateway-url <url>", "Override IPFS gateway URL")
    .action(async (query: string | undefined, opts) => {
        const s = spinner("Search", "Connecting...");
        let conn;
        try {
            conn = await connect(opts.name);
            s.update("Querying registry...");

            const countRes = await conn.registry.getAppCount.query();
            const total = countRes.success ? Number(countRes.value) : 0;

            if (total === 0) {
                s.succeed("No apps registered yet.");
                return;
            }

            const limit = parseInt(opts.limit, 10);
            const gateway = opts.ipfsGatewayUrl ?? conn.ipfsGateway;
            const matches: { domain: string; metadata?: AppMetadata }[] = [];

            s.update(`Scanning ${total} apps...`);

            // Iterate newest first in batches
            const BATCH = 10;
            for (let start = total - 1; start >= 0 && matches.length < limit; start -= BATCH) {
                const batchEnd = Math.max(start - BATCH + 1, 0);
                const indices = [];
                for (let i = start; i >= batchEnd; i--) indices.push(i);

                const domains = await Promise.all(
                    indices.map(async (idx) => {
                        const res = await conn!.registry.getDomainAt.query(idx);
                        return res.success ? String(res.value) : null;
                    }),
                );

                for (const domain of domains) {
                    if (!domain) continue;
                    if (query && !domain.toLowerCase().includes(query.toLowerCase())) continue;
                    if (matches.length >= limit) break;
                    matches.push({ domain });
                }
            }

            if (matches.length === 0) {
                s.succeed(query ? `No apps matching "${query}".` : "No apps found.");
                return;
            }

            // Fetch metadata in parallel
            s.update(`Fetching metadata for ${matches.length} apps...`);
            await Promise.allSettled(
                matches.map(async (m) => {
                    try {
                        const res = await conn!.registry.getMetadataUri.query(m.domain);
                        const cid = unwrapOption<string>(res.success ? res.value : undefined);
                        if (cid) {
                            m.metadata = await fetchIpfs<AppMetadata>(cid, gateway);
                        }
                    } catch {}
                }),
            );

            s.succeed(`Found ${matches.length} app${matches.length === 1 ? "" : "s"}`);
            console.log();

            const rows = matches.map((m) => [
                bold(m.domain),
                m.metadata?.name ?? dim("—"),
                m.metadata?.tag ?? dim("—"),
                truncate(m.metadata?.description ?? "", 50),
            ]);

            printTable(["Domain", "Name", "Tag", "Description"], rows);
        } catch (err) {
            s.fail(err instanceof Error ? err.message : String(err));
            process.exitCode = 1;
        } finally {
            conn?.destroy();
            process.exit(process.exitCode ?? 0);
        }
    });
