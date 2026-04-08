import { Command } from "commander";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { spinner, bold, dim, green, red, yellow } from "../ui.js";

function commandExists(cmd: string): boolean {
    try {
        execSync(`command -v ${cmd}`, { stdio: "pipe" });
        return true;
    } catch {
        return false;
    }
}

function isGhAuthenticated(): boolean {
    try {
        execSync("gh auth status", { stdio: "pipe" });
        return true;
    } catch {
        return false;
    }
}

function hasRustNightly(): boolean {
    try {
        const out = execSync("rustup toolchain list", { encoding: "utf-8", stdio: "pipe" });
        return out.includes("nightly");
    } catch {
        return false;
    }
}

function hasRustSrc(): boolean {
    try {
        const out = execSync("rustup component list --toolchain nightly", {
            encoding: "utf-8",
            stdio: "pipe",
        });
        return out.includes("rust-src (installed)");
    } catch {
        return false;
    }
}

function hasCargoPvmContract(): boolean {
    return commandExists("cargo-pvm-contract");
}

export const initCommand = new Command("init")
    .description("Set up your development environment and authenticate")
    .option("--skip-toolchain", "Skip Rust toolchain setup")
    .option("--skip-auth", "Skip authentication")
    .action(async (opts) => {
        console.log();
        console.log(`  ${bold("dot init")} — Setting up your development environment`);
        console.log();

        // ── Step 1: Rust toolchain ────────────────────────────────────
        if (!opts.skipToolchain) {
            // rustup
            if (!commandExists("rustup")) {
                const s = spinner("Rust", "Installing rustup...");
                try {
                    execSync(
                        'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y',
                        { stdio: "pipe", shell: "/bin/bash" },
                    );
                    s.succeed("rustup installed");
                } catch {
                    s.fail("Failed to install rustup");
                    console.log(`    ${dim("Install manually: https://rustup.rs")}`);
                }
            } else {
                console.log(`  ${green("✔")} rustup`);
            }

            // nightly toolchain
            if (!hasRustNightly()) {
                const s = spinner("Rust", "Installing nightly toolchain...");
                try {
                    execSync("rustup toolchain install nightly", { stdio: "pipe" });
                    s.succeed("Rust nightly installed");
                } catch {
                    s.fail("Failed to install Rust nightly");
                }
            } else {
                console.log(`  ${green("✔")} Rust nightly`);
            }

            // rust-src component
            if (!hasRustSrc()) {
                const s = spinner("Rust", "Installing rust-src...");
                try {
                    execSync("rustup component add rust-src --toolchain nightly", {
                        stdio: "pipe",
                    });
                    s.succeed("rust-src installed");
                } catch {
                    s.fail("Failed to install rust-src");
                }
            } else {
                console.log(`  ${green("✔")} rust-src`);
            }

            // cargo-pvm-contract
            if (!hasCargoPvmContract()) {
                const s = spinner("Rust", "Installing cargo-pvm-contract...");
                try {
                    const hostTarget = execSync("rustc -vV", { encoding: "utf-8", stdio: "pipe" })
                        .split("\n")
                        .find((l) => l.startsWith("host:"))
                        ?.split(" ")[1];

                    execSync(
                        `cargo install --force --locked --target ${hostTarget} --git https://github.com/nicepaycode/cargo-pvm-contract.git`,
                        { stdio: "pipe" },
                    );
                    s.succeed("cargo-pvm-contract installed");
                } catch {
                    s.fail("Failed to install cargo-pvm-contract");
                    console.log(`    ${dim("Install manually from GitHub")}`);
                }
            } else {
                console.log(`  ${green("✔")} cargo-pvm-contract`);
            }
        }

        // ── Step 2: GitHub CLI ────────────────────────────────────────
        if (!opts.skipToolchain) {
            if (!commandExists("gh")) {
                console.log(`  ${yellow("!")} GitHub CLI not found`);
                console.log(`    ${dim("Install: https://cli.github.com")}`);
            } else if (!isGhAuthenticated()) {
                console.log(`  ${yellow("!")} GitHub CLI not authenticated`);
                console.log(`    ${dim("Run: gh auth login")}`);
            } else {
                console.log(`  ${green("✔")} GitHub CLI`);
            }
        }

        // ── Step 3: QR Authentication ─────────────────────────────────
        if (!opts.skipAuth) {
            const dotDir = resolve(homedir(), ".dot");
            const sessionExists = existsSync(resolve(dotDir, "sessions.json"));

            if (sessionExists) {
                console.log(`  ${green("✔")} Authenticated ${dim("(session found)")}`);
            } else {
                console.log();
                console.log(`  ${yellow("!")} ${bold("Authentication")} — QR login coming soon`);
                console.log(
                    `    ${dim("Mobile signing will be available once the QR provider is implemented")}`,
                );
                console.log(
                    `    ${dim("For now, use --suri //Alice for dev signing in deploy/publish commands")}`,
                );
            }
        }

        console.log();
        console.log(`${green("✔")} ${bold("Setup complete")}`);
        console.log();
    });
