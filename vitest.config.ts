import { defineConfig, type Plugin } from "vitest/config";

/**
 * Excludes in-source test blocks from coverage.
 *
 * Istanbul instruments code AFTER Vite transforms, so injecting
 * `istanbul ignore next` here causes it to skip the entire
 * `if (import.meta.vitest) { ... }` block and everything inside it.
 */
function ignoreInSourceTestsCoverage(): Plugin {
    return {
        name: "ignore-in-source-tests-coverage",
        transform(code, id) {
            if (id.includes("packages/") && code.includes("import.meta.vitest")) {
                return code.replace(
                    /if \(import\.meta\.vitest\)/,
                    "/* istanbul ignore next */\nif (import.meta.vitest)",
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
            provider: "istanbul",
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
