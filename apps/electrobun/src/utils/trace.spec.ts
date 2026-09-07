import { describe, expect, test } from "bun:test";

import { formatTraceSpec, parseTraceSpec, TRACE_CHANNELS } from "./trace";

describe("parseTraceSpec", () => {
  test("arms the channels it names and nothing else", () => {
    const state = parseTraceSpec("net,move");

    expect(state.net).toBe(true);
    expect(state.move).toBe(true);
    expect(state.pick).toBe(false);
    expect(state.render).toBe(false);
    expect(state.machines).toBe(false);
  });

  test("tolerates spaces around the names", () => {
    expect(parseTraceSpec(" net , move ").move).toBe(true);
  });

  test("`all`, `1` and `true` arm everything", () => {
    for (const spec of ["all", "1", "true"]) {
      const state = parseTraceSpec(spec);

      expect(TRACE_CHANNELS.every((channel) => state[channel])).toBe(true);
    }
  });

  test("empty, absent, `0` and `false` arm nothing", () => {
    for (const spec of ["", "   ", "0", "false", null, undefined]) {
      const state = parseTraceSpec(spec);

      expect(TRACE_CHANNELS.some((channel) => state[channel])).toBe(false);
    }
  });

  test("an unknown name costs you that channel, not the page", () => {
    const state = parseTraceSpec("net,nonsense,move");

    expect(state.net).toBe(true);
    expect(state.move).toBe(true);
  });

  test("round-trips through formatTraceSpec", () => {
    const spec = "move,net";
    const state = parseTraceSpec(spec);

    // Emitted in declaration order rather than the order given.
    expect(formatTraceSpec(state)).toBe("net,move");
    expect(parseTraceSpec(formatTraceSpec(state))).toEqual(state);
  });

  test("formats an empty state as an empty string", () => {
    expect(formatTraceSpec(parseTraceSpec(""))).toBe("");
  });
});
