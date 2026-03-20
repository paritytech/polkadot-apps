import { defineConfig, type Plugin } from "vitest/config";

/**
 * Vite plugin that excludes `if (import.meta.vitest)` blocks from v8 coverage.
 * Automatically injects `v8 ignore start` so test helpers inside in-source
 * test blocks don't pollute coverage metrics.
 */
function ignoreInSourceTestsCoverage(): Plugin {
    return {
        name: "ignore-in-source-tests-coverage",
        transform(code, id) {
            if (id.includes("packages/") && code.includes("import.meta.vitest")) {
                return code.replace(
                    /^(if \(import\.meta\.vitest\))/m,
                    "/* v8 ignore start */\n$1",
                );
            }
        },
    };
}

export default defineConfig({
    plugins: [ignoreInSourceTestsCoverage()],
    test: {
        globals: true,
        includeSource: ["packages/*/src/**/*.ts"],
        include: ["packages/**/tests/**/*.test.ts"],
        exclude: ["**/node_modules/**", "**/dist/**"],
        reporters: "verbose",
        environment: "node",
        coverage: {
            provider: "v8",
            reporter: ["text", "json-summary", "json"],
            reportsDirectory: "./coverage",
            include: ["packages/*/src/**/*.ts"],
            exclude: [
                "**/node_modules/**",
                "**/dist/**",
                "**/tests/**",
                "**/index.ts",
                "**/types.ts",
                "**/encoding.ts",
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
