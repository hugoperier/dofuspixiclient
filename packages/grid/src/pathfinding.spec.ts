import { describe, expect, test } from "bun:test";

import { totalCells } from "./cell";
import { isMapChangeCell } from "./edge";
import { getNeighbors } from "./neighbors";
import { DofusPathfinding } from "./pathfinding";
import { isFightWalkable } from "./walkability";

const WIDTH = 15;
const HEIGHT = 17;
const WALKABLE = Array.from({ length: totalCells(WIDTH, HEIGHT) }, (_, i) => i);

describe("DofusPathfinding.findAdjacentPath", () => {
  test("ends beside an interactive cell, never on top of it", () => {
    const pathfinding = new DofusPathfinding(WIDTH, HEIGHT, WALKABLE);
    const target = 200;

    const path = pathfinding.findAdjacentPath(0, target);

    expect(path).not.toBeNull();
    expect(path?.at(-1)).not.toBe(target);
    expect(getNeighbors(target, WIDTH, HEIGHT)).toContain(
      path?.at(-1) as number
    );
  });

  test("does not move a character that is already beside the resource", () => {
    const pathfinding = new DofusPathfinding(WIDTH, HEIGHT, WALKABLE);
    const target = 200;
    const start = getNeighbors(target, WIDTH, HEIGHT)[0] as number;

    expect(pathfinding.findAdjacentPath(start, target)).toEqual([start]);
  });

  test("never stops on a cell that would change map", () => {
    const pathfinding = new DofusPathfinding(WIDTH, HEIGHT, WALKABLE);
    // A resource one row above the bottom edge: its closest neighbours are
    // the border cells the server reads as an exit.
    const target = totalCells(WIDTH, HEIGHT) - WIDTH - 2;

    expect(
      getNeighbors(target, WIDTH, HEIGHT).some((cell) =>
        isMapChangeCell(cell, WIDTH, HEIGHT)
      )
    ).toBe(true);

    const path = pathfinding.findAdjacentPath(0, target);

    expect(path).not.toBeNull();
    expect(isMapChangeCell(path?.at(-1) as number, WIDTH, HEIGHT)).toBe(false);
  });

  test("acts from where the character stands, edge cell or not", () => {
    const pathfinding = new DofusPathfinding(WIDTH, HEIGHT, WALKABLE);
    const target = totalCells(WIDTH, HEIGHT) - WIDTH - 2;
    const start = getNeighbors(target, WIDTH, HEIGHT).find((cell) =>
      isMapChangeCell(cell, WIDTH, HEIGHT)
    ) as number;

    expect(pathfinding.findAdjacentPath(start, target)).toEqual([start]);
  });
});

describe("DofusPathfinding fight walkability", () => {
  // Cells 211-213 of map 7417: three holes in a row, `movement = 1`. A
  // roleplay walk may still end on such a cell; a fighter never touches one.
  const HOLES = [211, 212, 213];
  const FIGHT_WALKABLE = WALKABLE.filter((cell) => !HOLES.includes(cell));

  test("a fight path walks around a hole instead of through it", () => {
    const pathfinding = new DofusPathfinding(
      WIDTH,
      HEIGHT,
      WALKABLE,
      FIGHT_WALKABLE
    );

    const path = pathfinding.findFightPath(184, 226);

    expect(path).not.toBeNull();
    expect(path?.some((cell) => HOLES.includes(cell))).toBe(false);
    expect(path?.at(-1)).toBe(226);
  });

  test("a hole is never a fight destination", () => {
    const pathfinding = new DofusPathfinding(
      WIDTH,
      HEIGHT,
      WALKABLE,
      FIGHT_WALKABLE
    );

    expect(pathfinding.findFightPath(198, 212)).toBeNull();
    expect(pathfinding.reachable(198, 3, true)).not.toContain(212);
  });

  test("the fight set defaults to the walkable one", () => {
    const pathfinding = new DofusPathfinding(WIDTH, HEIGHT, FIGHT_WALKABLE);

    expect(pathfinding.findFightPath(198, 212)).toBeNull();
  });
});

describe("isFightWalkable", () => {
  test("follows the 1.29 fight rule", () => {
    expect(isFightWalkable({ active: true, movement: 4 })).toBe(true);
    expect(isFightWalkable({ active: true, movement: 1 })).toBe(false);
    expect(isFightWalkable({ active: true, movement: 0 })).toBe(false);
    expect(isFightWalkable({ active: false, movement: 4 })).toBe(false);
  });
});
