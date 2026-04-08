import { Command } from "commander";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { spinner, bold, dim, green, red } from "../ui.js";

function hasTypeScriptTests(): boolean {
    return (
        existsSync(resolve(process.cwd(), "vitest.config.ts")) ||
        existsSync(resolve(process.cwd(), "vitest.config.js")) ||
        existsSync(resolve(process.cwd(), "jest.config.ts")) ||
        existsSync(resolve(process.cwd(), "jest.config.js"))
    );
}

function hasRustTests(): boolean {
    return existsSync(resolve(process.cwd(), "Cargo.toml"));
}

export const testCommand = new Command("test")
    .description("Run tests (vitest for TypeScript, cargo test for Rust)")
    .option("--ts-only", "Only run TypeScript tests")
    .option("--rust-only", "Only run Rust tests")
    .action((opts) => {
        let ran = false;
        let failed = false;

        // TypeScript tests
        if (!opts.rustOnly && hasTypeScriptTests()) {
            const s = spinner("TypeScript", "Running tests...");
            try {
                execSync("pnpm test", { stdio: "inherit" });
                s.succeed("TypeScript tests passed");
                ran = true;
            } catch {
                s.fail("TypeScript tests failed");
                failed = true;
                ran = true;
            }
        } else if (!opts.rustOnly) {
            console.log(`  ${dim("No TypeScript test config detected")}`);
        }

        // Rust tests
        if (!opts.tsOnly && hasRustTests()) {
            const s = spinner("Rust", "Running tests...");
            try {
                execSync("cargo test", { stdio: "inherit" });
                s.succeed("Rust tests passed");
                ran = true;
            } catch {
                s.fail("Rust tests failed");
                failed = true;
                ran = true;
            }
        } else if (!opts.tsOnly) {
            console.log(`  ${dim("No Cargo.toml detected")}`);
        }

        if (!ran) {
            console.log(`${dim("No tests found.")}`);
        } else if (failed) {
            console.log(`\n${red("✖")} ${bold("Some tests failed")}`);
            process.exitCode = 1;
        } else {
            console.log(`\n${green("✔")} ${bold("All tests passed")}`);
        }
    });
