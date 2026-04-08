/**
 * Terminal QR code rendering using Unicode half-block characters.
 *
 * Wraps the `qrcode` npm package's UTF-8 renderer, which packs two
 * module rows per terminal line using ▀▄█ characters.
 */

/** Options for QR code rendering. */
export interface QrRenderOptions {
    /** Error correction level. Default: "M". */
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    /** Quiet zone size in modules. Default: 2. */
    margin?: number;
}

/**
 * Encode a string as a QR code rendered in Unicode half-block characters.
 *
 * Returns a multi-line string suitable for `console.log`.
 * Uses ▀ (upper half), ▄ (lower half), █ (full block), and space
 * to pack 2 module rows per terminal line — halving vertical height.
 */
export async function renderQrCode(data: string, options?: QrRenderOptions): Promise<string> {
    // Dynamic import — qrcode is CJS, loaded at runtime
    const QRCode = await import("qrcode");
    const result = await QRCode.toString(data, {
        type: "utf8",
        errorCorrectionLevel: options?.errorCorrectionLevel ?? "M",
        margin: options?.margin ?? 2,
    });
    return result;
}

if (import.meta.vitest) {
    const { test, expect } = import.meta.vitest;

    test("renderQrCode produces non-empty output", async () => {
        const result = await renderQrCode("https://example.com");
        expect(result.length).toBeGreaterThan(0);
        expect(result).toContain("\n");
    });

    test("renderQrCode contains Unicode block characters", async () => {
        const result = await renderQrCode("test");
        // Should contain at least one of the half-block characters
        const hasBlocks = /[▀▄█]/.test(result);
        expect(hasBlocks).toBe(true);
    });

    test("different inputs produce different QR codes", async () => {
        const a = await renderQrCode("hello");
        const b = await renderQrCode("world");
        expect(a).not.toBe(b);
    });
}
