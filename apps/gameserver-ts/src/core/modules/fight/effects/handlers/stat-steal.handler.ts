import type { Scope } from "@modules/fight/effects/fight.effect-registry.types";
import { EffectHandler } from "@modules/fight/effects/fight.effect-handler.decorator";
import { rollEffect } from "@modules/fight/effects/fight.effect-registry";
import { Characteristic } from "@modules/fight/fight.types";
import { Injectable } from "@nestjs/common";
import { match } from "ts-pattern";

import { applyStatBoost } from "./stat-boost.handler";

@Injectable()
export class StatStealEffectHandler {
  @EffectHandler(266, 267, 268, 269, 270, 271, 320)
  handle(scope: Scope): void {
    const target = scope.target;
    if (!target || target.dead) {
      return;
    }

    const char = match(scope.effect.id)
      .with(266, () => Characteristic.Chance)
      .with(267, () => Characteristic.Vitality)
      .with(268, () => Characteristic.Agility)
      .with(269, () => Characteristic.Intelligence)
      .with(270, () => Characteristic.Wisdom)
      .with(271, () => Characteristic.Strength)
      .with(320, () => Characteristic.Range)
      .otherwise(() => Characteristic.Strength);

    const value = rollEffect(scope);

    applyStatBoost(scope, char, -value);
    applyStatBoost({ ...scope, target: scope.caster }, char, value);
  }
}
