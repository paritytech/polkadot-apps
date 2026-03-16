export const foo = "storage";

if (import.meta.vitest) {
    const { test, expect } = import.meta.vitest;

    test("foo is storage", () => {
        expect(foo).toBe("storage");
    });
}
