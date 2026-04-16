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
    const handle = {
        done: false,
        update(newDetail: string) {
            detail = newDetail;
        },
        succeed(msg?: string) {
            clearInterval(id);
            handle.done = true;
            process.stdout.write(`\r\x1b[2K${bold(label)} ${green("✔")} ${msg ?? detail}\n`);
        },
        fail(msg?: string) {
            clearInterval(id);
            handle.done = true;
            process.stdout.write(`\r\x1b[2K${bold(label)} ${red("✖")} ${msg ?? detail}\n`);
        },
    };
    return handle;
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
    const { test, expect, describe, vi, beforeEach } = import.meta.vitest;

    // ── truncate ──────────────────────────────────────────────────────
    describe("truncate", () => {
        test("returns string unchanged when shorter than max", () => {
            expect(truncate("hello", 10)).toBe("hello");
        });
        test("returns string unchanged when equal to max", () => {
            expect(truncate("hello", 5)).toBe("hello");
        });
        test("truncates with ellipsis when longer than max", () => {
            expect(truncate("hello world", 8)).toBe("hello w…");
        });
        test("handles empty string", () => {
            expect(truncate("", 5)).toBe("");
        });
        test("handles max of 1", () => {
            expect(truncate("hello", 1)).toBe("…");
        });
    });

    // ── ANSI helpers ──────────────────────────────────────────────────
    describe("color functions", () => {
        test("bold wraps with ANSI codes", () => {
            expect(bold("hi")).toBe("\x1b[1mhi\x1b[0m");
        });
        test("green wraps with color code", () => {
            expect(green("ok")).toBe("\x1b[32mok\x1b[0m");
        });
        test("red wraps with color code", () => {
            expect(red("err")).toBe("\x1b[31merr\x1b[0m");
        });
    });

    describe("stripAnsi", () => {
        test("removes ANSI escape sequences", () => {
            expect(stripAnsi(bold("hello"))).toBe("hello");
        });
        test("removes multiple color codes", () => {
            expect(stripAnsi(`${green("a")} ${red("b")}`)).toBe("a b");
        });
        test("returns plain string unchanged", () => {
            expect(stripAnsi("plain")).toBe("plain");
        });
        test("handles empty string", () => {
            expect(stripAnsi("")).toBe("");
        });
    });

    describe("padEndVisible", () => {
        test("pads plain string to width", () => {
            expect(padEndVisible("hi", 5)).toBe("hi   ");
        });
        test("pads colored string to visible width", () => {
            const colored = green("hi");
            const padded = padEndVisible(colored, 5);
            expect(stripAnsi(padded)).toBe("hi   ");
            expect(padded).toContain("\x1b[32m"); // still has color
        });
        test("does not pad when already at width", () => {
            expect(padEndVisible("hello", 5)).toBe("hello");
        });
        test("does not truncate when over width", () => {
            expect(padEndVisible("hello!", 3)).toBe("hello!");
        });
    });

    // ── printTable ────────────────────────────────────────────────────
    describe("printTable", () => {
        test("outputs formatted table", () => {
            const logs: string[] = [];
            vi.spyOn(console, "log").mockImplementation((s: string) => logs.push(s));
            printTable(
                ["A", "B"],
                [
                    ["1", "22"],
                    ["333", "4"],
                ],
            );
            vi.restoreAllMocks();

            expect(logs.length).toBe(4); // header + separator + 2 rows
            // Check separator uses ─ and ┼
            expect(stripAnsi(logs[1])).toMatch(/─+┼─+/);
            // Check alignment: column widths should accommodate "333" and "22"
            const headerRow = stripAnsi(logs[0]);
            const dataRow = stripAnsi(logs[2]);
            expect(headerRow.length).toBe(dataRow.length);
        });

        test("handles empty rows", () => {
            const logs: string[] = [];
            vi.spyOn(console, "log").mockImplementation((s: string) => logs.push(s));
            printTable(["X"], []);
            vi.restoreAllMocks();

            expect(logs.length).toBe(2); // header + separator only
        });
    });

    // ── spinner ───────────────────────────────────────────────────────
    describe("spinner", () => {
        beforeEach(() => {
            vi.useFakeTimers();
            vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        });

        test("succeed sets done to true and writes checkmark", () => {
            const s = spinner("Test", "working...");
            expect(s.done).toBe(false);
            s.succeed("done!");
            expect(s.done).toBe(true);
            const calls = vi.mocked(process.stdout.write).mock.calls;
            const last = calls[calls.length - 1][0] as string;
            expect(last).toContain("✔");
            expect(last).toContain("done!");
            vi.useRealTimers();
            vi.restoreAllMocks();
        });

        test("fail sets done to true and writes X", () => {
            const s = spinner("Test", "working...");
            s.fail("oops");
            expect(s.done).toBe(true);
            const calls = vi.mocked(process.stdout.write).mock.calls;
            const last = calls[calls.length - 1][0] as string;
            expect(last).toContain("✖");
            expect(last).toContain("oops");
            vi.useRealTimers();
            vi.restoreAllMocks();
        });

        test("update changes the detail text", () => {
            const s = spinner("Test", "old");
            s.update("new");
            vi.advanceTimersByTime(100);
            const calls = vi.mocked(process.stdout.write).mock.calls;
            const last = calls[calls.length - 1][0] as string;
            expect(last).toContain("new");
            expect(last).not.toContain("old");
            s.succeed();
            vi.useRealTimers();
            vi.restoreAllMocks();
        });

        test("succeed uses detail as default message", () => {
            const s = spinner("Test", "status");
            s.succeed();
            const calls = vi.mocked(process.stdout.write).mock.calls;
            const last = calls[calls.length - 1][0] as string;
            expect(last).toContain("status");
            vi.useRealTimers();
            vi.restoreAllMocks();
        });
    });
}
