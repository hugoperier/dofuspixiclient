import type {
  EffectHandler,
  Scope,
} from "@modules/fight/effects/fight.effect-registry.types";
import { FightStateId } from "@modules/fight/fight.types";

import { emptyStatModifier } from "./fight.buff.types";

export type {
  EffectHandler,
  Emitter,
  Scope,
} from "@modules/fight/effects/fight.effect-registry.types";

export function rollEffect(scope: Scope): number {
  const { min, max } = scope.effect;
  if (max <= min) {
    return min;
  }
  if (
    scope.target?.buffs.has(782) ||
    scope.target?.states.has(FightStateId.RollMaximize)
  ) {
    return max;
  }
  if (
    scope.caster.buffs.has(781) ||
    scope.caster.states.has(FightStateId.RollMinimize)
  ) {
    return min;
  }
  const dice = scope.effect.dice?.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (dice) {
    const count = Number(dice[1]);
    const sides = Number(dice[2]);
    if (count > 0 && count <= 100 && sides > 0) {
      let value = Number(dice[3] ?? 0);
      for (let i = 0; i < count; i++) {
        value += 1 + Math.floor(scope.fight.random() * sides);
      }
      return Math.max(min, Math.min(max, value));
    }
  }
  return min + Math.floor(scope.fight.random() * (max - min + 1));
}

export class EffectRegistry {
  private handlers = new Map<number, EffectHandler>();

  register(id: number, h: EffectHandler): void {
    this.handlers.set(id, h);
  }

  handler(id: number): EffectHandler | undefined {
    return this.handlers.get(id);
  }

  apply(scope: Scope): void {
    const target = scope.target;
    if (
      !scope.immediate &&
      scope.effect.duration > 0 &&
      ((scope.effect.id >= 91 && scope.effect.id <= 100) ||
        scope.effect.id === 108)
    ) {
      if (!target || target.dead) {
        return;
      }
      const buff = {
        id: 0,
        effectId: scope.effect.id,
        casterId: scope.caster.id,
        targetId: target.id,
        remaining: scope.effect.duration,
        value: scope.effect.min,
        statModifier: emptyStatModifier(),
        spellId: scope.spell.spellId,
        sourceEffect: scope.effect,
        periodic: true,
        dispellable: true,
        onTurnStart: () =>
          this.apply({ ...scope, immediate: true, cause: "poison" }),
      };
      target.buffs.add(buff);
      scope.emitter.emitBuff(scope.fight, scope.caster.id, target.id, buff);
      return;
    }
    const before = new Set(
      scope.fight.fighters().flatMap((f) => f.buffs.all())
    );
    this.handlers.get(scope.effect.id)?.(scope);
    for (const fighter of scope.fight.fighters()) {
      for (const buff of fighter.buffs.all()) {
        if (before.has(buff) || buff.spellId !== undefined) {
          continue;
        }
        buff.spellId = scope.spell.spellId;
        buff.sourceEffect = scope.effect;
        buff.createdTurn = fighter.turnCount;
        buff.dispellable ??= ![293, 788, 950].includes(buff.effectId);
        if (
          !buff.periodic &&
          fighter.id === scope.caster.id &&
          buff.remaining > 0
        ) {
          buff.remaining--;
        }
      }
    }
  }
}

/** One draw per spell for exclusive lines; 0/100 always execute. */
export function selectEffects(
  effects: readonly import("../cast/fight.spell.types").SpellEffect[],
  random: () => number,
  spellId: number
) {
  const choices = effects.filter(
    (effect) => effect.probability > 0 && effect.probability < 100
  );
  if (!choices.length) {
    return [...effects];
  }
  const total = choices.reduce((sum, effect) => sum + effect.probability, 0);
  let roll = random() * (spellId === 101 ? total : 100);
  let chosen: (typeof choices)[number] | undefined;
  for (const effect of choices) {
    if (roll < effect.probability) {
      chosen = effect;
      break;
    }
    roll -= effect.probability;
  }
  return effects.filter(
    (effect) =>
      effect.probability === 0 ||
      effect.probability === 100 ||
      effect === chosen
  );
}
