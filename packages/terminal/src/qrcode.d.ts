declare module "qrcode" {
    export function toString(
        data: string,
        options?: {
            type?: "utf8" | "svg" | "terminal";
            errorCorrectionLevel?: "L" | "M" | "Q" | "H";
            margin?: number;
        },
    ): Promise<string>;
}
