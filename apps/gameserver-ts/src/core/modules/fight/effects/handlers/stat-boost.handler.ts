import { Injectable } from "@nestjs/common";

import type { Scope } from "../fight.effect-registry.types";
import { Characteristic as C } from "../../fight.types";
import { emptyStatModifier } from "../fight.buff.types";
import { EffectHandler } from "../fight.effect-handler.decorator";
import { addEffectBuff, killFighter } from "../fight.effect-lifecycle";
import { rollEffect } from "../fight.effect-registry";

const STATS: Record<number, readonly [C, number]> = {
  78: [C.MovementPoints, 1],
  111: [C.ActionPoints, 1],
  112: [C.DamageBonus, 1],
  115: [C.CriticalHit, 1],
  116: [C.Range, -1],
  117: [C.Range, 1],
  118: [C.Strength, 1],
  119: [C.Agility, 1],
  120: [C.ActionPoints, 1],
  121: [C.DamageBonus, 1],
  122: [C.CriticalFailure, 1],
  123: [C.Chance, 1],
  124: [C.Wisdom, 1],
  125: [C.Vitality, 1],
  126: [C.Intelligence, 1],
  128: [C.MovementPoints, 1],
  138: [C.DamagePercent, 1],
  142: [C.DamagePhysical, 1],
  145: [C.DamageBonus, -1],
  152: [C.Chance, -1],
  153: [C.Vitality, -1],
  154: [C.Agility, -1],
  155: [C.Intelligence, -1],
  157: [C.Strength, -1],
  160: [C.DodgeAP, 1],
  161: [C.DodgeMP, 1],
  162: [C.DodgeAP, -1],
  163: [C.DodgeMP, -1],
  171: [C.CriticalHit, -1],
  176: [C.Prospection, 1],
  178: [C.HealBonus, 1],
  182: [C.MaxSummons, 1],
  186: [C.DamagePercent, -1],
};

export function applyStatBoost(
  scope: Scope,
  characteristic: C,
  value: number
): void {
  const target = scope.target;
  if (!target || target.dead) {
    return;
  }
  const life = characteristic === C.Vitality;
  addEffectBuff(scope, {
    value,
    statModifier: { ...emptyStatModifier(), vitality: life ? value : 0 },
    onApply: () => {
      target.stats.addBuff(characteristic, value);
      if (life) {
        target.lpMax = Math.max(1, target.lpMax + value);
        target.setLp(target.lp + value);
      }
      if (characteristic === C.ActionPoints) {
        target.ap = Math.max(0, target.ap + value);
        scope.emitter.emitAPLoss(
          scope.fight,
          scope.caster.id,
          target.id,
          -value
        );
      }
      if (characteristic === C.MovementPoints) {
        target.mp = Math.max(0, target.mp + value);
        scope.emitter.emitMPLoss(
          scope.fight,
          scope.caster.id,
          target.id,
          -value
        );
      }
    },
    onRemove: () => {
      target.stats.removeBuff(characteristic, value);
      if (characteristic === C.ActionPoints) {
        const before = target.ap;
        target.ap = Math.max(0, target.ap - value);
        scope.emitter.emitAPLoss(
          scope.fight,
          scope.caster.id,
          target.id,
          before - target.ap
        );
      }
      if (characteristic === C.MovementPoints) {
        const before = target.mp;
        target.mp = Math.max(0, target.mp - value);
        scope.emitter.emitMPLoss(
          scope.fight,
          scope.caster.id,
          target.id,
          before - target.mp
        );
      }
      if (life) {
        target.lpMax = Math.max(1, target.lpMax - value);
        target.setLp(target.lp - value);
        if (target.dead) {
          killFighter(scope, target);
        }
      }
    },
  });
}

@Injectable()
export class StatBoostEffectHandler {
  @EffectHandler(
    78,
    111,
    112,
    115,
    116,
    117,
    118,
    119,
    120,
    121,
    122,
    123,
    124,
    125,
    126,
    128,
    138,
    142,
    145,
    152,
    153,
    154,
    155,
    157,
    160,
    161,
    162,
    163,
    171,
    176,
    178,
    182,
    186
  )
  handle(scope: Scope): void {
    const stat = STATS[scope.effect.id];
    if (stat) {
      applyStatBoost(scope, stat[0], rollEffect(scope) * stat[1]);
    }
  }
}
