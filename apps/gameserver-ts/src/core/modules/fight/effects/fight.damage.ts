import type { Scope } from "@modules/fight/effects/fight.effect-registry.types";
import { rollEffect } from "@modules/fight/effects/fight.effect-registry";
import { Characteristic, Element } from "@modules/fight/fight.types";
import { match } from "ts-pattern";

import type { Fighter } from "../core/fight.fighter";
import type { DamageContext } from "./fight.buff.types";
import { killFighter } from "./fight.effect-lifecycle";

export function elementStat(element: number): Characteristic {
  return match(element)
    .with(Element.Earth, () => Characteristic.Strength)
    .with(Element.Water, () => Characteristic.Chance)
    .with(Element.Fire, () => Characteristic.Intelligence)
    .with(Element.Air, () => Characteristic.Agility)
    .otherwise(() => Characteristic.Strength);
}

export function elementResistFlat(element: number): Characteristic {
  return match(element)
    .with(Element.Neutral, () => Characteristic.ResistNeutral)
    .with(Element.Earth, () => Characteristic.ResistEarth)
    .with(Element.Water, () => Characteristic.ResistWater)
    .with(Element.Fire, () => Characteristic.ResistFire)
    .with(Element.Air, () => Characteristic.ResistAir)
    .otherwise(() => Characteristic.ResistNeutral);
}

export function elementResistPct(element: number): Characteristic {
  return match(element)
    .with(Element.Neutral, () => Characteristic.ResistNeutralPct)
    .with(Element.Earth, () => Characteristic.ResistEarthPct)
    .with(Element.Water, () => Characteristic.ResistWaterPct)
    .with(Element.Fire, () => Characteristic.ResistFirePct)
    .with(Element.Air, () => Characteristic.ResistAirPct)
    .otherwise(() => Characteristic.ResistNeutralPct);
}

export function calculateDamage(
  scope: Scope,
  element: number,
  base?: number,
  boosted = true
): number {
  let roll = base ?? rollEffect(scope);
  if (scope.cause === "life-cost") {
    return Math.max(0, roll);
  }
  const { caster, target } = scope;
  if (!target) {
    return 0;
  }

  for (const buff of caster.buffs.all()) {
    if (
      buff.effectId === 293 &&
      buff.value === scope.spell.spellId &&
      buff.createdTurn !== caster.turnCount
    ) {
      roll += buff.sourceEffect?.special ?? 0;
    }
  }
  const stat = boosted ? caster.stats.get(elementStat(element)) : 0;
  const pctDmg = boosted
    ? caster.stats.get(Characteristic.DamagePercent) +
      (scope.cause === "trap"
        ? caster.stats.get(Characteristic.DamageTrapPercent)
        : 0)
    : 0;
  const flatDmg = boosted
    ? caster.stats.get(Characteristic.DamageBonus) +
      (element === Element.Neutral || element === Element.Earth
        ? caster.stats.get(Characteristic.DamagePhysical)
        : 0) +
      (scope.cause === "trap" ? caster.stats.get(Characteristic.DamageTrap) : 0)
    : 0;

  const raw =
    Math.floor(roll * ((100 + Math.max(0, stat + pctDmg)) / 100)) + flatDmg;

  const flatRes =
    scope.cause === "poison" ? 0 : target.stats.get(elementResistFlat(element));
  let pctRes = target.stats.get(elementResistPct(element));
  if (target.player) {
    pctRes = Math.min(50, pctRes);
  }

  const afterFlat = raw - flatRes;
  return Math.max(0, Math.floor(afterFlat - (afterFlat * pctRes) / 100));
}

/** Redirect offensive effects before calculating the receiving fighter's resistance. */
export function damageScope(scope: Scope): Scope {
  if (
    !scope.target ||
    scope.target.dead ||
    scope.cause === "reflection" ||
    scope.cause === "life-cost" ||
    scope.cause === "poison"
  ) {
    return scope;
  }
  let target: Fighter = scope.target;
  const visited = new Set<number>();
  while (!visited.has(target.id)) {
    visited.add(target.id);
    const redirected: Fighter | null | undefined = target.buffs
      .all()
      .map((buff) => buff.resolveTarget?.(scope.fight, target))
      .find((fighter) => fighter && !fighter.dead && !visited.has(fighter.id));
    if (!redirected) {
      break;
    }
    target = redirected;
  }
  if (
    (scope.cause ?? "direct") === "direct" &&
    target.id !== scope.caster.id &&
    target.buffs
      .all()
      .some((buff) => buff.effectId === 106 && buff.value >= scope.spell.level)
  ) {
    scope.emitter.emitReflection?.(scope.fight, target.id, 1, true);
    target = scope.caster;
  }
  return { ...scope, target };
}

export function dealSpellDamage(
  scope: Scope,
  element: number,
  base?: number,
  boosted = true
): number {
  const receiving = damageScope(scope);
  return applyDamageToTarget(
    receiving,
    calculateDamage(receiving, element, base, boosted),
    element
  );
}

function armorReduction(scope: Scope, element: number): number {
  const target = scope.target;
  if (!target || scope.cause === "life-cost") {
    return 0;
  }
  let reduction = 0;
  for (const buff of target.buffs.all()) {
    if (
      (buff.effectId === 184 &&
        (element === Element.Neutral || element === Element.Earth)) ||
      (buff.effectId === 183 &&
        element !== Element.Neutral &&
        element !== Element.Earth)
    ) {
      reduction += buff.value;
      continue;
    }
    if (
      scope.cause === "poison" ||
      scope.cause === "push" ||
      (buff.effectId !== 105 && buff.effectId !== 265)
    ) {
      continue;
    }
    let owner = target;
    if (buff.effectId === 265) {
      const elements: Record<number, number[]> = {
        1: [Element.Fire],
        6: [Element.Earth, Element.Neutral],
        14: [Element.Air],
        18: [Element.Water],
      };
      if (
        elements[buff.spellId ?? 0] &&
        !elements[buff.spellId ?? 0]?.includes(element)
      ) {
        continue;
      }
      owner =
        scope.fight.fighters().find((f) => f.id === buff.casterId) ?? target;
    }
    reduction += Math.floor(
      (buff.value *
        (100 +
          Math.max(0, owner.stats.get(Characteristic.Intelligence)) / 2 +
          Math.max(0, owner.stats.get(elementStat(element))) / 2)) /
        100
    );
  }
  return reduction;
}

export function applyDamageToTarget(
  scope: Scope,
  damage: number,
  element: number
): number {
  const { target, caster, fight, emitter } = scope;
  if (!target || target.dead || damage <= 0) {
    return 0;
  }

  const cause = scope.cause ?? "direct";
  const context: DamageContext = {
    attacker: caster,
    defender: target,
    element,
    amount: damage,
    critical: scope.critical,
    indirect: cause !== "direct",
    cause,
    absorbed: 0,
    reflected: 0,
  };
  if (cause !== "life-cost") {
    target.buffs.each((buff) => buff.onBlockDamage?.(fight, context));
    const armor = Math.min(context.amount, armorReduction(scope, element));
    context.amount = Math.max(0, context.amount - armor);
    context.absorbed += armor;
    if (armor > 0) {
      emitter.emitReduction?.(fight, target.id, armor);
    }
    if (cause === "direct" && caster.id !== target.id) {
      const reflect = Math.min(
        context.amount,
        Math.floor(
          target.stats.get(Characteristic.ReflectFlat) *
            (1 + Math.max(0, target.stats.get(Characteristic.Wisdom)) / 100)
        )
      );
      if (reflect > 0) {
        context.amount -= reflect;
        context.reflected = reflect;
        emitter.emitReflection?.(fight, target.id, reflect, false);
        applyDamageToTarget(
          { ...scope, caster: target, target: caster, cause: "reflection" },
          reflect,
          element
        );
      }
      target.buffs.each((buff) => buff.onReflectDamage?.(fight, context));
    }
    const chance = target.buffs
      .all()
      .find((buff) => buff.effectId === 79)?.sourceEffect;
    if (chance && context.amount > 0) {
      if (fight.random() * 100 < chance.special) {
        healTarget(scope, context.amount * chance.max);
        return 0;
      }
      context.amount *= chance.min;
    }
  }
  damage = Math.min(Math.max(0, Math.floor(context.amount)), target.lp);
  if (damage <= 0) {
    return 0;
  }
  context.amount = damage;
  if (cause !== "life-cost") {
    const erosion = Math.min(
      50,
      target.buffs
        .all()
        .reduce(
          (sum, buff) => sum + (buff.effectId === 776 ? buff.value : 0),
          target.player ? 10 : 0
        )
    );
    target.lpMax = Math.max(
      1,
      target.lpMax - Math.floor((damage * erosion) / 100)
    );
  }
  target.setLp(target.lp - damage);
  caster.damageDealt += damage;
  target.damageTaken += damage;
  emitter.emitDamage(fight, caster.id, target.id, damage, element);

  const lifeTree = target.buffs.has(786);
  if (target.dead) {
    killFighter(scope, target);
  } else if (cause !== "life-cost") {
    target.buffs.each((buff) => {
      if (context.indirect) {
        buff.onIndirectDamage?.(fight, context);
      } else {
        buff.onDirectDamage?.(fight, context);
      }
    });
  }
  if (lifeTree && !caster.dead && cause !== "reflection") {
    healTarget({ ...scope, target: caster }, damage);
  }
  return damage;
}

export function healTarget(scope: Scope, amount: number): void {
  const { target, caster, fight, emitter } = scope;
  if (!target || target.dead || amount <= 0) {
    return;
  }

  const actual = Math.min(amount, target.lpMax - target.lp);
  if (actual <= 0) {
    return;
  }

  target.setLp(target.lp + actual);
  emitter.emitHeal(fight, caster.id, target.id, actual);
}
