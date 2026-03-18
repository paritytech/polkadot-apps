import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        includeSource: ["packages/*/src/**/*.ts"],
        include: ["packages/**/tests/**/*.test.ts"],
        exclude: ["**/node_modules/**", "**/dist/**"],
        reporters: "verbose",
        environment: "node",
    },
});
