import type { Fight } from "@modules/fight/core/fight.entity";
import type { Fighter } from "@modules/fight/core/fight.fighter";
import {
  clampFightDirection,
  DofusPathfinding,
  fightDistance,
  getDirection,
  totalCells,
} from "@dofus/grid";
import { CastError } from "@modules/fight/cast/fight.cast.types";
import { Characteristic, FightStateId } from "@modules/fight/fight.types";

import type { Emitter } from "../effects/fight.effect-registry.types";
import { releaseCarried } from "../effects/fight.effect-lifecycle";
import { canPerceive } from "./fight.visibility";

export interface MovementEvents {
  start?(): void;
  emitter?: Emitter;
  step(from: number, to: number): void;
  tackled(apLost: number, mpLost: number): void;
}

function adjacentEnemies(fight: Fight, fighter: Fighter): Fighter[] {
  return fight
    .fighters()
    .filter(
      (other) =>
        !other.dead &&
        !other.invisible &&
        other.carriedById === null &&
        other.team !== fighter.team &&
        !other.states.has(FightStateId.Rooted) &&
        fightDistance(fight.fightMap, fighter.cell, other.cell) === 1
    );
}

export function moveFighter(
  fight: Fight,
  fighter: Fighter,
  cells: number[],
  events: MovementEvents,
  random = fight.random
): void {
  const map = fight.fightMap;
  if (!cells.length || cells.length > fighter.mp) {
    throw new CastError("no_mp", "Pas assez de PM.");
  }
  let previous = fighter.cell;
  const visited = new Set([previous]);
  for (const cell of cells) {
    if (
      visited.has(cell) ||
      fightDistance(map, previous, cell) !== 1 ||
      !map.isWalkable(cell) ||
      !map.isFree(cell)
    ) {
      throw new CastError("bad_path", "Chemin impraticable ou occupé.");
    }
    previous = cell;
    visited.add(cell);
  }
  events.start?.();
  if (!fighter.states.has(FightStateId.Rooted)) {
    for (const enemy of adjacentEnemies(fight, fighter)) {
      const agility = Math.max(0, fighter.stats.get(Characteristic.Agility));
      const opposing = Math.max(0, enemy.stats.get(Characteristic.Agility));
      const escapeChance = Math.max(
        0,
        Math.min(
          100,
          Math.floor((300 * (agility + 25)) / (agility + opposing + 50) - 100)
        )
      );
      if (Math.floor(random() * 100) > escapeChance) {
        const apLost = Math.floor((fighter.ap * escapeChance) / 100);
        const mpLost = fighter.mp;
        fighter.ap -= apLost;
        fighter.resetMp(0);
        events.tackled(apLost, mpLost);
        return;
      }
    }
  }
  for (const cell of cells) {
    const from = fighter.cell;
    if (fighter.dead || fighter.mp <= 0 || !map.isFree(cell)) {
      break;
    }
    map.free(from, fighter.id);
    fighter.cell = cell;
    const carrier = fight.fighters().find((f) => f.id === fighter.carriedById);
    if (carrier) {
      releaseCarried({ fight, emitter: events.emitter ?? {} }, carrier);
    }
    const carried = fight.fighters().find((f) => f.id === fighter.carryingId);
    if (carried) {
      carried.cell = cell;
    }
    map.occupy(cell, fighter.id);
    fighter.spendMp(1);
    fighter.direction = clampFightDirection(
      getDirection(from, cell, map.width)
    );
    events.step(from, cell);
    map.fireArrivalTriggers(fight, fighter, cell);
    if (
      fighter.dead ||
      fighter.cell !== cell ||
      adjacentEnemies(fight, fighter).length > 0
    ) {
      break;
    }
  }
}

export function pathToward(
  fight: Fight,
  fighter: Fighter,
  target: Fighter
): number[] {
  const map = fight.fightMap;
  if (!canPerceive(target, fighter)) {
    return [];
  }
  if (fightDistance(map, fighter.cell, target.cell) <= 1) {
    return [];
  }
  const cells = Array.from(
    { length: totalCells(map.width, map.height) },
    (_, i) => i
  ).filter((cell) => map.isWalkable(cell));
  const pathfinder = new DofusPathfinding(map.width, map.height, cells);
  const visibleOccupied = perceivedOccupied(fight, fighter, cells);
  for (const cell of visibleOccupied) {
    pathfinder.addOccupied(cell);
  }
  const destinations = cells.filter(
    (cell) =>
      !visibleOccupied.has(cell) && fightDistance(map, cell, target.cell) === 1
  );
  const paths = destinations
    .flatMap((cell) => {
      const path = pathfinder.findFightPath(fighter.cell, cell);
      return path ? [path] : [];
    })
    .sort((a, b) => a.length - b.length);
  return (paths[0] ?? []).slice(1, fighter.mp + 1);
}

/** Range/support summons retreat using only positions their team can perceive. */
export function pathAway(fight: Fight, fighter: Fighter): number[] {
  const map = fight.fightMap;
  const enemies = fight
    .fighters()
    .filter(
      (f) => !f.dead && f.team !== fighter.team && canPerceive(f, fighter)
    );
  if (!enemies.length || fighter.mp <= 0 || fighter.carriedById !== null) {
    return [];
  }
  const cells = Array.from(
    { length: totalCells(map.width, map.height) },
    (_, i) => i
  ).filter((c) => map.isWalkable(c));
  const pf = new DofusPathfinding(map.width, map.height, cells);
  const occupied = perceivedOccupied(fight, fighter, cells);
  for (const cell of occupied) {
    pf.addOccupied(cell);
  }
  const distance = (cell: number) =>
    Math.min(...enemies.map((e) => fightDistance(map, cell, e.cell)));
  const initial = distance(fighter.cell);
  const options = cells
    .filter(
      (c) =>
        !occupied.has(c) &&
        fightDistance(map, fighter.cell, c) <= fighter.mp &&
        distance(c) > initial
    )
    .sort((a, b) => distance(b) - distance(a));
  for (const cell of options) {
    const path = pf.findFightPath(fighter.cell, cell);
    if (path && path.length > 1 && path.length - 1 <= fighter.mp) {
      return path.slice(1);
    }
  }
  return [];
}

function perceivedOccupied(
  fight: Fight,
  viewer: Fighter,
  cells: number[]
): Set<number> {
  return new Set(
    cells.filter((cell) => {
      const id = fight.fightMap.occupantOf(cell);
      if (id === undefined || id === viewer.id) {
        return false;
      }
      const fighter = fight.fighters().find((f) => f.id === id);
      return (
        !fighter ||
        (!fighter.dead &&
          fighter.carriedById === null &&
          canPerceive(fighter, viewer))
      );
    })
  );
}
