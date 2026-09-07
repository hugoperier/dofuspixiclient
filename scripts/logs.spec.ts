import { describe, expect, test } from "bun:test";

import { parseFile, parseLine } from "./logs.ts";

/**
 * `just logs-bundle` only works if all three producers can be put on one
 * timeline. These are the exact line shapes each of them emits.
 */

describe("parseLine", () => {
  test("reads a core line, ISO prefix first", () => {
    const parsed = parseLine(
      "gamed",
      "2026-09-07T10:11:12.100Z DEBUG [MoveHandler] sid=1a2b3c4d move ok action=3"
    );

    expect(parsed?.t).toBe(Date.parse("2026-09-07T10:11:12.100Z"));
    expect(parsed?.text).toBe(
      "DEBUG [MoveHandler] sid=1a2b3c4d move ok action=3"
    );
  });

  test("reads a browser ring-buffer entry", () => {
    const parsed = parseLine(
      "client",
      JSON.stringify({
        t: 1_757_239_872_050,
        level: "debug",
        tag: "GameClient",
        msg: "cell-click cell=268 fightMode=none",
        clientId: "a1b2c3",
      })
    );

    expect(parsed?.t).toBe(1_757_239_872_050);
    expect(parsed?.text).toBe(
      "DEBUG [GameClient] cell-click cell=268 fightMode=none"
    );
  });

  test("appends a browser entry's extra arguments", () => {
    const parsed = parseLine(
      "client",
      JSON.stringify({
        t: 1,
        level: "error",
        tag: "Connection",
        msg: "send failed:",
        args: ["TypeError: boom"],
      })
    );

    expect(parsed?.text).toEndWith("send failed: TypeError: boom");
  });

  test("reads a pino line and keeps the fields that identify a session", () => {
    const parsed = parseLine(
      "gateway",
      JSON.stringify({
        level: 30,
        time: 1_757_239_872_000,
        component: "gateway",
        mod: "ws",
        clientId: "a1b2c3",
        sessionId: "11111111-2222",
        msg: "client connected",
      })
    );

    expect(parsed?.t).toBe(1_757_239_872_000);
    expect(parsed?.text).toContain("INFO");
    expect(parsed?.text).toContain("[ws]");
    expect(parsed?.text).toContain("client connected");
    expect(parsed?.text).toContain('clientId="a1b2c3"');
    expect(parsed?.text).toContain('sessionId="11111111-2222"');
  });

  test("keeps an unrecognised line rather than dropping it", () => {
    const parsed = parseLine("vite", "  VITE v6.0.0  ready in 412 ms   ");

    expect(parsed?.t).toBeNull();
    // Leading whitespace survives on purpose: it is what makes an indented
    // stack frame still read as one under its own error line.
    expect(parsed?.text).toBe("  VITE v6.0.0  ready in 412 ms");
  });

  test("ignores blank lines", () => {
    expect(parseLine("gamed", "")).toBeNull();
    expect(parseLine("gamed", "   ")).toBeNull();
  });

  test("falls back to text for JSON that is not a log record", () => {
    const parsed = parseLine("vite", '{"unrelated": true}');

    expect(parsed?.t).toBeNull();
    expect(parsed?.text).toBe('{"unrelated": true}');
  });
});

describe("parseFile", () => {
  test("attaches an undated line to the timestamp above it", () => {
    // A stack trace must not scatter to the top of the bundle: it belongs
    // immediately after the line that produced it.
    const parsed = parseFile(
      "gamed",
      [
        "2026-09-07T10:11:12.100Z ERROR [WsRouter] handler threw",
        "    at handle (move.handler.ts:57)",
        "    at dispatch (ws-router.ts:91)",
      ].join("\n")
    );

    expect(parsed).toHaveLength(3);
    expect(parsed[1]?.t).toBe(parsed[0]?.t ?? null);
    expect(parsed[2]?.t).toBe(parsed[0]?.t ?? null);
  });

  test("leaves lines before the first timestamp undated", () => {
    const parsed = parseFile("vite", "banner\n2026-09-07T10:11:12.100Z INFO x");

    expect(parsed[0]?.t).toBeNull();
    expect(parsed[1]?.t).not.toBeNull();
  });
});
