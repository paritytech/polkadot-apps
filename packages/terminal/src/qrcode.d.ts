declare module "qrcode" {
    interface QRCodeToStringOptions {
        type?: "utf8" | "svg" | "terminal";
        errorCorrectionLevel?: "L" | "M" | "Q" | "H";
        margin?: number;
    }

    export function toString(text: string, options?: QRCodeToStringOptions): Promise<string>;
}
