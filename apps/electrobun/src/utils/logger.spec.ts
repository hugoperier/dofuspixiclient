import { describe, expect, test } from "bun:test";

import { createLogger, logBuffer, setLogLevel } from "./logger";

/**
 * The one property that keeps the trace channels free: an unarmed channel must
 * not evaluate the thunk that builds its message.
 *
 * This is the whole reason `log.trace(channel, () => …)` exists next to
 * `log.debug(`…`)`. A template literal is built before the logger is even
 * called, so a `debug` on a per-frame path costs a string concatenation every
 * frame whether or not anything ever reads it. If this test ever fails, the
 * hot-path instrumentation has become expensive again.
 */
describe("log.trace", () => {
  test("does not build its message while the channel is off", () => {
    const log = createLogger("Spec");
    let built = 0;

    // No channel is armed: `initTrace` has not run, and the specs never set
    // one. That is the state the game ships in.
    log.trace("net", () => {
      built += 1;
      return "expensive";
    });

    expect(built).toBe(0);
  });

  test("every channel behaves the same when unarmed", () => {
    const log = createLogger("Spec");
    let built = 0;

    for (const channel of ["net", "move", "pick", "render", "machines"]) {
      log.trace(channel as "net", () => {
        built += 1;
        return "expensive";
      });
    }

    expect(built).toBe(0);
  });
});

describe("createLogger", () => {
  test("records into the shared buffer with its tag", () => {
    logBuffer.clear();

    const log = createLogger("MapHandler");

    log.warn("walk finished on a different map than it started");

    const entries = logBuffer.snapshot();

    expect(entries).toHaveLength(1);
    expect(entries[0]?.tag).toBe("MapHandler");
    expect(entries[0]?.level).toBe("warn");
  });

  test("records debug even though the console will not show it by default", () => {
    logBuffer.clear();
    setLogLevel(null);

    createLogger("T").debug("quiet but kept");

    expect(logBuffer.snapshot()).toHaveLength(1);
    expect(logBuffer.snapshot()[0]?.level).toBe("debug");
  });

  test("redacts on the way in, so the console and the file agree", () => {
    logBuffer.clear();

    createLogger("Auth").info("derived key=AAAABBBBCCCC");

    expect(logBuffer.snapshot()[0]?.msg).toBe("derived key=[redacted]");
  });
});
