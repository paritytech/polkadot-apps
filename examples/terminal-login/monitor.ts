/**
 * Statement Store Monitor
 *
 * Subscribes to ALL statements on a statement store chain and logs them.
 * Uses raw WebSocket + JSON-RPC — no polkadot-api dependency needed.
 *
 * Usage:
 *   npx tsx monitor.ts [endpoint]
 */
import { WebSocket } from "ws";

const endpoint = process.argv[2] || "wss://paseo-people-next-rpc.polkadot.io";

console.log();
console.log("  Statement Store Monitor");
console.log("  ~~~~~~~~~~~~~~~~~~~~~~~");
console.log(`  Endpoint: ${endpoint}`);
console.log();

let id = 0;
let count = 0;

/** Minimal SCALE field decoder for statement store statements. */
function decodeFields(hex: string) {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);

    const toHex = (b: Uint8Array) => Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");

    // SCALE Vec<Field>: compact length prefix, then fields
    let offset = 0;
    const vecLen = bytes[offset] >> 2; // compact mode 0
    offset += (bytes[offset] & 3) === 0 ? 1 : (bytes[offset] & 3) === 1 ? 2 : 4;

    const result: Record<string, string | number | null> = {};

    for (let f = 0; f < vecLen && offset < bytes.length; f++) {
        const tag = bytes[offset++];

        // Read compact-prefixed bytes
        function readCompactBytes(): Uint8Array {
            const mode = bytes[offset] & 3;
            let len: number;
            if (mode === 0) { len = bytes[offset] >> 2; offset += 1; }
            else if (mode === 1) { len = ((bytes[offset] | (bytes[offset+1] << 8)) >> 2) & 0x3fff; offset += 2; }
            else { len = ((bytes[offset] | (bytes[offset+1]<<8) | (bytes[offset+2]<<16) | (bytes[offset+3]<<24)) >>> 2); offset += 4; }
            const data = bytes.slice(offset, offset + len);
            offset += len;
            return data;
        }

        switch (tag) {
            case 0: { // Proof: sr25519 signature(64) + pubkey(32)
                const proof = readCompactBytes();
                if (proof.length >= 96) {
                    result.signer = toHex(proof.slice(64, 96));
                }
                break;
            }
            case 2: { // Expiry: u64 LE
                const expBytes = readCompactBytes();
                let val = 0n;
                for (let i = expBytes.length - 1; i >= 0; i--) val = (val << 8n) | BigInt(expBytes[i]);
                result.expiry = Number(val);
                break;
            }
            case 3: { // DecryptionKey
                readCompactBytes();
                break;
            }
            case 4: { // Topic1: 32 bytes
                const t = readCompactBytes();
                result.topic1 = toHex(t);
                break;
            }
            case 5: { // Topic2: 32 bytes
                const t = readCompactBytes();
                result.topic2 = toHex(t);
                break;
            }
            case 6: { // Channel: 32 bytes
                const ch = readCompactBytes();
                result.channel = toHex(ch);
                break;
            }
            case 8: { // Data
                const d = readCompactBytes();
                result.dataLen = d.length;
                break;
            }
            default: {
                // Unknown tag, try to skip
                readCompactBytes();
                break;
            }
        }
    }
    return result;
}

const ws = new WebSocket(endpoint, { followRedirects: true });

ws.on("error", (e) => {
    console.error(`  Connection error: ${e.message}`);
    process.exit(1);
});

ws.on("close", (code, reason) => {
    console.log(`  Connection closed: ${code} ${reason}`);
    process.exit(0);
});

ws.on("open", () => {
    console.log("  Connected.");
    console.log();

    // 1) Subscribe to ALL statements
    const subId = ++id;
    ws.send(JSON.stringify({
        jsonrpc: "2.0",
        id: subId,
        method: "statement_subscribeStatement",
        params: ["any"],
    }));
    console.log(`  Sent statement_subscribeStatement("any") [id=${subId}]`);

    // 2) Dump existing statements
    const dumpId = ++id;
    ws.send(JSON.stringify({
        jsonrpc: "2.0",
        id: dumpId,
        method: "statement_dump",
        params: [],
    }));
    console.log(`  Sent statement_dump [id=${dumpId}]`);

    // 3) Get genesis hash to confirm chain
    const genesisId = ++id;
    ws.send(JSON.stringify({
        jsonrpc: "2.0",
        id: genesisId,
        method: "chain_getBlockHash",
        params: [0],
    }));
    console.log(`  Sent chain_getBlockHash(0) [id=${genesisId}]`);

    console.log();
    console.log("  Waiting for messages... (Ctrl+C to stop)");
    console.log();
});

ws.on("message", (raw) => {
    const ts = new Date().toISOString().slice(11, 23);
    let msg: any;
    try {
        msg = JSON.parse(raw.toString());
    } catch {
        console.log(`  [${ts}] Non-JSON message: ${raw.toString().slice(0, 120)}`);
        return;
    }

    // RPC response (has id)
    if (msg.id != null) {
        if (msg.error) {
            console.log(`  [${ts}] RPC error (id=${msg.id}): ${msg.error.message || JSON.stringify(msg.error)}`);
        } else if (msg.id === 3) {
            // genesis hash response
            console.log(`  [${ts}] Genesis hash: ${msg.result}`);
            console.log(`           Expected:    0xe583155e68c7b71e9d2443f846eaba0016d0c38aa807884923545a7003f5bef0`);
            console.log();
        } else if (msg.id === 2) {
            // statement_dump response
            const stmts = Array.isArray(msg.result) ? msg.result : [];
            console.log(`  [${ts}] statement_dump: ${stmts.length} existing statement(s)`);
            for (const s of stmts.slice(0, 5)) {
                const preview = typeof s === "string" ? s.slice(0, 80) + "..." : JSON.stringify(s).slice(0, 80);
                console.log(`           - ${preview}`);
            }
            if (stmts.length > 5) console.log(`           ... and ${stmts.length - 5} more`);
            console.log();
        } else if (msg.id === 1) {
            console.log(`  [${ts}] Subscription confirmed: ${JSON.stringify(msg.result)}`);
            console.log();
        }
        return;
    }

    // Subscription notification (has params.subscription + params.result)
    if (msg.params?.result) {
        const event = msg.params.result;

        let statements: string[] = [];
        if (typeof event === "string") {
            statements = [event];
        } else if (Array.isArray(event?.statements)) {
            statements = event.statements;
        } else if (Array.isArray(event?.data?.statements)) {
            statements = event.data.statements;
        } else if (Array.isArray(event?.NewStatements?.statements)) {
            statements = event.NewStatements.statements;
        } else {
            console.log(`  [${ts}] Unknown notification: ${JSON.stringify(event).slice(0, 200)}`);
            return;
        }

        for (const hex of statements) {
            count++;
            console.log(`  [${ts}] ====== Statement #${count} ======`);
            console.log(`    Size: ${hex.length / 2} bytes`);
            // Decode SCALE fields to extract topics
            try {
                const decoded = decodeFields(hex);
                if (decoded.signer) console.log(`    Signer:  0x${decoded.signer}`);
                if (decoded.topic1) console.log(`    Topic1:  0x${decoded.topic1}`);
                if (decoded.topic2) console.log(`    Topic2:  0x${decoded.topic2}`);
                if (decoded.channel) console.log(`    Channel: 0x${decoded.channel}`);
                if (decoded.dataLen != null) console.log(`    Data:    ${decoded.dataLen} bytes`);
                if (decoded.expiry != null) console.log(`    Expiry:  ${decoded.expiry}`);
            } catch {
                // fallback: raw hex
            }
            console.log(`    Hex:  ${hex.slice(0, 160)}${hex.length > 160 ? "..." : ""}`);
            console.log();
        }
        return;
    }

    // Anything else
    console.log(`  [${ts}] Unknown message: ${JSON.stringify(msg).slice(0, 200)}`);
});

process.on("SIGINT", () => {
    console.log(`\n  Stopped. Saw ${count} new statement(s).`);
    ws.close();
    process.exit(0);
});
