import type { Scope } from "@modules/fight/effects/fight.effect-registry.types";
import {
  applyDamageToTarget,
  dealSpellDamage,
  healTarget,
} from "@modules/fight/effects/fight.damage";
import { EffectHandler } from "@modules/fight/effects/fight.effect-handler.decorator";
import { rollEffect } from "@modules/fight/effects/fight.effect-registry";
import { Element } from "@modules/fight/fight.types";
import { Injectable } from "@nestjs/common";
import { match } from "ts-pattern";

import { addEffectBuff } from "../fight.effect-lifecycle";

@Injectable()
export class PctLifeEffectHandler {
  @EffectHandler(85, 86, 87, 88, 89, 671)
  handlePctLifeDamage(scope: Scope): void {
    if (!scope.target || scope.target.dead) {
      return;
    }
    if (scope.effect.duration > 0 && !scope.immediate) {
      const trigger = () =>
        this.handlePctLifeDamage({
          ...scope,
          immediate: true,
          cause: "life-cost",
        });
      if (scope.spell.spellId === 447) {
        addEffectBuff(scope, {
          onDirectDamage: trigger,
          onIndirectDamage: trigger,
        });
      } else {
        addEffectBuff(scope, { periodic: true, onTurnStart: trigger });
      }
      return;
    }
    const element = match(scope.effect.id)
      .with(85, () => Element.Water)
      .with(86, () => Element.Earth)
      .with(87, () => Element.Air)
      .with(88, () => Element.Fire)
      .with(89, () => Element.Neutral)
      .otherwise(() => Element.Neutral);
    const pct = rollEffect(scope);
    const damage = Math.max(0, Math.floor((scope.caster.lp * pct) / 100));
    if (scope.target === scope.caster) {
      applyDamageToTarget({ ...scope, cause: "life-cost" }, damage, element);
    } else {
      dealSpellDamage(scope, element, damage, false);
    }
  }

  @EffectHandler(90)
  handlePctLifeTransfer(scope: Scope): void {
    if (!scope.target || scope.target.dead) {
      return;
    }
    const pct = rollEffect(scope);
    const amount = Math.floor((scope.caster.lp * pct) / 100);
    if (amount <= 0) {
      return;
    }
    applyDamageToTarget(
      { ...scope, target: scope.caster, cause: "life-cost" },
      amount,
      Element.Neutral
    );
    healTarget(scope, amount);
  }
}
