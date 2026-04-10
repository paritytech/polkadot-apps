"use client";

import { useCallback, useEffect, useState } from "react";
import { truncateAddress, isValidSs58 } from "@polkadot-apps/address";
import QRCode from "qrcode";

export default function TerminalPage() {
    const [recipientAddress, setRecipientAddress] = useState("");
    const [amount, setAmount] = useState("");
    const [memo, setMemo] = useState("");
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [paymentLink, setPaymentLink] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const addr = params.get("address");
        if (addr) {
            setRecipientAddress(addr);
        }
    }, []);

    const generateQR = useCallback(async () => {
        setError(null);
        setQrDataUrl(null);
        setPaymentLink(null);

        if (!recipientAddress) {
            setError("Recipient address is required");
            return;
        }

        if (!isValidSs58(recipientAddress)) {
            setError("Invalid SS58 address");
            return;
        }

        if (!amount || Number.parseFloat(amount) <= 0) {
            setError("Amount must be greater than 0");
            return;
        }

        const payParams = new URLSearchParams({
            to: recipientAddress,
            amount,
        });
        if (memo) {
            payParams.set("memo", memo);
        }

        const origin =
            typeof window !== "undefined" ? window.location.origin : "";
        const link = `${origin}/pay/?${payParams.toString()}`;
        setPaymentLink(link);

        try {
            const dataUrl = await QRCode.toDataURL(link, {
                width: 300,
                margin: 2,
                color: {
                    dark: "#E6007A",
                    light: "#111827",
                },
                errorCorrectionLevel: "M",
            });
            setQrDataUrl(dataUrl);
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Failed to generate QR code",
            );
        }
    }, [recipientAddress, amount, memo]);

    const copyLink = useCallback(() => {
        if (paymentLink) {
            navigator.clipboard.writeText(paymentLink);
        }
    }, [paymentLink]);

    return (
        <div className="space-y-8">
            <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold">Merchant Terminal</h1>
                <p className="text-gray-400">
                    Generate a payment request QR code
                </p>
            </div>

            {error && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300 text-sm">
                    {error}
                </div>
            )}

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                <div>
                    <label className="text-sm text-gray-400 block mb-1">
                        Recipient Address
                    </label>
                    <input
                        type="text"
                        value={recipientAddress}
                        onChange={(e) => setRecipientAddress(e.target.value)}
                        placeholder="5Grwva..."
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm font-mono text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#E6007A]"
                    />
                    {recipientAddress && isValidSs58(recipientAddress) && (
                        <p className="text-xs text-gray-500 mt-1">
                            {truncateAddress(recipientAddress)}
                        </p>
                    )}
                </div>

                <div>
                    <label className="text-sm text-gray-400 block mb-1">
                        Amount (PAS)
                    </label>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        min="0"
                        step="0.0001"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-2xl font-bold text-white placeholder-gray-600 focus:outline-none focus:border-[#E6007A]"
                    />
                </div>

                <div>
                    <label className="text-sm text-gray-400 block mb-1">
                        Memo (optional)
                    </label>
                    <input
                        type="text"
                        value={memo}
                        onChange={(e) => setMemo(e.target.value)}
                        placeholder="Order #123"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#E6007A]"
                    />
                </div>

                <button
                    onClick={generateQR}
                    className="w-full bg-[#E6007A] hover:bg-[#c70068] text-white font-medium py-3 px-6 rounded-lg transition-colors"
                >
                    Generate Payment QR
                </button>
            </div>

            {qrDataUrl && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col items-center space-y-4">
                    <h2 className="text-lg font-semibold">
                        Payment QR Code
                    </h2>
                    <div className="bg-gray-800 rounded-xl p-4">
                        <img
                            src={qrDataUrl}
                            alt="Payment QR Code"
                            width={300}
                            height={300}
                        />
                    </div>
                    <div className="text-center space-y-1">
                        <p className="text-sm text-gray-400">
                            Amount:{" "}
                            <span className="text-white font-semibold">
                                {amount} PAS
                            </span>
                        </p>
                        <p className="text-sm text-gray-400">
                            To:{" "}
                            <span className="text-gray-300 font-mono">
                                {truncateAddress(recipientAddress)}
                            </span>
                        </p>
                        {memo && (
                            <p className="text-sm text-gray-400">
                                Memo:{" "}
                                <span className="text-gray-300">{memo}</span>
                            </p>
                        )}
                    </div>
                    {paymentLink && (
                        <button
                            onClick={copyLink}
                            className="text-sm text-[#E6007A] hover:text-[#ff339a] transition-colors"
                        >
                            Copy payment link
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
