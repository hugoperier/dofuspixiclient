import { describe, expect, test } from "bun:test";

import { effectiveDisplayType } from "./display-type";
import fallbacks from "./display-type-fallbacks.json";

describe("effectiveDisplayType", () => {
  // Horloge: the module declared 11, the server says 51 (QA-181/182).
  test("the server's displayType wins over the module's", () => {
    expect(effectiveDisplayType(512, 51, 11)).toBe(51);
  });

  test("the module's value applies when the server sends none", () => {
    expect(effectiveDisplayType(512, undefined, 51)).toBe(51);
    // proto3's unset int is 0.
    expect(effectiveDisplayType(512, 0, 51)).toBe(51);
  });

  test("a pair the audit found broken keeps the module's value", () => {
    const [gfx, dt] = (fallbacks.pairs[0] ?? "").split(":").map(Number);
    expect(gfx).toBeGreaterThan(0);
    expect(effectiveDisplayType(gfx ?? 0, dt, 11)).toBe(11);
  });

  test("a broken pair without a module value still plays the server's", () => {
    const [gfx, dt] = (fallbacks.pairs[0] ?? "").split(":").map(Number);
    expect(effectiveDisplayType(gfx ?? 0, dt, undefined)).toBe(dt);
  });
});
