import type { Fight } from "@modules/fight/core/fight.entity";
import type { FightState } from "@modules/fight/core/fight.entity.types";
import type { Fighter } from "@modules/fight/core/fight.fighter";
import { clampFightDirection, getDirection } from "@dofus/grid";
import { StateName } from "@modules/fight/fight.types";

export class NullState implements FightState {
  readonly name = StateName.Null;

  enter(_f: unknown): void {}

  leave(_f: unknown): void {}
}

export class InitialiseState implements FightState {
  readonly name = StateName.Initialise;

  constructor(private onReady?: (f: Fight) => void) {}

  enter(f: unknown): void {
    this.onReady?.(f as Fight);
  }

  leave(_f: unknown): void {}
}

export class PlacementState implements FightState {
  readonly name = StateName.Placement;

  enter(f: unknown): void {
    const fight = f as Fight;
    const reserved = new Set<number>();
    for (const team of fight.teams) {
      const cells = fight.fightMap.teamCells[team.side];
      if (
        cells.length < team.fighters().length ||
        cells.some(
          (cell) => !fight.fightMap.isWalkable(cell) || reserved.has(cell)
        )
      ) {
        throw new Error("Invalid or insufficient placement cells");
      }
      for (const cell of cells) {
        reserved.add(cell);
      }
    }
    for (const team of fight.teams) {
      const cells = fight.fightMap.teamCells[team.side];
      for (const fighter of team.fighters()) {
        if (fighter.cell >= 0) {
          continue;
        }
        const cell = cells.find((candidate) =>
          fight.fightMap.isFree(candidate)
        );
        if (cell === undefined) {
          throw new Error("No free placement cell");
        }
        fighter.cell = cell;
        fight.fightMap.occupy(cell, fighter.id);
        fighter.refreshResources();
      }
    }
    // Face every fighter toward the centroid of the enemy team's
    // placement cells. Mirrors the canonical 1.29 client which orients
    // sprites along the natural blue↔red axis on placement entry — without
    // this, monsters keep direction 0 (SE) and players keep their stale
    // roleplay direction, both of which look wrong against an opponent
    // sitting on the opposite side of the map.
    this.orientFightersTowardEnemy(fight);
  }

  leave(_f: unknown): void {}

  move(f: Fight, fighter: Fighter, toCell: number): boolean {
    const team = fighter.team;
    if (!team || fighter.ready || fighter.dead) {
      return false;
    }
    const allowed = f.fightMap.teamCells[team.side];
    if (!allowed || !allowed.includes(toCell)) {
      return false;
    }
    if (!f.fightMap.isWalkable(toCell) || !f.fightMap.isFree(toCell)) {
      return false;
    }
    f.fightMap.free(fighter.cell, fighter.id);
    fighter.cell = toCell;
    f.fightMap.occupy(toCell, fighter.id);
    // Re-orient on every placement move so the fighter keeps facing the
    // enemy when they slide along their team's cells.
    fighter.direction = this.directionTowardEnemy(f, fighter);
    return true;
  }

  private orientFightersTowardEnemy(fight: Fight): void {
    for (const team of fight.teams) {
      for (const fighter of team.fighters()) {
        if (fighter.cell < 0) {
          continue;
        }
        fighter.direction = this.directionTowardEnemy(fight, fighter);
      }
    }
  }

  private directionTowardEnemy(fight: Fight, fighter: Fighter): number {
    const enemySide = fighter.team?.side === 0 ? 1 : 0;
    const enemyCells = fight.fightMap.teamCells[enemySide] ?? [];
    if (enemyCells.length === 0 || fighter.cell < 0) {
      return fighter.direction;
    }
    // Use the median cell as a stable centroid proxy — avoids needing
    // x/y per-cell data on the server (the grid package's getDirection
    // takes only mapWidth + cell ids).
    const target =
      enemyCells[Math.floor(enemyCells.length / 2)] ?? enemyCells[0];
    if (target === undefined) {
      return fighter.direction;
    }
    // Clamp to fight directions {1,3,5,7} — the client renderer
    // clamps anyway, so storing 8-way here desyncs the equality check
    // in the cast handler and silently suppresses re-emits.
    return clampFightDirection(
      getDirection(fighter.cell, target, fight.fightMap.width)
    );
  }

  setReady(fighter: Fighter, ready: boolean): void {
    fighter.ready = ready;
  }
}
