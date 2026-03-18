export type LogLevel = "error" | "warn" | "info" | "debug";

export interface LogEntry {
    level: LogLevel;
    namespace: string;
    message: string;
    data?: unknown;
    timestamp: number;
}

export type LogHandler = (entry: LogEntry) => void;

export interface LoggerConfig {
    /** Minimum log level. Default: "warn" */
    level?: LogLevel;
    /** If set, only these namespaces use the configured level; others stay at "warn". */
    namespaces?: string[];
    /** Custom output handler. Replaces default console output. */
    handler?: LogHandler;
}

export interface Logger {
    error(message: string, data?: unknown): void;
    warn(message: string, data?: unknown): void;
    info(message: string, data?: unknown): void;
    debug(message: string, data?: unknown): void;
}
