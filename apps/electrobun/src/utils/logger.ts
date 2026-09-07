import type { LogEntry, LogLevel } from "./log-buffer";
import type { TraceChannel } from "./trace";
import { LogBuffer } from "./log-buffer";
import { isAnyTraceOn, isTraceOn } from "./trace";

export type { LogLevel } from "./log-buffer";

/**
 * The client logger.
 *
 * `createLogger(tag)` keeps the shape it always had — the ~110 call sites in
 * `src/` did not change — but three things are new:
 *
 *  - Every entry lands in a ring buffer (`log-buffer.ts`) with a timestamp,
 *    and `log-shipper.ts` writes it to disk beside the server journals. A bug
 *    that shows up twenty minutes in is now recoverable after the fact.
 *  - `debug` no longer goes to `console.debug`, which Chrome hides behind its
 *    "Verbose" filter by default. It is always recorded; it reaches the
 *    console when the console level allows it.
 *  - `trace(channel, thunk)` is the hot-path form. The thunk is not called
 *    unless the channel is armed, so a trace on the animation loop costs a
 *    property read when it is off. The older calls build their message before
 *    the logger can decide to drop it — fine at a few per click, not fine per
 *    frame.
 */

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * How much history the ring holds. Roughly twenty minutes of ordinary play at
 * the rate the permanent instrumentation logs, and a couple of minutes with
 * the `net` channel armed.
 */
const BUFFER_CAPACITY = 2_000;

export const logBuffer = new LogBuffer(BUFFER_CAPACITY);

/**
 * Console threshold. `null` means "decide from the trace channels": `debug`
 * shows once anything is armed, because that is what arming means, and stays
 * out of the way otherwise. `setLogLevel` pins it explicitly.
 */
let consoleLevel: LogLevel | null = null;

export function setLogLevel(level: LogLevel | null): void {
  consoleLevel = level;
}

function shouldPrint(level: LogLevel): boolean {
  const threshold = consoleLevel ?? (isAnyTraceOn() ? "debug" : "info");

  return LEVEL_ORDER[level] >= LEVEL_ORDER[threshold];
}

const CONSOLE_METHOD: Record<LogLevel, "log" | "warn" | "error"> = {
  debug: "log",
  info: "log",
  warn: "warn",
  error: "error",
};

function emit(
  level: LogLevel,
  tag: string,
  msg: string,
  args: unknown[]
): void {
  // Recorded in every build, not just dev ones. The ring is bounded and the
  // work per entry is a `Date.now()`, one object and two `includes` — at the
  // rate this logger is actually called (a handful per click, never per frame:
  // that is what `trace` is for) it does not show up in a frame budget. What
  // *is* dev-only is reading it: the shipper and the `window.__` handles.
  const entry = logBuffer.push(level, tag, msg, args);

  if (!shouldPrint(level)) {
    return;
  }

  // Print the redacted text rather than the original, so what is on screen and
  // what is on disk are the same line.
  console[CONSOLE_METHOD[level]](`[${tag}]`, entry.msg, ...args);
}

export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  /**
   * Hot-path logging. `build` runs only when `channel` is armed — never call
   * it for something you would rather compute eagerly.
   */
  trace(channel: TraceChannel, build: () => string): void;
}

export function createLogger(tag: string): Logger {
  return {
    debug(msg: string, ...args: unknown[]): void {
      emit("debug", tag, msg, args);
    },
    info(msg: string, ...args: unknown[]): void {
      emit("info", tag, msg, args);
    },
    warn(msg: string, ...args: unknown[]): void {
      emit("warn", tag, msg, args);
    },
    error(msg: string, ...args: unknown[]): void {
      emit("error", tag, msg, args);
    },
    trace(channel: TraceChannel, build: () => string): void {
      if (!isTraceOn(channel)) {
        return;
      }

      emit("debug", tag, build(), []);
    },
  };
}

/** Everything the ring holds, oldest first. Backs `window.__dumpLogs()`. */
export function dumpLogs(): readonly LogEntry[] {
  return logBuffer.snapshot();
}
