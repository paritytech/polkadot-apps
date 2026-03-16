export const foo = "address";

if (import.meta.vitest) {
    const { test, expect } = import.meta.vitest;

    test("foo is address", () => {
        expect(foo).toBe("address");
    });
}
