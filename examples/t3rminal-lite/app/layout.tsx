import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "t3rminal-lite",
    description: "Decentralized payment terminal for Polkadot",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className="dark">
            <body className="bg-gray-950 text-gray-100 min-h-screen antialiased">
                <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
                    <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
                        <a
                            href="/"
                            className="text-xl font-bold tracking-tight"
                        >
                            <span className="text-[#E6007A]">t3rminal</span>
                            <span className="text-gray-400">-lite</span>
                        </a>
                        <div className="flex gap-4 text-sm">
                            <a
                                href="/"
                                className="text-gray-400 hover:text-gray-100 transition-colors"
                            >
                                Home
                            </a>
                            <a
                                href="/terminal/"
                                className="text-gray-400 hover:text-gray-100 transition-colors"
                            >
                                Terminal
                            </a>
                            <a
                                href="/pay/"
                                className="text-gray-400 hover:text-gray-100 transition-colors"
                            >
                                Pay
                            </a>
                        </div>
                    </div>
                </nav>
                <main className="max-w-4xl mx-auto px-4 py-8">
                    {children}
                </main>
            </body>
        </html>
    );
}
