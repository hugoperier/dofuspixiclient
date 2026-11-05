import { Injectable } from "@nestjs/common";

import type { Scope } from "../fight.effect-registry.types";
import { Characteristic, Element } from "../../fight.types";
import {
  applyDamageToTarget,
  dealSpellDamage,
  healTarget,
} from "../fight.damage";
import { EffectHandler } from "../fight.effect-handler.decorator";
import {
  addEffectBuff,
  dispelEffects,
  killFighter,
  removeEffectBuff,
  syncBuffs,
} from "../fight.effect-lifecycle";
import { rollEffect } from "../fight.effect-registry";
import { applyStatBoost } from "./stat-boost.handler";

@Injectable()
export class SpecialEffectHandler {
  @EffectHandler(82)
  handleFixedLifeSteal(scope: Scope): void {
    const actual = applyDamageToTarget(
      scope,
      Math.max(0, rollEffect(scope)),
      Element.Neutral
    );
    if (actual > 0 && !scope.caster.dead) {
      healTarget({ ...scope, target: scope.caster }, actual);
    }
  }

  @EffectHandler(79, 105, 183, 184, 265, 776, 786)
  handleProtection(scope: Scope): void {
    addEffectBuff(scope, { value: rollEffect(scope) });
  }

  @EffectHandler(106)
  handleSpellReflect(scope: Scope): void {
    addEffectBuff(scope, { value: scope.effect.max });
  }

  @EffectHandler(107)
  handleDamageReflect(scope: Scope): void {
    applyStatBoost(scope, Characteristic.ReflectFlat, rollEffect(scope));
  }

  @EffectHandler(109)
  handleSelfDamage(scope: Scope): void {
    if (scope.effect.duration > 0 && !scope.immediate) {
      addEffectBuff(
        { ...scope, target: scope.caster },
        {
          periodic: true,
          onTurnStart: () =>
            this.handleSelfDamage({ ...scope, immediate: true }),
        }
      );
      return;
    }
    dealSpellDamage(
      { ...scope, target: scope.caster, cause: "life-cost" },
      Element.Neutral,
      rollEffect(scope),
      false
    );
  }

  @EffectHandler(110)
  handleMaxLifeBonus(scope: Scope): void {
    applyStatBoost(scope, Characteristic.Vitality, rollEffect(scope));
  }

  @EffectHandler(132)
  handleDispel(scope: Scope): void {
    if (scope.target && !scope.target.dead) {
      dispelEffects(scope, scope.target);
    }
  }

  @EffectHandler(141)
  handleInstantDeath(scope: Scope): void {
    if (scope.target && !scope.target.dead) {
      killFighter(scope, scope.target);
    }
  }

  @EffectHandler(143)
  handleFixedHeal(scope: Scope): void {
    healTarget(scope, rollEffect(scope));
  }

  @EffectHandler(144)
  handleFixedDamage(scope: Scope): void {
    applyDamageToTarget(scope, Math.max(0, rollEffect(scope)), Element.Neutral);
  }

  @EffectHandler(293)
  handleCharge(scope: Scope): void {
    // The old charge remains through its exact relaunch turn, then expires.
    let replaced = false;
    for (const buff of scope.caster.buffs.all()) {
      if (buff.effectId === 293 && buff.value === scope.effect.min) {
        removeEffectBuff(scope, scope.caster, buff);
        replaced = true;
      }
    }
    if (replaced) {
      syncBuffs(scope, scope.caster);
    }
    addEffectBuff(
      { ...scope, target: scope.caster },
      { remaining: scope.effect.duration + 1 }
    );
  }

  @EffectHandler(672)
  handlePunishment(scope: Scope): void {
    const ratio = scope.caster.lp / scope.caster.lpMax;
    const curve = (Math.cos(2 * Math.PI * (ratio - 0.5)) + 1) ** 2 / 4;
    dealSpellDamage(
      scope,
      Element.Neutral,
      Math.floor((curve * scope.caster.baseLifeMax * rollEffect(scope)) / 100),
      false
    );
  }

  @EffectHandler(130)
  handleGoldSteal(scope: Scope): void {
    const target = scope.target;
    if (
      !target ||
      target.dead ||
      target.isInvocation() ||
      !scope.caster.player
    ) {
      return;
    }
    target.kamasRemaining ??=
      target.monsterKamasMin +
      Math.floor(
        scope.fight.random() *
          (Math.max(0, target.monsterKamasMax - target.monsterKamasMin) + 1)
      );
    const amount = Math.min(
      target.kamasRemaining,
      Math.max(0, rollEffect(scope))
    );
    target.kamasRemaining -= amount;
    scope.caster.stolenKamas += amount;
    scope.emitter.emitGold?.(scope.fight, scope.caster.id, target.id, amount);
  }

  @EffectHandler(131)
  handleActionPoison(scope: Scope): void {
    const target = scope.target;
    if (!target) {
      return;
    }
    addEffectBuff(scope, {
      periodic: true,
      onTurnEnd: () => {
        const spent = Math.floor(
          target.apUsedThisTurn / Math.max(1, scope.effect.min)
        );
        if (spent > 0) {
          dealSpellDamage(
            { ...scope, cause: "poison" },
            Element.Fire,
            spent * scope.effect.max
          );
        }
      },
    });
  }

  @EffectHandler(787)
  handleDelayedSpell(scope: Scope): void {
    const target = scope.target;
    const spell = scope.triggerCache?.get(
      `${scope.effect.min}:${scope.effect.max}`
    );
    if (!target || !spell || !scope.applySpell) {
      return;
    }
    let delay = Math.max(1, scope.effect.special);
    const buff = addEffectBuff(scope, {
      remaining: delay,
      periodic: true,
      onTurnStart: () => {
        if (--delay > 0 || target.dead) {
          return;
        }
        if (buff) {
          removeEffectBuff(scope, target, buff);
        }
        syncBuffs(scope, target);
        scope.emitter.emitGlyphTrigger(
          scope.fight,
          target.id,
          target.cell,
          spell.spellId,
          spell.visualGfxId,
          spell.level,
          target.id
        );
        scope.applySpell?.(
          {
            ...scope,
            caster: target,
            targetCell: target.cell,
            castTargetCell: target.cell,
            cause: "poison",
            critical: false,
          },
          spell
        );
      },
    });
  }

  @EffectHandler(788)
  handlePunishmentBuff(scope: Scope): void {
    const target = scope.target;
    if (!target) {
      return;
    }
    addEffectBuff(scope, {
      dispellable: false,
      onDirectDamage: (_fight, damage) => {
        const old = target.punishmentGains.get(scope.effect.min) ?? 0;
        const factor =
          damage.attacker.player || damage.attacker.isInvocation() ? 2 : 1;
        const gain = Math.max(
          0,
          Math.min(scope.effect.max - old, Math.floor(damage.amount / factor))
        );
        if (!gain) {
          return;
        }
        target.punishmentGains.set(scope.effect.min, old + gain);
        if (scope.effect.min === 108) {
          applyStatBoost(
            {
              ...scope,
              effect: {
                ...scope.effect,
                id: 108,
                duration: scope.effect.special,
              },
            },
            Characteristic.Vitality,
            gain
          );
        } else {
          const effect = {
            ...scope.effect,
            id: scope.effect.min,
            min: gain,
            max: gain,
            special: 0,
            duration: scope.effect.special,
            probability: 0,
            dice: "",
          };
          scope.applyEffect?.({ ...scope, effect, immediate: true });
        }
      },
    });
  }
}
