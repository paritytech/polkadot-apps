export const foo = "bulletin";

if (import.meta.vitest) {
    const { test, expect } = import.meta.vitest;

    test("foo is bulletin", () => {
        expect(foo).toBe("bulletin");
    });
}
