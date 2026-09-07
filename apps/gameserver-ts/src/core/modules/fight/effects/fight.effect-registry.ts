import type {
  EffectHandler,
  Scope,
} from "@modules/fight/effects/fight.effect-registry.types";
import { FightStateId } from "@modules/fight/fight.types";

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
  if (scope.caster.states.has(FightStateId.RollMinimize)) {
    return min;
  }
  if (scope.caster.states.has(FightStateId.RollMaximize)) {
    return max;
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
}
