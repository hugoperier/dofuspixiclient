import { expect, test } from "bun:test";

import { Fight } from "../core/fight.entity";
import { Fighter } from "../core/fight.fighter";
import {
  Element,
  FighterKind,
  FightObjectKind,
  FightType,
  TeamSide,
} from "../fight.types";
import { FightMap } from "../map/fight.map";
import { moveFighter, pathToward } from "./fight.movement";

function harness() {
  const map = new FightMap(15, 17, [200], [300]);
  const fight = new Fight(
    FightType.PvM,
    1,
    map,
    [
      { side: TeamSide.Side0, leaderId: 1 },
      { side: TeamSide.Side1, leaderId: 2 },
    ],
    () => 0.99
  );
  const mover = new Fighter(1, FighterKind.Player, "mover", 100, 6, 3, 3);
  const enemy = new Fighter(2, FighterKind.Monster, "enemy", 30, 4, 2, 3);
  fight.teams[0].add(mover);
  fight.teams[1].add(enemy);
  mover.cell = 200;
  enemy.cell = 300;
  map.occupy(200, 1);
  map.occupy(300, 2);
  const steps: number[] = [];
  const losses: number[] = [];
  const events = {
    step: (_from: number, to: number) => {
      steps.push(to);
    },
    tackled: (ap: number, mp: number) => {
      losses.push(ap, mp);
    },
  };
  return { fight, map, mover, enemy, events, steps, losses };
}
test("validates the complete path before spending PM", () => {
  const h = harness();
  h.map.occupy(230, 9);
  for (const path of [[215, 230], [201], [215, 200], [215, 230, 245, 260]]) {
    expect(() => moveFighter(h.fight, h.mover, path, h.events)).toThrow();
    expect(h.mover.cell).toBe(200);
    expect(h.mover.mp).toBe(3);
  }
  h.map.setWalkableCells([200]);
  expect(() => moveFighter(h.fight, h.mover, [215], h.events)).toThrow();
  expect(h.steps).toEqual([]);
});
test("executes each step and stops at an intermediate lethal trap", () => {
  const h = harness();
  h.map.objects.add({
    id: 0,
    kind: FightObjectKind.Trap,
    casterId: 2,
    cell: 215,
    size: 0,
    element: Element.Fire,
    spellId: 1,
    spellLevel: 1,
    color: 0,
    remaining: -1,
    onArrival: (_fight, victim) => {
      victim.setLp(0);
      return true;
    },
  });
  moveFighter(h.fight, h.mover, [215, 230], h.events);
  expect(h.steps).toEqual([215]);
  expect(h.mover.dead).toBe(true);
  expect(h.mover.mp).toBe(2);
});
test("failed tackle consumes all PM and emits losses without moving", () => {
  const h = harness();
  h.map.free(300, 2);
  h.enemy.cell = 215;
  h.map.occupy(215, 2);
  moveFighter(h.fight, h.mover, [185], h.events);
  expect(h.mover.cell).toBe(200);
  expect(h.mover.mp).toBe(0);
  expect(h.losses).toEqual([3, 3]);
});
test("AI routes through walkable unoccupied cells", () => {
  const h = harness();
  h.map.free(300, 2);
  h.enemy.cell = 245;
  h.map.occupy(245, 2);
  h.map.occupy(215, 9);
  const path = pathToward(h.fight, h.mover, h.enemy);
  expect(path.length).toBeGreaterThan(0);
  expect(path).not.toContain(215);
  expect(path).not.toContain(245);
  moveFighter(h.fight, h.mover, path, h.events);
  expect(h.steps).toEqual(path);
});

test("AI already next to its target does not circle it and waste PM", () => {
  const h = harness();
  h.map.free(h.enemy.cell, h.enemy.id);
  h.enemy.cell = 215;
  h.map.occupy(215, h.enemy.id);
  expect(pathToward(h.fight, h.mover, h.enemy)).toEqual([]);
});
