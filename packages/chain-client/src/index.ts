export const foo = "chain-client";

if (import.meta.vitest) {
    const { test, expect } = import.meta.vitest;

    test("foo is chain-client", () => {
        expect(foo).toBe("chain-client");
    });
}
