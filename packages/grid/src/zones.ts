import { AreaKind } from "./area.ts";

export interface DecodedZone {
  kind: AreaKind;
  size: number;
}

const SHAPE_LETTERS: Record<string, AreaKind> = {
  P: AreaKind.None,
  C: AreaKind.Circle,
  X: AreaKind.Cross,
  "+": AreaKind.PerpCross,
  T: AreaKind.PerpCross,
  L: AreaKind.Line,
  D: AreaKind.DiagonalLine,
  O: AreaKind.Ring,
  R: AreaKind.Square,
  Q: AreaKind.Sector,
};

function decodeSize(letter: string): number {
  // Spell.as uses Compressor.decode64: a=0, b=1, …, A=26, _=63.
  return Math.max(
    0,
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_".indexOf(
      letter
    )
  );
}

export function decodeZonePair(pair: string): DecodedZone {
  if (pair.length !== 2) {
    return { kind: AreaKind.None, size: 0 };
  }
  const shapeChar = pair.charAt(0);
  const sizeChar = pair.charAt(1);
  const kind = SHAPE_LETTERS[shapeChar] ?? AreaKind.None;
  return { kind, size: decodeSize(sizeChar) };
}

export function decodeZones(zones: string, expected: number): DecodedZone[] {
  const out: DecodedZone[] = [];
  if (!zones || zones.length < 2) {
    for (let i = 0; i < expected; i++) {
      out.push({ kind: AreaKind.None, size: 0 });
    }
    return out;
  }
  for (let i = 0; i + 1 < zones.length; i += 2) {
    out.push(decodeZonePair(zones.slice(i, i + 2)));
  }
  while (out.length < expected) {
    out.push({ kind: AreaKind.None, size: 0 });
  }
  return out.slice(0, Math.max(expected, out.length));
}
