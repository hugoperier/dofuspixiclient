import { fightDistance } from "@dofus/grid";

import type { SpellLevel } from "../cast/fight.spell.types";
import type { Fighter } from "../core/fight.fighter";
import type { Scope } from "./fight.effect-registry.types";
import { Element } from "../fight.types";
import { cellsInArea } from "../map/fight.area";
import { applyDamageToTarget, healTarget } from "./fight.damage";
import {
  EffectRegistry,
  rollEffect,
  selectEffects,
} from "./fight.effect-registry";
import { isValidTarget, matchesTargetFilter } from "./fight.target-mask";

const CELL_EFFECTS = new Set([
  4, 50, 51, 180, 181, 185, 400, 401, 780, 783, 784,
]);
const CASTER_EFFECTS = new Set([109, 120, 293]);

/** One executor for casts, ground objects and delayed spells. Targets survive movement. */
export function executeSpellEffects(
  registry: EffectRegistry,
  scope: Scope,
  spell: SpellLevel,
  targets?: Fighter[]
): number[] {
  const effects = selectEffects(
    scope.critical && spell.criticalEffects.length
      ? spell.criticalEffects
      : spell.effects,
    () => scope.fight.random(),
    spell.spellId
  );
  const context: Scope = {
    ...scope,
    spell,
    applyEffect: (next) => registry.apply(next),
    applySpell: (next, child, victims) => {
      executeSpellEffects(registry, next, child, victims);
    },
  };
  const plans = effects.map((effect) => {
    const self =
      CASTER_EFFECTS.has(effect.id) || Boolean((effect.targetFilter ?? 0) & 32);
    const cells = self
      ? [scope.caster.cell]
      : CELL_EFFECTS.has(effect.id)
        ? [scope.targetCell]
        : targets
          ? targets.map((target) => target.cell)
          : cellsInArea(
              scope.fight.fightMap,
              scope.caster.cell,
              scope.targetCell,
              effect.areaKind,
              effect.areaSize
            );
    const victims = cells.map((cell) => ({
      cell,
      target: self
        ? scope.caster
        : ((targets ?? scope.fight.fighters()).find(
            (f) => !f.dead && f.cell === cell && f.carriedById === null
          ) ?? null),
    }));
    return { effect, victims };
  });
  const affected = new Set<number>();
  for (const { effect, victims } of plans) {
    if (effect.id === 666) {
      continue;
    }
    const trigger = scope.triggerCache?.get(
      `${effect.min}:${effect.max > 0 ? effect.max : spell.level}`
    );
    const effectScope: Scope = {
      ...context,
      effect,
      ...(trigger ? { triggerSpell: trigger } : {}),
    };
    if (effect.id === 202) {
      for (const { cell, target } of victims) {
        registry.apply({ ...effectScope, target, targetCell: cell });
        affected.add(cell);
      }
      continue;
    }
    const eligible = victims.filter(
      ({ target }) =>
        CELL_EFFECTS.has(effect.id) ||
        (isValidTarget(effect.targetMask, scope.caster, target) &&
          target &&
          matchesTargetFilter(effect.targetFilter ?? 0, scope.caster, target))
    );
    if (effect.id === 5) {
      eligible.sort(
        (a, b) =>
          fightDistance(scope.fight.fightMap, b.cell, scope.targetCell) -
          fightDistance(scope.fight.fightMap, a.cell, scope.targetCell)
      );
    }
    if (effect.id === 90) {
      const amount = Math.floor(
        (scope.caster.lp * rollEffect(effectScope)) / 100
      );
      applyDamageToTarget(
        { ...effectScope, target: scope.caster, cause: "life-cost" },
        amount,
        Element.Neutral
      );
      for (const { target, cell } of eligible) {
        healTarget({ ...effectScope, target }, amount);
        affected.add(cell);
      }
      continue;
    }
    for (const { cell, target } of eligible) {
      if (target?.dead && !CELL_EFFECTS.has(effect.id)) {
        continue;
      }
      affected.add(cell);
      registry.apply({
        ...effectScope,
        targetCell: cell,
        castTargetCell: scope.targetCell,
        target,
      });
    }
  }
  return [...affected];
}
