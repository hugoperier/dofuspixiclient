import { expect, test } from "bun:test";

import {
  AreaKind,
  castGeometryError,
  cellsInArea,
  fightDistance,
} from "./area";
import { totalCells } from "./cell";

const map = { width: 15, height: 17, occupantOf: (_: number) => undefined };
const rules = {
  rangeMin: 0,
  rangeMax: 100,
  rangeBonus: 0,
  modifiableRange: false,
  emptyCell: false,
  lineOfSight: false,
  lineOnly: false,
};
test("combat rejects phantom cells and row wrapping", () => {
  const total = totalCells(map.width, map.height);
  for (const cell of [-1, 0.5, total, total + 1]) {
    expect(castGeometryError(map, 200, cell, rules)).toBe("bad_cell");
    expect(cellsInArea(map, 200, cell, AreaKind.Circle, 3)).toEqual([]);
  }
  expect(fightDistance(map, 14, 29)).toBeGreaterThan(1);
  expect(cellsInArea(map, 14, 14, AreaKind.Circle, 1)).not.toContain(29);
  expect(
    cellsInArea(map, total - 1, total - 1, AreaKind.Circle, 2).every(
      (cell) => cell < total
    )
  ).toBe(true);
});
test("range uses diamond edges and modifiable PO", () => {
  expect(fightDistance(map, 200, 201)).toBe(2);
  expect(fightDistance(map, 200, 215)).toBe(1);
  expect(
    castGeometryError(map, 200, 230, { ...rules, rangeMax: 1, rangeBonus: 1 })
  ).toBe("out_of_range");
  expect(
    castGeometryError(map, 200, 230, {
      ...rules,
      rangeMax: 1,
      rangeBonus: 1,
      modifiableRange: true,
    })
  ).toBeNull();
});
