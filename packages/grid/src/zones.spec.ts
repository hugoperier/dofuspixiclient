import { describe, expect, it } from "bun:test";

import { AreaKind } from "./area.ts";
import { decodeZonePair, decodeZones } from "./zones.ts";

describe("decodeZonePair", () => {
  it.each([
    ["Pa", AreaKind.None, 0],
    ["P_", AreaKind.None, 63],
    ["Ca", AreaKind.Circle, 0],
    ["Cb", AreaKind.Circle, 1],
    ["Cc", AreaKind.Circle, 2],
    ["Ce", AreaKind.Circle, 4],
    ["Cg", AreaKind.Circle, 6],
    ["X_", AreaKind.Cross, 63],
    ["Xc", AreaKind.Cross, 2],
    ["Xe", AreaKind.Cross, 4],
    ["+a", AreaKind.PerpCross, 0],
    ["Tb", AreaKind.PerpCross, 1],
    ["Lc", AreaKind.Line, 2],
    ["Dd", AreaKind.DiagonalLine, 3],
    ["Ob", AreaKind.Ring, 1],
    ["Rc", AreaKind.Square, 2],
    ["Qa", AreaKind.Sector, 0],
  ])("decodes %s", (pair, kind, size) => {
    expect(decodeZonePair(pair)).toEqual({ kind, size });
  });

  it("returns None/0 on malformed input", () => {
    expect(decodeZonePair("")).toEqual({ kind: AreaKind.None, size: 0 });
    expect(decodeZonePair("x")).toEqual({ kind: AreaKind.None, size: 0 });
    expect(decodeZonePair("xyz")).toEqual({ kind: AreaKind.None, size: 0 });
    expect(decodeZonePair("Za")).toEqual({ kind: AreaKind.None, size: 0 });
  });
});

describe("decodeZones", () => {
  it("splits a string into one decoded zone per effect", () => {
    expect(decodeZones("PaPa", 2)).toEqual([
      { kind: AreaKind.None, size: 0 },
      { kind: AreaKind.None, size: 0 },
    ]);
  });

  it("decodes mixed-shape pairs in order", () => {
    expect(decodeZones("CbX_Pa", 3)).toEqual([
      { kind: AreaKind.Circle, size: 1 },
      { kind: AreaKind.Cross, size: 63 },
      { kind: AreaKind.None, size: 0 },
    ]);
  });

  it("pads with None/0 when zones is shorter than effect count", () => {
    expect(decodeZones("Cb", 3)).toEqual([
      { kind: AreaKind.Circle, size: 1 },
      { kind: AreaKind.None, size: 0 },
      { kind: AreaKind.None, size: 0 },
    ]);
  });

  it("returns empty defaults when zones is missing", () => {
    expect(decodeZones("", 2)).toEqual([
      { kind: AreaKind.None, size: 0 },
      { kind: AreaKind.None, size: 0 },
    ]);
  });
});
