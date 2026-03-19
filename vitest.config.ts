import { defineConfig } from "vitest/config";

export default defineConfig({
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
            exclude: ["**/node_modules/**", "**/dist/**", "**/tests/**"],
            thresholds: {
                lines: 90,
                branches: 90,
                functions: 90,
                statements: 90,
            },
        },
    },
});
