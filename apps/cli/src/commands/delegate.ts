import { Command } from "commander";
import { execSync } from "node:child_process";

function runCdm(args: string) {
    try {
        execSync(`cdm ${args}`, { stdio: "inherit" });
    } catch {
        // execSync already prints output via stdio: "inherit"
        // Just exit with error code
        process.exitCode = 1;
    }
}

export const buildCommand = new Command("build")
    .description("Build contracts (delegates to cdm)")
    .option("--contracts <names...>", "Specific contracts to build")
    .action((opts) => {
        const extra = opts.contracts ? ` --contracts ${opts.contracts.join(" ")}` : "";
        runCdm(`build${extra}`);
    });

export const setupCommand = new Command("setup")
    .description("Set up a development account (delegates to cdm init)")
    .action(() => {
        runCdm("init");
    });

export const accountCommand = new Command("account")
    .description("Account management (delegates to cdm)")
    .argument("<action>", "Action: set, bal, or map")
    .option("-n, --name <chain>", "Target chain")
    .action((action, opts) => {
        const chain = opts.name ? ` -n ${opts.name}` : "";
        runCdm(`account ${action}${chain}`);
    });

export const templateCommand = new Command("template")
    .description("Scaffold a new project from a template (delegates to cdm)")
    .argument("[name]", "Template name")
    .argument("[dir]", "Target directory")
    .action((name, dir) => {
        const args = [name, dir].filter(Boolean).join(" ");
        runCdm(`template ${args}`);
    });
