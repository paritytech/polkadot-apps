export const foo = "crypto";

if (import.meta.vitest) {
    const { test, expect } = import.meta.vitest;

    test("foo is crypto", () => {
        expect(foo).toBe("crypto");
    });
}
