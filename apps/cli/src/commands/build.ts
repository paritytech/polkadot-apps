import { Command } from "commander";
import { execSync } from "node:child_process";
import { hasContracts, getBuildCommand, ensureToolchain } from "../project.js";
import { spinner, bold, dim, green, red } from "../ui.js";

/* @integration */
export const buildCommand = new Command("build")
    .description("Build contracts and frontend")
    .option("--contracts-only", "Only build contracts")
    .option("--frontend-only", "Only build frontend")
    .action((opts) => {
        let failed = false;

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
                process.exitCode = 1;
                return;
            }
        }

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
