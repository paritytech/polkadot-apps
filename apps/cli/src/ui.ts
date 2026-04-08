// Terminal formatting helpers

export const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
export const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
export const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
export const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
export const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
export const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
export const magenta = (s: string) => `\x1b[35m${s}\x1b[0m`;

// Spinner for async operations
export function spinner(label: string, detail: string) {
    let i = 0;
    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    const id = setInterval(() => {
        process.stdout.write(`\r\x1b[2K${bold(label)} ${frames[i++ % frames.length]} ${detail}`);
    }, 80);
    return {
        update(newDetail: string) {
            detail = newDetail;
        },
        succeed(msg?: string) {
            clearInterval(id);
            process.stdout.write(`\r\x1b[2K${bold(label)} ${green("✔")} ${msg ?? detail}\n`);
        },
        fail(msg?: string) {
            clearInterval(id);
            process.stdout.write(`\r\x1b[2K${bold(label)} ${red("✖")} ${msg ?? detail}\n`);
        },
    };
}

// Strip ANSI escape sequences for visible-length measurement
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

// Pad string to visible width, accounting for ANSI codes
function padEndVisible(s: string, width: number): string {
    const visible = stripAnsi(s).length;
    return s + " ".repeat(Math.max(0, width - visible));
}

// Table formatting
export function printTable(headers: string[], rows: string[][]) {
    const colWidths = headers.map((h, i) =>
        Math.max(stripAnsi(h).length, ...rows.map((r) => stripAnsi(r[i] ?? "").length)),
    );

    const sep = colWidths.map((w) => "─".repeat(w + 2)).join("┼");
    const fmtRow = (row: string[]) =>
        row.map((cell, i) => ` ${padEndVisible(cell ?? "", colWidths[i])} `).join("│");

    console.log(dim(fmtRow(headers)));
    console.log(dim(sep));
    for (const row of rows) {
        console.log(fmtRow(row));
    }
}

// Truncate string
export function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

if (import.meta.vitest) {
    const { test, expect } = import.meta.vitest;

    test("truncate returns string unchanged when shorter than max", () => {
        expect(truncate("hello", 10)).toBe("hello");
    });

    test("truncate returns string unchanged when equal to max", () => {
        expect(truncate("hello", 5)).toBe("hello");
    });

    test("truncate with ellipsis when longer than max", () => {
        expect(truncate("hello world", 8)).toBe("hello w…");
    });

    test("truncate handles empty string", () => {
        expect(truncate("", 5)).toBe("");
    });

    test("truncate handles max of 1", () => {
        expect(truncate("hello", 1)).toBe("…");
    });
}
