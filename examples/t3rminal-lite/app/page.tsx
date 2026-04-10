"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { truncateAddress } from "@polkadot-apps/address";
import type { SignerAccount } from "@polkadot-apps/signer";
import { getSignerManager, destroySignerManager } from "@/lib/wallet";
import { getBalance, cleanup } from "@/lib/chain";
import { formatPlanck } from "@polkadot-apps/utils";
import type { Transaction } from "@/lib/types";

type ConnectionStatus = "disconnected" | "connecting" | "connected";

export default function HomePage() {
    const [status, setStatus] = useState<ConnectionStatus>("disconnected");
    const [accounts, setAccounts] = useState<readonly SignerAccount[]>([]);
    const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
    const [balance, setBalance] = useState<bigint | null>(null);
    const [balanceLoading, setBalanceLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const managerRef = useRef<ReturnType<typeof getSignerManager> | null>(null);

    useEffect(() => {
        const manager = getSignerManager();
        managerRef.current = manager;

        const unsub = manager.subscribe((state) => {
            setStatus(state.status);
            setAccounts(state.accounts);
            if (state.selectedAccount) {
                setSelectedAddress(state.selectedAccount.address);
            }
            if (state.error) {
                setError(state.error.message);
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

    const handleDisconnect = useCallback(() => {
        const manager = managerRef.current;
        if (!manager) return;
        manager.disconnect();
        setSelectedAddress(null);
        setBalance(null);
        setTransactions([]);
    }, []);

    const handleSelectAccount = useCallback((address: string) => {
        const manager = managerRef.current;
        if (!manager) return;
        manager.selectAccount(address);
        setBalance(null);
    }, []);

    const fetchBalance = useCallback(async () => {
        if (!selectedAddress) return;
        setBalanceLoading(true);
        try {
            const bal = await getBalance(selectedAddress);
            setBalance(bal.free);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to fetch balance");
        } finally {
            setBalanceLoading(false);
        }
    }, [selectedAddress]);

    useEffect(() => {
        if (selectedAddress) {
            fetchBalance();
        }
    }, [selectedAddress, fetchBalance]);

    return (
        <div className="space-y-8">
            <div className="text-center space-y-2">
                <h1 className="text-4xl font-bold">
                    <span className="text-[#E6007A]">t3rminal</span>
                    <span className="text-gray-400">-lite</span>
                </h1>
                <p className="text-gray-400">
                    Decentralized payment terminal on Paseo Asset Hub
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

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-semibold">Wallet Connection</h2>

                {status === "disconnected" && (
                    <button
                        onClick={handleConnect}
                        className="w-full bg-[#E6007A] hover:bg-[#c70068] text-white font-medium py-3 px-6 rounded-lg transition-colors"
                    >
                        Connect Wallet
                    </button>
                )}

                {status === "connecting" && (
                    <div className="flex items-center justify-center py-3 text-gray-400">
                        <svg
                            className="animate-spin h-5 w-5 mr-2"
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
                        Connecting...
                    </div>
                )}

                {status === "connected" && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-green-400 flex items-center gap-1.5">
                                <span className="w-2 h-2 bg-green-400 rounded-full inline-block" />
                                Connected
                            </span>
                            <button
                                onClick={handleDisconnect}
                                className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
                            >
                                Disconnect
                            </button>
                        </div>

                        {accounts.length > 1 && (
                            <div>
                                <label className="text-sm text-gray-400 block mb-1">
                                    Select Account
                                </label>
                                <select
                                    value={selectedAddress || ""}
                                    onChange={(e) =>
                                        handleSelectAccount(e.target.value)
                                    }
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#E6007A]"
                                >
                                    {accounts.map((account) => (
                                        <option
                                            key={account.address}
                                            value={account.address}
                                        >
                                            {account.name ||
                                                truncateAddress(
                                                    account.address,
                                                )}{" "}
                                            ({truncateAddress(account.address)})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {selectedAddress && (
                            <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
                                <div>
                                    <span className="text-xs text-gray-500 uppercase tracking-wider">
                                        Address
                                    </span>
                                    <p className="text-sm font-mono text-gray-300 break-all">
                                        {selectedAddress}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-xs text-gray-500 uppercase tracking-wider">
                                        Balance (PAS)
                                    </span>
                                    <p className="text-2xl font-bold text-white">
                                        {balanceLoading
                                            ? "Loading..."
                                            : balance !== null
                                              ? formatPlanck(balance)
                                              : "--"}
                                    </p>
                                </div>
                                <button
                                    onClick={fetchBalance}
                                    disabled={balanceLoading}
                                    className="text-sm text-[#E6007A] hover:text-[#ff339a] transition-colors disabled:opacity-50"
                                >
                                    Refresh Balance
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {status === "connected" && selectedAddress && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <a
                        href={`/terminal/?address=${encodeURIComponent(selectedAddress)}`}
                        className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-[#E6007A] transition-colors group"
                    >
                        <h3 className="text-lg font-semibold group-hover:text-[#E6007A] transition-colors">
                            Merchant Terminal
                        </h3>
                        <p className="text-sm text-gray-400 mt-1">
                            Generate payment QR codes for customers
                        </p>
                    </a>
                    <a
                        href="/pay/"
                        className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-[#56F39A] transition-colors group"
                    >
                        <h3 className="text-lg font-semibold group-hover:text-[#56F39A] transition-colors">
                            Make Payment
                        </h3>
                        <p className="text-sm text-gray-400 mt-1">
                            Pay a merchant by entering their details
                        </p>
                    </a>
                </div>
            )}

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-lg font-semibold mb-4">
                    Transaction History
                </h2>
                {transactions.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-8">
                        No transactions yet. Make a payment to see it here.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {transactions.map((tx) => (
                            <div
                                key={tx.id}
                                className="bg-gray-800/50 rounded-lg p-3 flex items-center justify-between"
                            >
                                <div className="space-y-1">
                                    <p className="text-sm font-mono text-gray-300">
                                        {truncateAddress(tx.txHash)}
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
                )}
            </div>
        </div>
    );
}
