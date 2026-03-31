# @polkadot-apps/logger

Structured, namespace-filtered logging for the @polkadot-apps ecosystem.

## Install

```bash
pnpm add @polkadot-apps/logger
# or
npm install @polkadot-apps/logger
```

No additional dependencies required.

## Quick Start

```typescript
import { createLogger } from "@polkadot-apps/logger";

const log = createLogger("my-module");

log.error("connection failed", { endpoint: "wss://rpc.polkadot.io" });
log.warn("retry limit approaching", { attempt: 3, max: 5 });
log.info("connected", { chain: "Polkadot" });
log.debug("block received", { number: 21_000_000 });
```

The default log level is `"warn"`, so only `error` and `warn` messages are emitted out of the box.

## Basic Usage

Each logger is scoped to a namespace. Namespaces appear in every log entry, making it straightforward to trace output back to the originating module.

```typescript
import { createLogger } from "@polkadot-apps/logger";

const rpcLog = createLogger("rpc");
const txLog = createLogger("tx-pool");

rpcLog.info("subscribed to new heads");
txLog.debug("pending extrinsic", { hash: "0xabc..." });
```

## Configuration

Use `configure` to change the global log level, filter by namespace, or install a custom handler.

```typescript
import { configure } from "@polkadot-apps/logger";

configure({
  level: "debug", // show all messages
});
```

### Set Level and Namespace Filter

```typescript
import { configure } from "@polkadot-apps/logger";

configure({
  level: "info",
  namespaces: ["rpc", "tx-pool"], // only these namespaces emit
});
```

### Environment Variables

You can configure logging without code changes by setting environment variables before the process starts.

| Variable | Purpose | Example |
|---|---|---|
| `POLKADOT_APPS_LOG` | Set the global log level. | `POLKADOT_APPS_LOG=debug` |
| `POLKADOT_APPS_LOG_NS` | Comma-separated list of namespaces to include. | `POLKADOT_APPS_LOG_NS=rpc,tx-pool` |

Environment variables are read once at initialization. Calling `configure` overrides them.

## Custom Handlers

Replace the default `console` output with any function that accepts a `LogEntry`.

```typescript
import { configure } from "@polkadot-apps/logger";
import type { LogEntry } from "@polkadot-apps/logger";

configure({
  handler: (entry: LogEntry) => {
    // Send to an external service
    fetch("/api/logs", {
      method: "POST",
      body: JSON.stringify(entry),
    });
  },
});
```

### Structured JSON Logging

```typescript
import { configure } from "@polkadot-apps/logger";

configure({
  level: "debug",
  handler: (entry) => {
    process.stdout.write(JSON.stringify(entry) + "\n");
  },
});
```

## Namespace Filtering

When `namespaces` is set, only loggers whose namespace appears in the list produce output. All other loggers are silenced regardless of log level.

```typescript
import { configure, createLogger } from "@polkadot-apps/logger";

configure({ level: "debug", namespaces: ["rpc"] });

const rpcLog = createLogger("rpc");
const uiLog = createLogger("ui");

rpcLog.debug("this is emitted"); // visible
uiLog.debug("this is silenced"); // filtered out
```

## API

| Function | Signature | Description |
|---|---|---|
| `createLogger` | `(namespace: string) => Logger` | Create a namespaced logger with `error`, `warn`, `info`, and `debug` methods. |
| `configure` | `(config: LoggerConfig) => void` | Set the global log level, namespace filter, and/or custom handler. |

## Types

```typescript
/** Log severity levels, ordered from most to least severe. */
type LogLevel = "error" | "warn" | "info" | "debug";

/** A single structured log entry. */
interface LogEntry {
  level: LogLevel;
  namespace: string;
  message: string;
  data?: unknown;
  timestamp: number;
}

/** A function that receives log entries for custom output. */
type LogHandler = (entry: LogEntry) => void;

/** Global logger configuration. */
interface LoggerConfig {
  /** Minimum severity to emit. Default: "warn". */
  level?: LogLevel;
  /** When set, only matching namespaces produce output. */
  namespaces?: string[];
  /** Replace the default console handler. */
  handler?: LogHandler;
}

/** A namespaced logger instance. */
interface Logger {
  error(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  debug(message: string, data?: unknown): void;
}
```

## License

Apache-2.0
