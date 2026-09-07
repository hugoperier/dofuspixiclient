import type { Fight } from "@modules/fight/core/fight.entity";
import type { Fighter } from "@modules/fight/core/fight.fighter";
import type { TurnObserver } from "@modules/fight/engine/fight.runner.types";
import { ActiveState } from "@modules/fight/core/fight.active-state";
import { FighterKind } from "@modules/fight/fight.types";
import { fastDistance } from "@modules/fight/map/fight.area";

import { pathToward } from "./fight.movement";

export class MonsterAI implements TurnObserver {
  constructor(
    private readonly requestEnd: (fighterId: number, epoch: number) => void,
    private readonly castSpell?: (
      fight: Fight,
      caster: Fighter,
      spellId: number,
      targetCell: number,
      level: number,
      epoch: number
    ) => Promise<void>,
    private readonly broadcastMovement?: (
      fight: Fight,
      fighter: Fighter,
      pathCells: number[],
      epoch: number
    ) => Promise<void>
  ) {}

  onTurnStart(fight: Fight, fighter: Fighter): void {
    if (fighter.kind === FighterKind.Player) {
      return;
    }

    const epoch = fight.turnEpoch;
    this.runTurn(fight, fighter, epoch).catch(() => {
      this.requestEnd(fighter.id, epoch);
    });
  }

  private async runTurn(
    fight: Fight,
    fighter: Fighter,
    epoch: number
  ): Promise<void> {
    await delay(300);
    if (!this.isCurrent(fight, fighter, epoch)) {
      return;
    }

    const target = this.findNearestEnemy(fight, fighter);
    if (!target) {
      this.requestEnd(fighter.id, epoch);
      return;
    }

    let cast = await this.tryCast(fight, fighter, target, epoch);

    if (!cast && fighter.mp > 0) {
      if (!this.isCurrent(fight, fighter, epoch)) {
        return;
      }
      const path = pathToward(fight, fighter, target);
      if (path.length) {
        await this.broadcastMovement?.(fight, fighter, path, epoch);
      }
      await delay(200);
      cast = await this.tryCast(fight, fighter, target, epoch);
    }

    if (cast && fighter.ap > 0) {
      await delay(300);
      const newTarget = this.findNearestEnemy(fight, fighter);
      if (newTarget) {
        await this.tryCast(fight, fighter, newTarget, epoch);
      }
    }

    await delay(200);
    this.requestEnd(fighter.id, epoch);
  }

  private findNearestEnemy(fight: Fight, fighter: Fighter): Fighter | null {
    const myTeam = fighter.team?.side;
    let nearest: Fighter | null = null;
    let nearestDist = Number.MAX_SAFE_INTEGER;

    for (const f of fight.fighters()) {
      if (f.dead || f.team?.side === myTeam) {
        continue;
      }
      const d = fastDistance(fight.fightMap, fighter.cell, f.cell);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = f;
      }
    }
    return nearest;
  }

  private async tryCast(
    fight: Fight,
    fighter: Fighter,
    target: Fighter,
    epoch: number
  ): Promise<boolean> {
    if (
      !this.isCurrent(fight, fighter, epoch) ||
      !this.castSpell ||
      fighter.monsterSpells.length === 0
    ) {
      return false;
    }

    const sorted = [...fighter.monsterSpells].sort((a, b) => b.level - a.level);

    for (const spell of sorted) {
      try {
        await this.castSpell(
          fight,
          fighter,
          spell.spellId,
          target.cell,
          spell.level,
          epoch
        );
        return true;
      } catch {}
    }
    return false;
  }

  private isCurrent(fight: Fight, fighter: Fighter, epoch: number): boolean {
    return (
      !fight.ending &&
      !fighter.dead &&
      fight.turnEpoch === epoch &&
      fight.state instanceof ActiveState &&
      fight.state.turnList.current()?.id === fighter.id
    );
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
