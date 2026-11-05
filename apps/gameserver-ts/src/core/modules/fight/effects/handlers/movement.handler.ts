import type { Scope } from "@modules/fight/effects/fight.effect-registry.types";
import { cellToCoord, fightDistance } from "@dofus/grid";
import { applyDamageToTarget } from "@modules/fight/effects/fight.damage";
import { EffectHandler } from "@modules/fight/effects/fight.effect-handler.decorator";
import { rollEffect } from "@modules/fight/effects/fight.effect-registry";
import { Element, FightStateId } from "@modules/fight/fight.types";
import { Injectable } from "@nestjs/common";

import type { Fighter } from "../../core/fight.fighter";
import {
  addEffectBuff,
  releaseCarried,
  revealFighter,
} from "../fight.effect-lifecycle";

@Injectable()
export class MovementEffectHandler {
  @EffectHandler(4)
  handleTeleport(scope: Scope): void {
    const { caster, fight, targetCell } = scope;
    if (
      caster.states.has(FightStateId.Gravity) ||
      caster.carriedById !== null ||
      !fight.fightMap.isWalkable(targetCell) ||
      !fight.fightMap.isFree(targetCell)
    ) {
      return;
    }
    const from = caster.cell;
    fight.fightMap.free(from, caster.id);
    caster.cell = targetCell;
    const carried = fight.fighters().find((f) => f.id === caster.carryingId);
    if (carried) {
      carried.cell = targetCell;
    }
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
      target.carriedById !== null ||
      caster.carriedById !== null ||
      target.carryingId !== null ||
      caster.carryingId !== null ||
      target.states.has(FightStateId.Rooted)
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

  @EffectHandler(50)
  handleCarry(scope: Scope): void {
    const { caster, target, fight } = scope;
    if (
      !target ||
      target === caster ||
      target.dead ||
      caster.carryingId !== null ||
      caster.carriedById !== null ||
      target.carriedById !== null ||
      target.carryingId !== null ||
      target.states.has(FightStateId.Rooted)
    ) {
      return;
    }
    revealFighter(scope, caster);
    revealFighter(scope, target);
    fight.fightMap.free(target.cell, target.id);
    target.cell = caster.cell;
    target.carriedById = caster.id;
    caster.carryingId = target.id;
    caster.states.set(FightStateId.Carrying, -1);
    target.states.set(FightStateId.Carried, -1);
    scope.emitter.emitState?.(fight, caster.id, FightStateId.Carrying, true);
    scope.emitter.emitState?.(fight, target.id, FightStateId.Carried, true);
    scope.emitter.emitCarry?.(fight, caster, target);
  }

  @EffectHandler(51)
  handleThrow(scope: Scope): void {
    const target = scope.fight
      .fighters()
      .find((f) => f.id === scope.caster.carryingId);
    if (
      !target ||
      !scope.fight.fightMap.isFree(scope.targetCell) ||
      !scope.fight.fightMap.isWalkable(scope.targetCell)
    ) {
      return;
    }
    target.cell = scope.targetCell;
    releaseCarried(scope, scope.caster, true);
    scope.fight.fightMap.fireArrivalTriggers(scope.fight, target, target.cell);
  }

  @EffectHandler(783)
  handleFear(scope: Scope): void {
    const adjacent = fearTarget(scope);
    if (!adjacent) {
      return;
    }
    const distance = fightDistance(
      scope.fight.fightMap,
      adjacent.cell,
      scope.targetCell
    );
    this.displace(
      {
        ...scope,
        target: adjacent,
        castTargetCell: scope.caster.cell,
        effect: { ...scope.effect, min: distance, max: distance, dice: "" },
      },
      false,
      false
    );
  }

  @EffectHandler(9)
  handleDodge(scope: Scope): void {
    const target = scope.target;
    if (!target) {
      return;
    }
    addEffectBuff(scope, {
      onBlockDamage: (_fight, ctx) => {
        if (
          ctx.cause !== "direct" ||
          fightDistance(
            scope.fight.fightMap,
            ctx.attacker.cell,
            target.cell
          ) !== 1
        ) {
          return;
        }
        const from = target.cell;
        this.displace(
          {
            ...scope,
            caster: ctx.attacker,
            castTargetCell: ctx.attacker.cell,
            effect: { ...scope.effect, min: 1, max: 1, dice: "" },
          },
          false,
          false
        );
        if (target.cell !== from) {
          ctx.absorbed += ctx.amount;
          ctx.amount = 0;
        }
      },
    });
  }

  @EffectHandler(765)
  handleSacrifice(scope: Scope): void {
    addEffectBuff(scope, {
      resolveTarget: (_fight, original) => {
        if (scope.caster.dead || scope.caster === original) {
          return null;
        }
        this.handleSwap({ ...scope, target: original });
        return scope.caster;
      },
    });
  }

  @EffectHandler(784)
  handleRollback(scope: Scope): void {
    const { fight } = scope;
    // Reserve destinations first, so cycles (A on B's start cell) resolve atomically.
    const candidates = fight
      .fighters()
      .filter((f) => !f.dead && f.initialCell >= 0 && !f.isInvocation());
    const movable = new Set(candidates.map((f) => f.id));
    let changed = true;
    while (changed) {
      changed = false;
      for (const fighter of candidates) {
        const occupant = fight.fightMap.occupantOf(fighter.initialCell);
        if (
          movable.has(fighter.id) &&
          occupant !== undefined &&
          !movable.has(occupant)
        ) {
          movable.delete(fighter.id);
          changed = true;
        }
      }
      // A carried summon has no starting position. It must be able to land
      // where its carrier stood; otherwise this pair remains in place.
      for (const fighter of candidates) {
        if (
          !movable.has(fighter.id) ||
          fighter.carryingId === null ||
          movable.has(fighter.carryingId)
        ) {
          continue;
        }
        if (
          candidates.some(
            (other) =>
              movable.has(other.id) && other.initialCell === fighter.cell
          )
        ) {
          movable.delete(fighter.id);
          changed = true;
        }
      }
    }
    const entries = candidates
      .filter((f) => movable.has(f.id))
      .map((fighter) => ({ fighter, from: fighter.cell }));
    for (const { fighter } of entries) {
      fight.fightMap.free(fighter.cell, fighter.id);
    }
    // Assign all destinations before detaching: releaseCarried must never
    // occupy a moving character's previous cell on behalf of its passenger.
    for (const { fighter } of entries) {
      fighter.cell = fighter.initialCell;
      fight.fightMap.occupy(fighter.cell, fighter.id);
    }
    const released = new Set<number>();
    for (const { fighter } of entries) {
      const carrier = fight
        .fighters()
        .find((f) => f.id === fighter.carriedById);
      for (const owner of [fighter, carrier]) {
        if (!owner || owner.carryingId === null || released.has(owner.id)) {
          continue;
        }
        released.add(owner.id);
        releaseCarried(scope, owner);
      }
    }
    for (const { fighter, from } of entries) {
      scope.emitter.emitTeleport(fight, fighter.id, from, fighter.cell);
    }
    for (const { fighter } of entries) {
      if (!fighter.dead) {
        fight.fightMap.fireArrivalTriggers(fight, fighter, fighter.cell);
      }
    }
  }

  private displace(scope: Scope, pull: boolean, collisionDamage = true): void {
    const { target, caster, fight, emitter } = scope;
    if (
      !target ||
      target.dead ||
      target.carriedById !== null ||
      target.states.has(FightStateId.Rooted)
    ) {
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
        if (!pull && collisionDamage) {
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
          applyDamageToTarget(
            { ...scope, cause: "push" },
            amount,
            Element.Neutral
          );
          const blocker = fight
            .fighters()
            .find((fighter) => !fighter.dead && fighter.cell === next);
          if (blocker) {
            applyDamageToTarget(
              { ...scope, target: blocker, cause: "push" },
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
      releaseCarried(scope, target);
      emitter.emitTeleport(fight, target.id, from, next);
      map.fireArrivalTriggers(fight, target, next);
      if (target.dead || target.cell !== next) {
        break;
      }
    }
  }
}

export function fearTarget(
  scope: Pick<Scope, "fight" | "caster" | "targetCell">
): Fighter | undefined {
  const map = scope.fight.fightMap;
  const a = cellToCoord(scope.caster.cell, map.width);
  const b = cellToCoord(scope.targetCell, map.width);
  if ((a.x !== b.x && a.y !== b.y) || (a.x === b.x && a.y === b.y)) {
    return;
  }
  const cell =
    scope.caster.cell +
    (a.x !== b.x
      ? Math.sign(b.x - a.x) * map.width
      : Math.sign(b.y - a.y) * (map.width - 1));
  return scope.fight
    .fighters()
    .find(
      (f) =>
        !f.dead &&
        f.carriedById === null &&
        f.cell === cell &&
        !f.states.has(FightStateId.Rooted)
    );
}
