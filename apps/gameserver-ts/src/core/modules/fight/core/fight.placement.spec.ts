import { describe, expect, test } from "bun:test";

import { Fight } from "@modules/fight/core/fight.entity";
import { Fighter } from "@modules/fight/core/fight.fighter";
import { PlacementState } from "@modules/fight/core/fight.states";
import { FighterKind, FightType, TeamSide } from "@modules/fight/fight.types";
import { FightMap } from "@modules/fight/map/fight.map";

const WIDTH = 15;
const HEIGHT = 17;

/**
 * A 15x17 map's cell ids run 0..(15*2*17 - 1). Every id is walkable here
 * unless a test narrows it — placement only cares about free + walkable.
 */
function allCells(): number[] {
  return Array.from({ length: WIDTH * 2 * HEIGHT }, (_, i) => i);
}

function makeFight(team0Cells: number[], team1Cells: number[]): Fight {
  const fmap = new FightMap(WIDTH, HEIGHT, team0Cells, team1Cells);
  fmap.setWalkableCells(allCells());
  return new Fight(FightType.PvM, 1, fmap, [
    { side: TeamSide.Side0, leaderId: 1 },
    { side: TeamSide.Side1, leaderId: -1 },
  ]);
}

function addMonsters(fight: Fight, count: number): Fighter[] {
  const out: Fighter[] = [];
  for (let i = 0; i < count; i++) {
    const f = new Fighter(-1 - i, FighterKind.Monster, `m${i}`, 50, 4, 2, 3);
    fight.teams[1].add(f);
    out.push(f);
  }
  return out;
}

describe("PlacementState", () => {
  test("places every fighter on its team's cells when there is room", () => {
    const fight = makeFight([100, 101], [200, 201, 202]);
    const monsters = addMonsters(fight, 3);

    new PlacementState().enter(fight);

    expect(monsters.map((m) => m.cell).sort((a, b) => a - b)).toEqual([
      200, 201, 202,
    ]);
  });

  test("rejects insufficient positions without partially placing fighters", () => {
    const fight = makeFight([100], [200, 201]);
    const monsters = addMonsters(fight, 3);
    expect(() => new PlacementState().enter(fight)).toThrow("placement");
    expect(monsters.map((fighter) => fighter.cell)).toEqual([-1, -1, -1]);
  });

  test("rejects overlapping and non-walkable placement cells", () => {
    const fight = makeFight([100], [100]);
    addMonsters(fight, 1);
    expect(() => new PlacementState().enter(fight)).toThrow("placement");
    const blocked = makeFight([100], [200]);
    blocked.fightMap.setWalkableCells([100]);
    addMonsters(blocked, 1);
    expect(() => new PlacementState().enter(blocked)).toThrow("placement");
  });

  test("cell id 0 is a usable placement cell, not a falsy 'no room'", () => {
    const fight = makeFight([100], [0, 1]);
    const monsters = addMonsters(fight, 2);

    new PlacementState().enter(fight);

    expect(monsters.map((m) => m.cell).sort((a, b) => a - b)).toEqual([0, 1]);
  });
});
