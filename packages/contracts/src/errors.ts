/** Base class for all contract errors. Use `instanceof ContractError` to catch any contract-related error. */
export class ContractError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "ContractError";
    }
}

/** No signer was available for a transaction call. */
export class ContractSignerMissingError extends ContractError {
    constructor() {
        super(
            "No signer available. Pass { signer } in call options, " +
                "set defaultSigner, or provide a signerSource.",
        );
        this.name = "ContractSignerMissingError";
    }
}

/** A contract was not found in the cdm.json manifest. */
export class ContractNotFoundError extends ContractError {
    readonly library: string;
    readonly targetHash: string;

    constructor(library: string, targetHash: string) {
        super(`Contract "${library}" not found in cdm.json for target ${targetHash}`);
        this.name = "ContractNotFoundError";
        this.library = library;
        this.targetHash = targetHash;
    }
}

if (import.meta.vitest) {
    const { test, expect, describe } = import.meta.vitest;

    describe("ContractError", () => {
        test("base error has correct name", () => {
            const err = new ContractError("test");
            expect(err.name).toBe("ContractError");
            expect(err).toBeInstanceOf(Error);
        });

        test("instanceof catches all contract errors", () => {
            expect(new ContractSignerMissingError()).toBeInstanceOf(ContractError);
            expect(new ContractNotFoundError("@a/b", "abc")).toBeInstanceOf(ContractError);
        });
    });

    describe("ContractSignerMissingError", () => {
        test("message mentions signer options", () => {
            const err = new ContractSignerMissingError();
            expect(err.message).toContain("signer");
            expect(err.message).toContain("signerSource");
            expect(err.name).toBe("ContractSignerMissingError");
        });
    });

    describe("ContractNotFoundError", () => {
        test("includes library and target", () => {
            const err = new ContractNotFoundError("@test/foo", "abc123");
            expect(err.library).toBe("@test/foo");
            expect(err.targetHash).toBe("abc123");
            expect(err.message).toContain("@test/foo");
            expect(err.message).toContain("abc123");
        });
    });
}
