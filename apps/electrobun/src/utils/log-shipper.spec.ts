import { afterEach, describe, expect, test } from "bun:test";

import { flushLogsNow } from "./log-shipper";
import { logBuffer } from "./logger";

/**
 * The shipper's one hard requirement: a batch that fails to reach the sink
 * must stay in the ring. The sink is the Vite dev server, which restarts
 * whenever `vite.config.ts` is touched — losing the entries around that
 * moment would lose exactly the window someone was debugging.
 */

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function seed(count: number): void {
  logBuffer.clear();

  for (let i = 0; i < count; i += 1) {
    logBuffer.push("info", "T", `entry ${i}`, []);
  }
}

describe("log shipper", () => {
  test("drains the buffer when the sink accepts", async () => {
    seed(3);

    let body: string | undefined;

    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      body = init?.body as string;
      return new Response(null, { status: 204 });
    }) as never;

    await flushLogsNow();

    expect(logBuffer.size).toBe(0);

    const parsed = JSON.parse(body ?? "{}");

    expect(parsed.entries).toHaveLength(3);
    expect(typeof parsed.clientId).toBe("string");
  });

  test("keeps the batch when the sink refuses it", async () => {
    seed(3);

    globalThis.fetch = (async () =>
      new Response(null, { status: 500 })) as never;

    await flushLogsNow();

    expect(logBuffer.size).toBe(3);
    expect(logBuffer.snapshot()[0]?.msg).toBe("entry 0");
  });

  test("keeps the batch when there is no sink at all", async () => {
    seed(2);

    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as never;

    await flushLogsNow();

    expect(logBuffer.size).toBe(2);
  });

  test("a returned batch stays ahead of what was logged meanwhile", async () => {
    seed(1);

    globalThis.fetch = (async () => {
      // Something logged while the POST was in flight.
      logBuffer.push("info", "T", "later", []);
      throw new Error("down");
    }) as never;

    await flushLogsNow();

    expect(logBuffer.snapshot().map((e) => e.msg)).toEqual([
      "entry 0",
      "later",
    ]);
  });

  test("an empty buffer sends nothing", async () => {
    logBuffer.clear();

    let called = 0;

    globalThis.fetch = (async () => {
      called += 1;
      return new Response(null, { status: 204 });
    }) as never;

    await flushLogsNow();

    expect(called).toBe(0);
  });
});
