import { state } from "./state.js";
import type { LoggerConfig } from "./types.js";

export function configure(config: LoggerConfig): void {
    if (config.level !== undefined) {
        state.level = config.level;
    }
    if (config.namespaces !== undefined) {
        state.namespaces = config.namespaces.length > 0 ? new Set(config.namespaces) : undefined;
    }
    if (config.handler !== undefined) {
        state.handler = config.handler;
    }
}
