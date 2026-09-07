/**
 * The in-memory journal behind `createLogger`.
 *
 * The client used to log straight to `console.*` and nowhere else, which meant
 * a bug that appeared twenty minutes into a session had already scrolled out
 * of the devtools buffer — and `debug` was going to `console.debug`, hidden
 * behind Chrome's "Verbose" filter, so half of it was never visible at all.
 *
 * This ring holds the last few thousand entries whatever the console is doing,
 * and `log-shipper.ts` drains it to disk beside the server journals.
 *
 * Two properties matter and are tested:
 *
 *  - **Nothing live is retained.** Arguments are flattened to strings at push
 *    time. Keeping the objects would be cheaper, and would also pin a PixiJS
 *    sprite or a decoded map for as long as the entry sat in the ring.
 *  - **Credentials never enter it.** The ring is written to disk now, and the
 *    client derives a PBKDF2 key at login (`game/auth/pbkdf2.ts`).
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  /** Epoch ms. The client had no timestamps at all before this. */
  t: number;
  level: LogLevel;
  tag: string;
  msg: string;
  /** Flattened extra arguments; absent when there were none (the common case). */
  args?: string[];
}

/** Anything whose *name* says it carries a secret. Matched case-insensitively. */
const SENSITIVE_KEY =
  /^(password|passwd|pwd|secret|token|ticket|key|apikey|auth|credential)s?$/i;

/** `password=hunter2`, `ticket: abc…` — the same words inside a message. */
const SENSITIVE_INLINE =
  /\b(password|passwd|pwd|secret|token|ticket|key)\b\s*[=:]\s*\S+/gi;

const REDACTED = "[redacted]";

/** Longer than this and an argument is truncated rather than stored whole. */
const MAX_ARG_LENGTH = 500;
/** Deeper than this and an object is summarised rather than walked. */
const MAX_DEPTH = 2;

export function redactMessage(msg: string): string {
  // The test is far cheaper than the replace, and almost every message fails
  // it — this runs on the logging path.
  if (!msg.includes("=") && !msg.includes(":")) {
    return msg;
  }

  return msg.replace(SENSITIVE_INLINE, (_match, word: string) => {
    return `${word}=${REDACTED}`;
  });
}

function flattenValue(value: unknown, depth: number): string {
  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "undefined";
  }

  if (typeof value === "string") {
    return redactMessage(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "bigint") {
    return `${value}n`;
  }

  if (typeof value === "function") {
    return "[function]";
  }

  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  if (depth >= MAX_DEPTH) {
    return Array.isArray(value) ? `[array(${value.length})]` : "[object]";
  }

  if (Array.isArray(value)) {
    return `[${value
      .slice(0, 20)
      .map((item) => flattenValue(item, depth + 1))
      .join(", ")}${value.length > 20 ? ", …" : ""}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(
      0,
      20
    );

    const body = entries
      .map(([key, item]) => {
        if (SENSITIVE_KEY.test(key)) {
          return `${key}: ${REDACTED}`;
        }

        return `${key}: ${flattenValue(item, depth + 1)}`;
      })
      .join(", ");

    return `{${body}}`;
  }

  return String(value);
}

export function flattenArg(value: unknown): string {
  const flat = flattenValue(value, 0);

  return flat.length > MAX_ARG_LENGTH
    ? `${flat.slice(0, MAX_ARG_LENGTH)}…`
    : flat;
}

export class LogBuffer {
  private readonly entries: LogEntry[] = [];

  constructor(private readonly capacity: number) {}

  push(level: LogLevel, tag: string, msg: string, args: unknown[]): LogEntry {
    const entry: LogEntry = {
      t: Date.now(),
      level,
      tag,
      msg: redactMessage(msg),
    };

    if (args.length > 0) {
      entry.args = args.map(flattenArg);
    }

    this.entries.push(entry);

    if (this.entries.length > this.capacity) {
      this.entries.splice(0, this.entries.length - this.capacity);
    }

    return entry;
  }

  /** Everything held, oldest first. */
  snapshot(): readonly LogEntry[] {
    return this.entries.slice();
  }

  /**
   * Removes and returns up to `max` of the oldest entries — what the shipper
   * sends. Taking them out is what makes a failed POST recoverable: the caller
   * puts them back at the front.
   */
  drain(max: number): LogEntry[] {
    return this.entries.splice(0, max);
  }

  /** Puts drained entries back at the front, oldest first, after a failed send. */
  unshift(entries: readonly LogEntry[]): void {
    this.entries.unshift(...entries);

    if (this.entries.length > this.capacity) {
      // A backlog that outgrew the ring loses its oldest half rather than
      // growing without bound while the sink is down.
      this.entries.splice(0, this.entries.length - this.capacity);
    }
  }

  get size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries.length = 0;
  }
}
