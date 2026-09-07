import { describe, expect, test } from "bun:test";

import { CoreLogger, resolveLogLevel } from "./core-logger";

/**
 * The format is the contract: `scripts/logs.ts` interleaves these lines with
 * the gateway's pino JSON and the browser's NDJSON by parsing the leading ISO
 * timestamp. Lose that prefix and `just logs-bundle` stops being able to put a
 * click and its validation next to each other.
 */

const ISO_PREFIX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z /;

describe("resolveLogLevel", () => {
  test("accepts pino's vocabulary, which is what .env already carries", () => {
    expect(resolveLogLevel("debug", "development")).toBe("debug");
    expect(resolveLogLevel("info", "development")).toBe("log");
    expect(resolveLogLevel("trace", "development")).toBe("verbose");
    expect(resolveLogLevel("WARN", "development")).toBe("warn");
  });

  test("defaults to debug in dev and log in production", () => {
    expect(resolveLogLevel(undefined, "development")).toBe("debug");
    expect(resolveLogLevel(undefined, "production")).toBe("log");
  });

  test("an unknown value falls back rather than throwing at boot", () => {
    expect(resolveLogLevel("chatty", "production")).toBe("log");
  });
});

describe("CoreLogger.format", () => {
  test("starts with an ISO timestamp so the bundle can sort on it", () => {
    const line = new CoreLogger("gamed", "debug").format("log", "hello", []);

    expect(line).toMatch(ISO_PREFIX);
  });

  test("names the level and the Nest context", () => {
    const line = new CoreLogger("gamed", "debug").format(
      "warn",
      "ack: id mismatch",
      ["MoveAckHandler"]
    );

    expect(line).toContain("WARN ");
    expect(line).toContain("[MoveAckHandler]");
    expect(line).toEndWith("ack: id mismatch");
  });

  test("falls back to the process name when Nest passes no context", () => {
    const line = new CoreLogger("authd", "debug").format("log", "up", []);

    expect(line).toContain("[authd]");
  });

  test("keeps an error's stack, which arrives before the context", () => {
    const err = new Error("boom");
    const line = new CoreLogger("gamed", "debug").format("error", "threw", [
      err.stack,
      "WsRouter",
    ]);

    expect(line).toContain("[WsRouter]");
    expect(line).toContain("threw");
    expect(line).toContain("boom");
  });
});

describe("CoreLogger level filtering", () => {
  test("drops what sits below the threshold and keeps the rest", () => {
    const written: string[] = [];
    const original = process.stdout.write.bind(process.stdout);

    // The logger writes straight to the stream — that is what `dev.sh` tees.
    process.stdout.write = ((chunk: string) => {
      written.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      const logger = new CoreLogger("gamed", "log");

      logger.debug("invisible");
      logger.log("visible");
    } finally {
      process.stdout.write = original;
    }

    expect(written).toHaveLength(1);
    expect(written[0]).toContain("visible");
  });

  test("at debug, the ~30 logger.debug calls in the core finally print", () => {
    const written: string[] = [];
    const original = process.stdout.write.bind(process.stdout);

    process.stdout.write = ((chunk: string) => {
      written.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      new CoreLogger("gamed", "debug").debug("move dropped: a harvest owns it");
    } finally {
      process.stdout.write = original;
    }

    expect(written).toHaveLength(1);
    expect(written[0]).toContain("DEBUG");
  });
});
