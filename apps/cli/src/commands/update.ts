import { Command } from "commander";
import { writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { homedir, platform, arch } from "node:os";
import { spinner, bold, dim } from "../ui.js";

function currentVersion(): string {
    return "0.1.0";
}

function platformAsset(): string {
    const os = platform() === "darwin" ? "darwin" : "linux";
    const cpu = arch() === "arm64" ? "arm64" : "x64";
    return `dot-${os}-${cpu}`;
}

export const updateCommand = new Command("update")
    .description("Update the dot CLI to the latest version")
    .action(async () => {
        const s = spinner("Update", "Checking for updates...");
        try {
            const repo = "paritytech/polkadot-apps";
            const current = currentVersion();

            // Fetch latest release tag via redirect header
            const res = await fetch(`https://github.com/${repo}/releases/latest`, {
                redirect: "manual",
            });
            const location = res.headers.get("location");
            if (!location) throw new Error("Could not determine latest release");

            const latest = location.split("/tag/")[1];
            if (!latest) throw new Error("Could not parse release tag");

            const latestVersion = latest.replace(/^v/, "");

            if (latestVersion === current) {
                s.succeed(`Already up to date (${bold(current)})`);
                return;
            }

            s.update(`Downloading ${bold(latest)}...`);

            const asset = platformAsset();
            const url = `https://github.com/${repo}/releases/download/${latest}/${asset}`;
            const binRes = await fetch(url);
            if (!binRes.ok) throw new Error(`Download failed: ${binRes.statusText}`);

            const binPath = resolve(homedir(), ".polkadot/bin/dot");
            const bytes = new Uint8Array(await binRes.arrayBuffer());
            writeFileSync(binPath, bytes);
            chmodSync(binPath, 0o755);

            s.succeed(`Updated ${dim(current)} → ${bold(latestVersion)}`);
        } catch (err) {
            s.fail(err instanceof Error ? err.message : String(err));
            process.exitCode = 1;
        }
    });
