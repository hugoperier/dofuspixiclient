import { describe, expect, test } from "bun:test";

import { flattenArg, LogBuffer, redactMessage } from "./log-buffer";

describe("LogBuffer", () => {
  test("keeps the newest entries and drops the oldest past capacity", () => {
    const buffer = new LogBuffer(3);

    for (const n of [1, 2, 3, 4, 5]) {
      buffer.push("info", "T", `entry ${n}`, []);
    }

    expect(buffer.size).toBe(3);
    expect(buffer.snapshot().map((e) => e.msg)).toEqual([
      "entry 3",
      "entry 4",
      "entry 5",
    ]);
  });

  test("drain removes what it returns, oldest first", () => {
    const buffer = new LogBuffer(10);

    buffer.push("info", "T", "a", []);
    buffer.push("info", "T", "b", []);
    buffer.push("info", "T", "c", []);

    expect(buffer.drain(2).map((e) => e.msg)).toEqual(["a", "b"]);
    expect(buffer.snapshot().map((e) => e.msg)).toEqual(["c"]);
  });

  test("a failed send puts its batch back in front", () => {
    const buffer = new LogBuffer(10);

    buffer.push("info", "T", "a", []);
    buffer.push("info", "T", "b", []);

    const batch = buffer.drain(1);

    buffer.push("info", "T", "c", []);
    buffer.unshift(batch);

    expect(buffer.snapshot().map((e) => e.msg)).toEqual(["a", "b", "c"]);
  });

  test("a backlog put back beyond capacity loses its oldest, not its newest", () => {
    const buffer = new LogBuffer(2);

    buffer.push("info", "T", "new", []);
    buffer.unshift([
      { t: 1, level: "info", tag: "T", msg: "old-1" },
      { t: 2, level: "info", tag: "T", msg: "old-2" },
    ]);

    expect(buffer.snapshot().map((e) => e.msg)).toEqual(["old-2", "new"]);
  });

  test("entries carry a timestamp — the client had none at all before", () => {
    const buffer = new LogBuffer(4);
    const before = Date.now();

    const entry = buffer.push("warn", "T", "something", []);

    expect(entry.t).toBeGreaterThanOrEqual(before);
    expect(entry.level).toBe("warn");
    expect(entry.tag).toBe("T");
  });

  test("no arguments means no args key, which is the common case", () => {
    const buffer = new LogBuffer(4);

    expect(buffer.push("info", "T", "plain", []).args).toBeUndefined();
    expect(buffer.push("info", "T", "with", [1]).args).toEqual(["1"]);
  });
});

describe("redaction", () => {
  test("strips secrets named inline in a message", () => {
    expect(redactMessage("login password=hunter2 ok")).toBe(
      "login password=[redacted] ok"
    );
    expect(redactMessage("ticket: abc-123-def")).toBe("ticket=[redacted]");
  });

  test("leaves ordinary messages with an = or a : alone", () => {
    const msg = "move sent=true 4 step(s) 153 → 268 path=[153,168,183,198,268]";

    expect(redactMessage(msg)).toBe(msg);
    expect(redactMessage("cell-click cell=268 fightMode=none")).toBe(
      "cell-click cell=268 fightMode=none"
    );
  });

  test("strips object keys whose name says they carry a secret", () => {
    const flat = flattenArg({
      user: "dev",
      password: "hunter2",
      key: "deadbeef",
      mapId: 7411,
    });

    expect(flat).toContain("user: dev");
    expect(flat).toContain("mapId: 7411");
    expect(flat).not.toContain("hunter2");
    expect(flat).not.toContain("deadbeef");
  });
});

describe("argument flattening", () => {
  test("holds strings, not the objects themselves", () => {
    // The ring keeps thousands of entries; retaining a live object would pin
    // whatever it references — a decoded map, a PixiJS sprite — for as long as
    // the entry sits there.
    const buffer = new LogBuffer(4);
    const sprite = { id: 1, texture: { huge: true } };

    const entry = buffer.push("info", "T", "msg", [sprite]);

    expect(typeof entry.args?.[0]).toBe("string");
  });

  test("summarises past a couple of levels rather than walking forever", () => {
    expect(flattenArg({ a: { b: { c: { d: 1 } } } })).toContain("[object]");
  });

  test("renders an Error as its name and message", () => {
    expect(flattenArg(new TypeError("boom"))).toBe("TypeError: boom");
  });

  test("truncates a very long value", () => {
    expect(flattenArg("x".repeat(2_000))).toEndWith("…");
  });

  test("survives a cyclic object", () => {
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;

    expect(() => flattenArg(cyclic)).not.toThrow();
  });
});
