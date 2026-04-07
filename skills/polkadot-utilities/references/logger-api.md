# Logger API Reference

Package: `@polkadot-apps/logger`

## Table of Contents

- [configure](#configure)
- [createLogger](#createlogger)
- [Types](#types)
  - [LogLevel](#loglevel)
  - [LogEntry](#logentry)
  - [LogHandler](#loghandler)
  - [LoggerConfig](#loggerconfig)
  - [Logger](#logger)
- [Namespace Filtering](#namespace-filtering)
- [Environment Variables](#environment-variables)
- [Default Behavior](#default-behavior)

---

## configure

Set global logging configuration. Affects all existing and future logger instances immediately.

```ts
function configure(config: LoggerConfig): void
```

**Parameters:**
- `config` - A [LoggerConfig](#loggerconfig) object. Only provided fields are updated; omitted fields retain their current values.

```ts
import { configure } from "@polkadot-apps/logger";

// Show all log levels
configure({ level: "debug" });

// Only elevate specific namespaces, with custom handler
configure({
  level: "debug",
  namespaces: ["auth", "tx"],
  handler: (entry) => {
    fetch("/api/logs", {
      method: "POST",
      body: JSON.stringify(entry),
    });
  },
});

// Reset to default console output (remove custom handler)
configure({ handler: undefined });

// Clear namespace filter (apply level globally)
configure({ namespaces: [] });
```

---

## createLogger

Create a namespaced logger instance. The namespace string is included in every log entry and used for namespace filtering.

```ts
function createLogger(namespace: string): Logger
```

**Parameters:**
- `namespace` - A string identifying the source module (e.g. `"storage"`, `"tx"`, `"auth"`).

**Returns:** A [Logger](#logger) object with `error`, `warn`, `info`, and `debug` methods.

```ts
import { createLogger } from "@polkadot-apps/logger";

const log = createLogger("my-feature");

log.error("Connection failed", { url: "wss://rpc.example.com", code: 1006 });
log.warn("Retrying in 5s");
log.info("Connected to chain", { chain: "polkadot" });
log.debug("Block received", { number: 12345678 });
```

Each log method has the signature:

```ts
(message: string, data?: unknown) => void
```

- `message` - Human-readable log message.
- `data` - Optional structured data attached to the log entry.

---

## Types

### LogLevel

```ts
type LogLevel = "error" | "warn" | "info" | "debug";
```

Severity ordering (most to least severe): `error` < `warn` < `info` < `debug`.

Setting the level to `"info"` means `error`, `warn`, and `info` are emitted, but `debug` is suppressed.

---

### LogEntry

The structured object passed to a custom [LogHandler](#loghandler).

```ts
interface LogEntry {
  level: LogLevel;
  namespace: string;
  message: string;
  data?: unknown;
  timestamp: number;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `level` | `LogLevel` | The severity level of this entry. |
| `namespace` | `string` | The namespace string from `createLogger()`. |
| `message` | `string` | The log message. |
| `data` | `unknown` | Optional structured data. |
| `timestamp` | `number` | Unix timestamp in milliseconds (`Date.now()`). |

---

### LogHandler

A function that receives log entries. When set via `configure()`, replaces the default console output.

```ts
type LogHandler = (entry: LogEntry) => void;
```

```ts
import { configure, type LogEntry } from "@polkadot-apps/logger";

const entries: LogEntry[] = [];
configure({ handler: (entry) => entries.push(entry) });
```

---

### LoggerConfig

Configuration object for `configure()`.

```ts
interface LoggerConfig {
  level?: LogLevel;
  namespaces?: string[];
  handler?: LogHandler;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `level` | `LogLevel` | `"warn"` | Minimum log level. |
| `namespaces` | `string[]` | `undefined` | If set, only these namespaces use the configured level; others stay at `"warn"`. Pass `[]` to clear the filter. |
| `handler` | `LogHandler` | `undefined` | Custom output handler. Replaces default console output. Pass `undefined` to restore console output. |

---

### Logger

The logger instance returned by `createLogger()`.

```ts
interface Logger {
  error(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  debug(message: string, data?: unknown): void;
}
```

---

## Namespace Filtering

When `namespaces` is configured, it creates a two-tier system:

1. **Listed namespaces** use the configured `level` (e.g. `"debug"`).
2. **All other namespaces** fall back to the default level (`"warn"`), meaning only `error` and `warn` are emitted.

This allows targeted verbose logging without noise from the rest of the application.

```ts
import { configure, createLogger } from "@polkadot-apps/logger";

configure({
  level: "debug",
  namespaces: ["auth", "keys"],
  handler: (entry) => console.log(entry),
});

const authLog = createLogger("auth");
const networkLog = createLogger("network");

authLog.debug("Token refreshed");     // EMITTED (namespace in list, level=debug)
networkLog.debug("Ping sent");        // SUPPRESSED (namespace not in list, falls back to warn)
networkLog.error("Connection lost");  // EMITTED (error >= warn)
```

Pass an empty array to clear namespace filtering and apply the level globally:

```ts
configure({ namespaces: [] }); // all namespaces now use the configured level
```

---

## Environment Variables

The logger reads initial configuration from environment variables (or `localStorage` keys in the browser):

| Variable | Description | Example |
|----------|-------------|---------|
| `POLKADOT_APPS_LOG` | Initial log level | `"debug"`, `"info"`, `"warn"`, `"error"` |
| `POLKADOT_APPS_LOG_NS` | Comma-separated namespace filter | `"keys, storage, tx"` |

These are read once at module load time. Subsequent `configure()` calls override them.

```bash
POLKADOT_APPS_LOG=debug POLKADOT_APPS_LOG_NS=auth,tx pnpm dev
```

---

## Default Behavior

- **Default level:** `"warn"` (only `error` and `warn` are emitted).
- **Default handler:** `undefined` (uses `console.error`, `console.warn`, `console.info`, `console.debug` with `[namespace]` prefix).
- **Default namespaces:** `undefined` (no filter, level applies to all namespaces).

Console output format (when no custom handler):
```
[namespace] message
[namespace] message { structured: "data" }
```
