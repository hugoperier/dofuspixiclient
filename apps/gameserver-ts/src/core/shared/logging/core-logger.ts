import type { LoggerService, LogLevel } from "@nestjs/common";

import { formatLogContext, readLogContext } from "./core-log-context";

/**
 * The logger gamed and authd write with.
 *
 * It replaces the `logger: ["log", "warn", "error"]` array that used to be
 * handed to `NestFactory`, which had two costs: the level was frozen at build
 * time, so the ~30 `logger.debug()` calls already written across the core
 * produced nothing and could not be turned on; and the default format is
 * locale-dependent (`09/06/2026, 3:04:05 PM`), which is unpleasant to sort or
 * to parse back.
 *
 * The line is:
 *
 *   2026-09-07T10:11:12.345Z INFO  [MoveHandler] sid=1a2b3c4d cid=42 message
 *
 * ISO first, so `just logs-bundle` can interleave these with the gateway's
 * pino JSON and the browser's NDJSON by timestamp alone; correlation next, so
 * `grep sid=1a2b3c4d` reads one player's session end to end. It stays plain
 * text rather than JSON because this same stream is what scrolls past in the
 * terminal under `just dev`.
 */

const ORDER: Record<LogLevel, number> = {
  verbose: 0,
  debug: 1,
  log: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

/** How each level is spelled in the output, padded so the messages line up. */
const LABEL: Record<LogLevel, string> = {
  verbose: "TRACE",
  debug: "DEBUG",
  log: "INFO ",
  warn: "WARN ",
  error: "ERROR",
  fatal: "FATAL",
};

/** `LOG_LEVEL` uses pino's vocabulary, which is what `.env` already carries. */
const FROM_ENV: Record<string, LogLevel> = {
  trace: "verbose",
  verbose: "verbose",
  debug: "debug",
  info: "log",
  log: "log",
  warn: "warn",
  error: "error",
  fatal: "fatal",
};

export function resolveLogLevel(
  raw: string | undefined,
  nodeEnv: string | undefined
): LogLevel {
  const named = raw === undefined ? undefined : FROM_ENV[raw.toLowerCase()];

  if (named !== undefined) {
    return named;
  }

  return nodeEnv === "production" ? "log" : "debug";
}

/**
 * Nest calls `log(message, context)` but `error(message, stack, context)`, and
 * both arrive here as a rest array. The context is the trailing string in
 * either shape; anything before it on an error is the stack.
 */
function splitParams(params: unknown[]): {
  context: string | undefined;
  extra: unknown[];
} {
  if (params.length === 0) {
    return { context: undefined, extra: [] };
  }

  const last = params[params.length - 1];

  if (typeof last === "string" && !last.includes("\n")) {
    return { context: last, extra: params.slice(0, -1) };
  }

  return { context: undefined, extra: params };
}

function render(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`;
  }

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export class CoreLogger implements LoggerService {
  private readonly threshold: number;

  constructor(
    private readonly component: string,
    level: LogLevel
  ) {
    this.threshold = ORDER[level];
  }

  log(message: unknown, ...params: unknown[]): void {
    this.write("log", message, params);
  }

  error(message: unknown, ...params: unknown[]): void {
    this.write("error", message, params);
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.write("warn", message, params);
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.write("debug", message, params);
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.write("verbose", message, params);
  }

  fatal(message: unknown, ...params: unknown[]): void {
    this.write("fatal", message, params);
  }

  /** Exposed for the spec; also what makes the format one testable thing. */
  format(level: LogLevel, message: unknown, params: unknown[]): string {
    const { context, extra } = splitParams(params);
    const correlation = formatLogContext(readLogContext());

    const head = [
      new Date().toISOString(),
      LABEL[level],
      `[${context ?? this.component}]`,
    ];

    if (correlation.length > 0) {
      head.push(correlation);
    }

    const body = [render(message), ...extra.map(render)].join(" ");

    return `${head.join(" ")} ${body}`;
  }

  private write(level: LogLevel, message: unknown, params: unknown[]): void {
    if (ORDER[level] < this.threshold) {
      return;
    }

    const line = this.format(level, message, params);

    // stderr for anything that went wrong, so a shell can still separate the
    // two streams; `dev.sh` merges them on purpose.
    if (level === "error" || level === "fatal") {
      process.stderr.write(`${line}\n`);
      return;
    }

    process.stdout.write(`${line}\n`);
  }
}
