import { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { spinner, bold, dim, green } from "../ui.js";

function detectContracts(): boolean {
    return (
        existsSync(resolve(process.cwd(), "contracts")) ||
        existsSync(resolve(process.cwd(), "Cargo.toml"))
    );
}

function detectFrontendBuildCommand(): string | undefined {
    const pkg = resolve(process.cwd(), "package.json");
    try {
        const scripts = JSON.parse(readFileSync(pkg, "utf-8")).scripts ?? {};
        if (scripts["build:frontend"]) return "pnpm build:frontend";
        if (scripts.build) return "pnpm build";
    } catch {}
    return undefined;
}

/* @integration */
export const buildCommand = new Command("build")
    .description("Build contracts and frontend")
    .option("--contracts-only", "Only build contracts")
    .option("--frontend-only", "Only build frontend")
    .action((opts) => {
        let failed = false;

        // Contracts
        if (!opts.frontendOnly && detectContracts()) {
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
        const buildCmd = detectFrontendBuildCommand();
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

if (import.meta.vitest) {
    const { test, expect, describe } = import.meta.vitest;
    const { mkdtempSync, writeFileSync: _writeFile, mkdirSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    describe("detectContracts", () => {
        test("returns false in empty dir", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            const orig = process.cwd();
            process.chdir(dir);
            expect(detectContracts()).toBe(false);
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });

        test("returns true with Cargo.toml", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            _writeFile(join(dir, "Cargo.toml"), "[package]");
            const orig = process.cwd();
            process.chdir(dir);
            expect(detectContracts()).toBe(true);
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });
    });

    describe("detectFrontendBuildCommand", () => {
        test("returns undefined without package.json", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            const orig = process.cwd();
            process.chdir(dir);
            expect(detectFrontendBuildCommand()).toBeUndefined();
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });

        test("detects build script", () => {
            const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
            _writeFile(join(dir, "package.json"), JSON.stringify({ scripts: { build: "vite" } }));
            const orig = process.cwd();
            process.chdir(dir);
            expect(detectFrontendBuildCommand()).toBe("pnpm build");
            process.chdir(orig);
            rmSync(dir, { recursive: true });
        });
    });
}
