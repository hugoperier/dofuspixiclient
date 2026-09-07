import type { Scope } from "@modules/fight/effects/fight.effect-registry.types";
import { emptyStatModifier } from "@modules/fight/effects/fight.buff";
import { EffectHandler } from "@modules/fight/effects/fight.effect-handler.decorator";
import { rollEffect } from "@modules/fight/effects/fight.effect-registry";
import { Characteristic } from "@modules/fight/fight.types";
import { Injectable } from "@nestjs/common";

@Injectable()
export class ApMpEffectHandler {
  @EffectHandler(101, 168)
  handleApLoss(scope: Scope): void {
    this.remove(scope, true, false);
  }
  @EffectHandler(127, 169)
  handleMpLoss(scope: Scope): void {
    this.remove(scope, false, false);
  }
  @EffectHandler(84)
  handleApSteal(scope: Scope): void {
    this.remove(scope, true, true);
  }
  @EffectHandler(77)
  handleMpSteal(scope: Scope): void {
    this.remove(scope, false, true);
  }

  private remove(scope: Scope, ap: boolean, steal: boolean): void {
    const { target, caster, fight, emitter, effect } = scope;
    if (!target || target.dead) {
      return;
    }
    const stat = ap
      ? Characteristic.ActionPoints
      : Characteristic.MovementPoints;
    const dodgeStat = ap ? Characteristic.DodgeAP : Characteristic.DodgeMP;
    const remaining = ap ? target.ap : target.mp;
    const maximum = Math.max(1, target.stats.get(stat));
    const attack = Math.max(1, caster.stats.get(Characteristic.Wisdom) / 4);
    const defense = Math.max(
      1,
      target.stats.get(Characteristic.Wisdom) / 4 + target.stats.get(dodgeStat)
    );
    let loss = 0;
    for (
      let i = 0, count = Math.min(rollEffect(scope), remaining);
      i < count;
      i++
    ) {
      const probability = Math.max(
        0.1,
        Math.min(
          0.9,
          (((0.5 * attack) / defense) * (remaining - loss)) / maximum
        )
      );
      if (
        effect.id === 168 ||
        effect.id === 169 ||
        fight.random() < probability
      ) {
        loss++;
      }
    }
    if (loss === 0) {
      return;
    }
    if (ap) {
      target.spendAp(loss);
      emitter.emitAPLoss(fight, caster.id, target.id, loss);
    } else {
      target.spendMp(loss);
      emitter.emitMPLoss(fight, caster.id, target.id, loss);
    }
    if (effect.duration > 0) {
      target.stats.addBuff(stat, -loss);
      target.buffs.add({
        id: 0,
        effectId: effect.id,
        casterId: caster.id,
        targetId: target.id,
        remaining: effect.duration,
        value: -loss,
        statModifier: emptyStatModifier(),
        onRemove: (_fight, fighter) => fighter.stats.removeBuff(stat, -loss),
      });
    }
    if (steal) {
      if (ap) {
        caster.ap += loss;
        emitter.emitAPLoss(fight, caster.id, caster.id, -loss);
      } else {
        caster.mp += loss;
        emitter.emitMPLoss(fight, caster.id, caster.id, -loss);
      }
    }
  }
}
