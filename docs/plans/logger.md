# Plan: Implement `@polkadot-apps/logger`

## Context

The monorepo currently has zero logging. As packages grow to include I/O (chain-client, storage), we need structured, configurable logging. The user wants:
- **Global configuration** — call `configure()` once at app startup, not per-call injection
- **Default levels** — errors and warnings always on, debug/info off by default
- **Easy namespace filtering** — elevate log level for specific packages without noise from others
- **Zero dependencies** — pure TypeScript, uses native `console` methods
- **Env var / localStorage auto-config** — zero-code-change knob for dev/debugging

---

## API Design

### Zero-config via environment (no code needed)

```sh
# Node.js / CLI
POLKADOT_APPS_LOG=debug pnpm start
POLKADOT_APPS_LOG=debug POLKADOT_APPS_LOG_NS=keys,chain-client pnpm start
```

```js
// Browser (dev tools console)
localStorage.setItem("POLKADOT_APPS_LOG", "debug");
localStorage.setItem("POLKADOT_APPS_LOG_NS", "keys,chain-client");
// Reload — debug logs now visible
```

### Programmatic via `configure()` (overrides env)

```ts
import { configure } from "@polkadot-apps/logger";

// At app entry point — optional, defaults are sensible
configure({
    level: "debug",                      // global minimum level
    namespaces: ["keys", "chain-client"], // only these get elevated; others stay at "warn"
    handler: (entry) => sendToSentry(entry), // optional: replace console output entirely
});
```

### Precedence: `configure()` > env var / localStorage > default (`"warn"`)

### For package authors (internal)

```ts
import { createLogger } from "@polkadot-apps/logger";

const log = createLogger("keys");  // module-level, lazy config reads

log.debug("deriving account", { context });
log.error("derivation failed", { err });
```

---

## Log Levels

| Level | Value | Default | Console method |
|-------|-------|---------|----------------|
| error | 0     | ON      | `console.error` |
| warn  | 1     | ON      | `console.warn`  |
| info  | 2     | OFF     | `console.info`  |
| debug | 3     | OFF     | `console.debug` |

Default level: `"warn"` — errors and warnings always shown, info/debug suppressed.

### Namespace filtering

When `configure({ level: "debug", namespaces: ["keys"] })`:
- `keys` namespace → debug and above (all 4 levels)
- All other namespaces → fall back to default `"warn"` (errors + warnings only)
- If `namespaces` is omitted → configured level applies globally

---

## File Structure

```
packages/logger/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts           # public re-exports
    ├── types.ts           # LogLevel, LogEntry, LogHandler, LoggerConfig, Logger
    ├── state.ts           # global mutable config singleton + getEffectiveLevel()
    ├── configure.ts       # configure() function
    └── create-logger.ts   # createLogger() factory + in-source tests
```

---

## Key Implementation Details

### Environment auto-detection (`state.ts`)

At module load time, reads initial config from the environment:

```ts
function readEnv(key: string): string | undefined {
    // Node.js / edge runtimes
    if (typeof process !== "undefined" && process.env?.[key]) return process.env[key];
    // Browser
    try { return localStorage.getItem(key) ?? undefined; } catch { return undefined; }
}

function getInitialLevel(): LogLevel {
    const raw = readEnv("POLKADOT_APPS_LOG");
    return raw && raw in LEVEL_VALUES ? (raw as LogLevel) : "warn";
}

function getInitialNamespaces(): Set<string> | undefined {
    const raw = readEnv("POLKADOT_APPS_LOG_NS");
    if (!raw) return undefined;
    const ns = raw.split(",").map((s) => s.trim()).filter(Boolean);
    return ns.length > 0 ? new Set(ns) : undefined;
}
```

### Global singleton (`state.ts`)

Mutable config object initialized from env, read lazily by all logger instances at call time:
- Initial values come from `POLKADOT_APPS_LOG` / `POLKADOT_APPS_LOG_NS` (env var or localStorage)
- `configure()` can be called at any point and overrides env values, retroactively affecting all loggers
- Import order doesn't matter — loggers created before `configure()` still respect it
- `resetState()` exported only for testing (not in public API)

### Level checking (`create-logger.ts`)

```ts
function emit(level, namespace, message, data?) {
    if (LEVEL_VALUES[level] > getEffectiveLevel(namespace)) return; // O(1) check
    // Only allocate LogEntry after passing the check
    const entry = { level, namespace, message, data, timestamp: Date.now() };
    if (state.handler) { state.handler(entry); return; }
    CONSOLE_METHODS[level](`[${namespace}]`, message, ...);
}
```

Zero cost when disabled — just a numeric comparison + Set lookup.

---

## Dependencies

**`packages/logger/package.json`:**
- Zero runtime dependencies
- `devDependencies`: `"typescript": "catalog:"`

---

## In-Source Tests

In `create-logger.ts` using `if (import.meta.vitest)`:

1. **Default levels**: error + warn emitted, info + debug suppressed
2. **Debug level**: all 4 levels emitted when `level: "debug"`
3. **Namespace filtering**: elevated namespace gets debug, others stay at warn
4. **Custom handler**: receives structured `LogEntry` objects
5. **Data passthrough**: `data` field included in entry
6. **Timestamp**: entry includes valid timestamp
7. **Env var override**: `process.env.POLKADOT_APPS_LOG` sets initial level
8. **Env var namespaces**: `process.env.POLKADOT_APPS_LOG_NS` sets initial namespace filter
9. **configure() overrides env**: programmatic config takes precedence

---

## Implementation Sequence

1. Create `packages/logger/package.json` and `tsconfig.json`
2. Write `src/types.ts`
3. Write `src/state.ts`
4. Write `src/configure.ts`
5. Write `src/create-logger.ts` with in-source tests
6. Write `src/index.ts`
7. `pnpm install` to link workspace package
8. `pnpm build` and `pnpm test`
9. `pnpm changeset`

---

## Files to Create

- **Create** `packages/logger/package.json`
- **Create** `packages/logger/tsconfig.json`
- **Create** `packages/logger/src/types.ts`
- **Create** `packages/logger/src/state.ts`
- **Create** `packages/logger/src/configure.ts`
- **Create** `packages/logger/src/create-logger.ts`
- **Create** `packages/logger/src/index.ts`

## Verification

```sh
pnpm install
pnpm --filter @polkadot-apps/logger build
pnpm test
pnpm format:check
```
