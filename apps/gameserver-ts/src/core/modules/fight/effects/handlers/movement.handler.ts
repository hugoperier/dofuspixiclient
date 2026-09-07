import type { Scope } from "@modules/fight/effects/fight.effect-registry.types";
import { cellToCoord, fightDistance } from "@dofus/grid";
import { applyDamageToTarget } from "@modules/fight/effects/fight.damage";
import { EffectHandler } from "@modules/fight/effects/fight.effect-handler.decorator";
import { rollEffect } from "@modules/fight/effects/fight.effect-registry";
import { Element, FightStateId } from "@modules/fight/fight.types";
import { Injectable } from "@nestjs/common";

@Injectable()
export class MovementEffectHandler {
  @EffectHandler(4)
  handleTeleport(scope: Scope): void {
    const { caster, fight, targetCell } = scope;
    if (
      !fight.fightMap.isWalkable(targetCell) ||
      !fight.fightMap.isFree(targetCell)
    ) {
      return;
    }
    const from = caster.cell;
    fight.fightMap.free(from, caster.id);
    caster.cell = targetCell;
    fight.fightMap.occupy(targetCell, caster.id);
    scope.emitter.emitTeleport(fight, caster.id, from, targetCell);
    fight.fightMap.fireArrivalTriggers(fight, caster, targetCell);
  }

  @EffectHandler(5)
  handlePush(scope: Scope): void {
    this.displace(scope, false);
  }

  @EffectHandler(6)
  handlePull(scope: Scope): void {
    this.displace(scope, true);
  }

  @EffectHandler(8)
  handleSwap(scope: Scope): void {
    const { target, caster, fight } = scope;
    if (
      !target ||
      target.dead ||
      caster.dead ||
      target.states.has(FightStateId.Rooted) ||
      caster.states.has(FightStateId.Rooted)
    ) {
      return;
    }
    const from = caster.cell;
    const to = target.cell;
    fight.fightMap.free(from, caster.id);
    fight.fightMap.free(to, target.id);
    caster.cell = to;
    target.cell = from;
    fight.fightMap.occupy(to, caster.id);
    fight.fightMap.occupy(from, target.id);
    scope.emitter.emitTeleport(fight, caster.id, from, to);
    scope.emitter.emitTeleport(fight, target.id, to, from);
    fight.fightMap.fireArrivalTriggers(fight, caster, to);
    fight.fightMap.fireArrivalTriggers(fight, target, from);
  }

  private displace(scope: Scope, pull: boolean): void {
    const { target, caster, fight, emitter } = scope;
    if (!target || target.dead || target.states.has(FightStateId.Rooted)) {
      return;
    }
    const map = fight.fightMap;
    const origin =
      scope.castTargetCell !== undefined && scope.castTargetCell !== target.cell
        ? scope.castTargetCell
        : caster.cell;
    const a = cellToCoord(origin, map.width);
    const b = cellToCoord(target.cell, map.width);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if ((dx === 0 && dy === 0) || (dx !== 0 && dy !== 0)) {
      return;
    }
    const delta =
      (dx !== 0 ? Math.sign(dx) * map.width : Math.sign(dy) * (map.width - 1)) *
      (pull ? -1 : 1);
    const steps = rollEffect(scope);
    for (let step = 0; step < steps; step++) {
      const from = target.cell;
      const next = from + delta;
      if (
        fightDistance(map, from, next) !== 1 ||
        !map.isWalkable(next) ||
        !map.isFree(next)
      ) {
        if (!pull) {
          const remaining = steps - step;
          const amount = Math.max(
            1,
            Math.floor(
              (8 +
                (1 + Math.floor(fight.random() * 8)) *
                  Math.max(0.1, caster.level / 50)) *
                remaining
            )
          );
          applyDamageToTarget(scope, amount, Element.Neutral);
          const blocker = fight
            .fighters()
            .find((fighter) => !fighter.dead && fighter.cell === next);
          if (blocker) {
            applyDamageToTarget(
              { ...scope, target: blocker },
              Math.floor(amount / 2),
              Element.Neutral
            );
          }
        }
        break;
      }
      map.free(from, target.id);
      target.cell = next;
      map.occupy(next, target.id);
      emitter.emitTeleport(fight, target.id, from, next);
      map.fireArrivalTriggers(fight, target, next);
      if (target.dead || target.cell !== next) {
        break;
      }
    }
  }
}
