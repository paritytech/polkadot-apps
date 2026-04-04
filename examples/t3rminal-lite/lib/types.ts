export interface Transaction {
    id: string;
    txHash: string;
    from: string;
    to: string;
    amount: bigint;
    timestamp: number;
    status: "success" | "failed" | "pending";
    blockNumber?: number;
}

export interface PaymentRequest {
    recipient: string;
    amount: string;
    memo?: string;
}

export function formatPlanck(planck: bigint, decimals = 10): string {
    const divisor = 10n ** BigInt(decimals);
    const whole = planck / divisor;
    const fraction = planck % divisor;
    const fractionStr = fraction.toString().padStart(decimals, "0").slice(0, 4);
    return `${whole}.${fractionStr}`;
}

export function parseToPlanck(amount: string, decimals = 10): bigint {
    const parts = amount.split(".");
    const whole = BigInt(parts[0] || "0");
    const fractionStr = (parts[1] || "").padEnd(decimals, "0").slice(0, decimals);
    return whole * 10n ** BigInt(decimals) + BigInt(fractionStr);
}

export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
