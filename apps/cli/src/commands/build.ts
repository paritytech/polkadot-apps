import { Command } from "commander";
import { execSync } from "node:child_process";
import { hasContracts, getBuildCommand } from "../project.js";
import { spinner, bold, dim, green } from "../ui.js";

/* @integration */
export const buildCommand = new Command("build")
    .description("Build contracts and frontend")
    .option("--contracts-only", "Only build contracts")
    .option("--frontend-only", "Only build frontend")
    .action((opts) => {
        let failed = false;

        // Contracts
        if (!opts.frontendOnly && hasContracts()) {
            const s = spinner("Contracts", "Building...");
            try {
                execSync("cargo pvm-contract build --release", { stdio: "inherit" });
                s.succeed("Contracts built");
            } catch {
                s.fail("Contract build failed");
                failed = true;
            }
        } else if (!opts.frontendOnly) {
            console.log(`  ${dim("No contracts detected (no contracts/ or Cargo.toml)")}`);
        }

        // Frontend
        const buildCmd = getBuildCommand();
        if (!opts.contractsOnly && buildCmd) {
            const s = spinner("Frontend", "Building...");
            try {
                execSync(buildCmd, { stdio: "inherit" });
                s.succeed("Frontend built");
            } catch {
                s.fail("Frontend build failed");
                failed = true;
            }
        } else if (!opts.contractsOnly && !buildCmd) {
            console.log(`  ${dim("No frontend detected (no build script in package.json)")}`);
        }

        if (failed) {
            process.exitCode = 1;
        } else {
            console.log(`${green("✔")} ${bold("Build complete")}`);
        }
    });
