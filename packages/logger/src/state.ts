import type { LogHandler, LogLevel } from "./types";

export const LEVEL_VALUES: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};

const DEFAULT_LEVEL: LogLevel = "warn";

function readEnv(key: string): string | undefined {
    if (typeof process !== "undefined" && process.env?.[key]) return process.env[key];
    try {
        return localStorage.getItem(key) ?? undefined;
    } catch {
        return undefined;
    }
}

function getInitialLevel(): LogLevel {
    const raw = readEnv("POLKADOT_APPS_LOG");
    return raw && raw in LEVEL_VALUES ? (raw as LogLevel) : DEFAULT_LEVEL;
}

function getInitialNamespaces(): Set<string> | undefined {
    const raw = readEnv("POLKADOT_APPS_LOG_NS");
    if (!raw) return undefined;
    const ns = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return ns.length > 0 ? new Set(ns) : undefined;
}

/** Mutable global state — modified by configure(), read by every logger instance. */
export const state = {
    level: getInitialLevel(),
    namespaces: getInitialNamespaces(),
    handler: undefined as LogHandler | undefined,
};

export function getEffectiveLevel(namespace: string): number {
    if (state.namespaces && !state.namespaces.has(namespace)) {
        return LEVEL_VALUES[DEFAULT_LEVEL];
    }
    return LEVEL_VALUES[state.level];
}

export function resetState(): void {
    state.level = DEFAULT_LEVEL;
    state.namespaces = undefined;
    state.handler = undefined;
}
