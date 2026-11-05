import { describe, expect, test } from "bun:test";

import {
  CELL_HALF_HEIGHT,
  CELL_HALF_WIDTH,
  DEFAULT_GROUND_LEVEL,
} from "@/game/constants/battlefield";
import { getCellPosition } from "@/game/datacenter/cell";

import { type Point, tracePerimeterLoops } from "./perimeter-loops";

const WIDTH = 15;
const CENTER = 200;
// Diagonal neighbours on a width-15 map: NE, SE, SW, NW.
const ARMS = [-14, 15, 14, -15];
const CELL_AREA = 2 * CELL_HALF_WIDTH * CELL_HALF_HEIGHT;

const trace = (cells: number[]): Point[][] =>
  tracePerimeterLoops(new Set(cells), WIDTH, (id) =>
    getCellPosition(id, WIDTH, DEFAULT_GROUND_LEVEL)
  );

const area = (loop: Point[]): number => {
  let sum = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i] as Point;
    const b = loop[(i + 1) % loop.length] as Point;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
};

// A loop that cuts a diagonal across a cell covers less than its
// cells, so the summed area is what catches the pinch bug.
describe("tracePerimeterLoops", () => {
  test("a full diamond is one loop covering every cell", () => {
    const cells = [CENTER, ...ARMS.map((d) => CENTER + d)];
    const loops = trace(cells);
    expect(loops).toHaveLength(1);
    expect(area(loops[0] as Point[])).toBeCloseTo(5 * CELL_AREA);
  });

  test("a melee ring splits into four diamonds at the caster's corners", () => {
    const loops = trace(ARMS.map((d) => CENTER + d));
    expect(loops).toHaveLength(4);
    for (const loop of loops) {
      expect(loop).toHaveLength(4);
      expect(area(loop)).toBeCloseTo(CELL_AREA);
    }
  });

  test("a line-only cross gives one loop per arm, none cut", () => {
    const cells = ARMS.flatMap((d) => [CENTER + d, CENTER + 2 * d]);
    const loops = trace(cells);
    expect(loops).toHaveLength(4);
    for (const loop of loops) {
      expect(area(loop)).toBeCloseTo(2 * CELL_AREA);
    }
  });
});
