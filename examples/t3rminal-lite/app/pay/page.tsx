"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { truncateAddress, isValidSs58 } from "@polkadot-apps/address";
import { submitAndWatch } from "@polkadot-apps/tx";
import type { TxStatus } from "@polkadot-apps/tx";
import { getSignerManager, destroySignerManager } from "@/lib/wallet";
import { getApi, cleanup } from "@/lib/chain";
import { formatPlanck, parseToPlanck } from "@polkadot-apps/utils";
import { generateId } from "@/lib/types";
import type { Transaction } from "@/lib/types";

type ConnectionStatus = "disconnected" | "connecting" | "connected";

export default function PayPage() {
    const [recipient, setRecipient] = useState("");
    const [amount, setAmount] = useState("");
    const [memo, setMemo] = useState("");

    const [walletStatus, setWalletStatus] = useState<ConnectionStatus>("disconnected");
    const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
    const [txStatus, setTxStatus] = useState<TxStatus | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);

    const managerRef = useRef<ReturnType<typeof getSignerManager> | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const to = params.get("to");
        const amt = params.get("amount");
        const m = params.get("memo");
        if (to) setRecipient(to);
        if (amt) setAmount(amt);
        if (m) setMemo(m);
    }, []);

    useEffect(() => {
        const manager = getSignerManager();
        managerRef.current = manager;

        const unsub = manager.subscribe((state) => {
            setWalletStatus(state.status);
            if (state.selectedAccount) {
                setSelectedAddress(state.selectedAccount.address);
            }
        });

        return () => {
            unsub();
            destroySignerManager();
            cleanup();
        };
    }, []);

    const handleConnect = useCallback(async () => {
        setError(null);
        const manager = managerRef.current;
        if (!manager) return;

        const result = await manager.connect();
        if (result.ok) {
            if (result.value.length > 0) {
                manager.selectAccount(result.value[0].address);
            }
        } else {
            setError(result.error.message);
        }
    }, []);

    const handleSubmitPayment = useCallback(async () => {
        setError(null);
        setTxStatus(null);

        if (!recipient || !isValidSs58(recipient)) {
            setError("Invalid recipient address");
            return;
        }

        if (!amount || Number.parseFloat(amount) <= 0) {
            setError("Amount must be greater than 0");
            return;
        }

        const manager = managerRef.current;
        if (!manager) {
            setError("Wallet not initialized");
            return;
        }

        const signer = manager.getSigner();
        if (!signer) {
            setError("No account selected. Please connect your wallet first.");
            return;
        }

        setSubmitting(true);
        const txId = generateId();
        const planckAmount = parseToPlanck(amount);

        const pendingTx: Transaction = {
            id: txId,
            txHash: "",
            from: selectedAddress || "",
            to: recipient,
            amount: planckAmount,
            timestamp: Date.now(),
            status: "pending",
        };
        setTransactions((prev) => [pendingTx, ...prev]);

        try {
            const api = await getApi();
            const tx = api.assetHub.tx.Balances.transfer_keep_alive({
                dest: { type: "Id", value: recipient },
                value: planckAmount,
            });

            const result = await submitAndWatch(tx, signer, {
                onStatus: (status: TxStatus) => setTxStatus(status),
            });

            setTransactions((prev) =>
                prev.map((t) =>
                    t.id === txId
                        ? {
                              ...t,
                              txHash: result.txHash,
                              status: result.ok ? "success" : "failed",
                              blockNumber: result.block.number,
                          }
                        : t,
                ),
            );
        } catch (e) {
            const message =
                e instanceof Error ? e.message : "Transaction failed";
            setError(message);
            setTransactions((prev) =>
                prev.map((t) =>
                    t.id === txId ? { ...t, status: "failed" } : t,
                ),
            );
        } finally {
            setSubmitting(false);
            setTxStatus(null);
        }
    }, [recipient, amount, selectedAddress]);

    const latestTx = transactions[0];

    return (
        <div className="space-y-8">
            <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold">Make Payment</h1>
                <p className="text-gray-400">
                    Send PAS tokens on Paseo Asset Hub
                </p>
            </div>

            {error && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300 text-sm">
                    {error}
                    <button
                        onClick={() => setError(null)}
                        className="ml-2 text-red-400 hover:text-red-200"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {walletStatus !== "connected" && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center space-y-4">
                    <p className="text-gray-400">
                        Connect your wallet to make a payment
                    </p>
                    <button
                        onClick={handleConnect}
                        disabled={walletStatus === "connecting"}
                        className="bg-[#E6007A] hover:bg-[#c70068] text-white font-medium py-3 px-8 rounded-lg transition-colors disabled:opacity-50"
                    >
                        {walletStatus === "connecting"
                            ? "Connecting..."
                            : "Connect Wallet"}
                    </button>
                </div>
            )}

            {walletStatus === "connected" && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-green-400 flex items-center gap-1.5">
                            <span className="w-2 h-2 bg-green-400 rounded-full inline-block" />
                            Connected
                        </span>
                        {selectedAddress && (
                            <span className="text-xs font-mono text-gray-500">
                                {truncateAddress(selectedAddress)}
                            </span>
                        )}
                    </div>

                    <div>
                        <label className="text-sm text-gray-400 block mb-1">
                            Recipient Address
                        </label>
                        <input
                            type="text"
                            value={recipient}
                            onChange={(e) => setRecipient(e.target.value)}
                            placeholder="5Grwva..."
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm font-mono text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#56F39A]"
                        />
                        {recipient && isValidSs58(recipient) && (
                            <p className="text-xs text-gray-500 mt-1">
                                {truncateAddress(recipient)}
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
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-2xl font-bold text-white placeholder-gray-600 focus:outline-none focus:border-[#56F39A]"
                        />
                    </div>

                    {memo && (
                        <div className="bg-gray-800/50 rounded-lg px-4 py-2">
                            <span className="text-xs text-gray-500">
                                Memo:
                            </span>
                            <span className="text-sm text-gray-300 ml-1">
                                {memo}
                            </span>
                        </div>
                    )}

                    {txStatus && (
                        <div className="flex items-center gap-2 text-sm">
                            <svg
                                className="animate-spin h-4 w-4 text-[#56F39A]"
                                viewBox="0 0 24 24"
                            >
                                <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                    fill="none"
                                />
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                />
                            </svg>
                            <span className="text-gray-400 capitalize">
                                {txStatus === "in-block"
                                    ? "Included in block"
                                    : txStatus}
                                ...
                            </span>
                        </div>
                    )}

                    <button
                        onClick={handleSubmitPayment}
                        disabled={submitting}
                        className="w-full bg-[#56F39A] hover:bg-[#3dd680] text-gray-900 font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50"
                    >
                        {submitting ? "Processing..." : "Send Payment"}
                    </button>
                </div>
            )}

            {latestTx && latestTx.status === "success" && (
                <div className="bg-green-900/20 border border-green-800 rounded-xl p-6 text-center space-y-2">
                    <div className="text-green-400 text-lg font-semibold">
                        Payment Successful
                    </div>
                    <p className="text-sm text-gray-400">
                        Sent{" "}
                        <span className="text-white font-semibold">
                            {formatPlanck(latestTx.amount)} PAS
                        </span>{" "}
                        to{" "}
                        <span className="font-mono text-gray-300">
                            {truncateAddress(latestTx.to)}
                        </span>
                    </p>
                    {latestTx.txHash && (
                        <p className="text-xs text-gray-500 font-mono">
                            Tx: {latestTx.txHash}
                        </p>
                    )}
                    {latestTx.blockNumber && (
                        <p className="text-xs text-gray-500">
                            Block: #{latestTx.blockNumber}
                        </p>
                    )}
                </div>
            )}

            {transactions.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                    <h2 className="text-lg font-semibold mb-4">
                        Recent Transactions
                    </h2>
                    <div className="space-y-3">
                        {transactions.map((tx) => (
                            <div
                                key={tx.id}
                                className="bg-gray-800/50 rounded-lg p-3 flex items-center justify-between"
                            >
                                <div className="space-y-1">
                                    <p className="text-sm font-mono text-gray-300">
                                        {tx.txHash
                                            ? truncateAddress(tx.txHash)
                                            : "Pending..."}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        To: {truncateAddress(tx.to)}
                                    </p>
                                </div>
                                <div className="text-right space-y-1">
                                    <p className="text-sm font-semibold">
                                        {formatPlanck(tx.amount)} PAS
                                    </p>
                                    <span
                                        className={`text-xs px-2 py-0.5 rounded-full ${
                                            tx.status === "success"
                                                ? "bg-green-900/40 text-green-400"
                                                : tx.status === "failed"
                                                  ? "bg-red-900/40 text-red-400"
                                                  : "bg-yellow-900/40 text-yellow-400"
                                        }`}
                                    >
                                        {tx.status}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
