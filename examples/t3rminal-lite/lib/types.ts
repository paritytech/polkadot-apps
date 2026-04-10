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


export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
