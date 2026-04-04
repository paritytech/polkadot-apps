import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./app/**/*.{ts,tsx}",
        "./lib/**/*.{ts,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                polkadot: {
                    pink: "#E6007A",
                    purple: "#552BBF",
                    cyan: "#00B2FF",
                    green: "#56F39A",
                    lime: "#D3FF33",
                },
            },
        },
    },
    plugins: [],
};

export default config;
