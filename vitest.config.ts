import { defineConfig, type Plugin } from "vitest/config";

/**
 * Excludes in-source test blocks and integration-only functions from coverage.
 *
 * Istanbul instruments code AFTER Vite transforms, so injecting
 * `istanbul ignore next` here causes it to skip the targeted blocks.
 */
function ignoreCoverageBlocks(): Plugin {
    return {
        name: "ignore-coverage-blocks",
        transform(code, id) {
            if (!id.includes("packages/") && !id.includes("apps/")) return;
            let result = code;

            // Exclude in-source test blocks
            if (code.includes("import.meta.vitest")) {
                result = result.replace(
                    /if \(import\.meta\.vitest\)/,
                    "/* istanbul ignore next */\nif (import.meta.vitest)",
                );
            }

            // Exclude functions marked with `/* @integration */` comments
            // These require real connections/providers and can't be unit tested
            result = result.replace(
                /\/\* @integration \*\//g,
                "/* istanbul ignore next */",
            );

            return result !== code ? result : undefined;
        },
    };
}

export default defineConfig({
    plugins: [ignoreCoverageBlocks()],
    test: {
        globals: true,
        includeSource: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
        include: ["packages/**/tests/**/*.test.ts", "apps/**/tests/**/*.test.ts"],
        exclude: ["**/node_modules/**", "**/dist/**"],
        reporters: "verbose",
        environment: "node",
        coverage: {
            provider: "istanbul",
            reporter: ["text", "json-summary", "json"],
            reportsDirectory: "./coverage",
            include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
            exclude: [
                "**/node_modules/**",
                "**/dist/**",
                "**/tests/**",
                "**/index.ts",
                "**/types.ts",
                "**/encoding.ts",
                // Integration-only: require real WebSocket/provider connections
                "**/container.ts",
                "**/providers.ts",
                "**/chain-client/src/clients.ts",
            ],
            thresholds: {
                lines: 90,
                branches: 90,
                functions: 90,
                statements: 90,
            },
        },
    },
});
