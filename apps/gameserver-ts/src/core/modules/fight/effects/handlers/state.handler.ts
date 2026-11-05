import { Injectable } from "@nestjs/common";

import type { Scope } from "../fight.effect-registry.types";
import { FightStateId } from "../../fight.types";
import { EffectHandler } from "../fight.effect-handler.decorator";
import {
  addEffectBuff,
  removeEffectBuff,
  revealFighter,
  syncBuffs,
} from "../fight.effect-lifecycle";

@Injectable()
export class StateEffectHandler {
  @EffectHandler(140)
  handleSkipTurn(scope: Scope): void {
    const target = scope.target;
    if (!target || target.dead) {
      return;
    }
    target.skipTurns++;
    addEffectBuff(scope, {
      remaining: 1,
      periodic: true,
      onRemove: () => {
        target.skipTurns = 0;
      },
    });
  }

  @EffectHandler(150)
  handleInvisibility(scope: Scope): void {
    const target = scope.target;
    if (
      !target ||
      target.dead ||
      target.carriedById !== null ||
      target.carryingId !== null
    ) {
      return;
    }
    addEffectBuff(scope, {
      onApply: () => {
        target.invisible = true;
        scope.emitter.emitVisibility?.(scope.fight, target);
      },
      onRemove: () => {
        if (!target.buffs.has(150)) {
          target.invisible = false;
          scope.emitter.emitVisibility?.(scope.fight, target);
        }
      },
    });
  }

  @EffectHandler(202)
  handleReveal(scope: Scope): void {
    if (scope.target) {
      revealFighter(scope, scope.target);
    }
    for (const object of scope.fight.fightMap.objects.snapshot()) {
      if (
        object.cellEligible?.(scope.targetCell) ||
        object.cell === scope.targetCell
      ) {
        object.visibleToTeams?.add(scope.caster.team?.side ?? 0);
        if (object.kind === 1) {
          scope.emitter.emitTrapAdd(
            scope.fight,
            object.casterId,
            object.cell,
            object.size,
            object.color,
            object.areaKind ?? 7
          );
        }
      }
    }
  }

  @EffectHandler(781, 782)
  handleForcedRoll(scope: Scope): void {
    addEffectBuff(scope);
  }

  @EffectHandler(149)
  handleAppearance(scope: Scope): void {
    const target = scope.target;
    if (!target || target.dead) {
      return;
    }
    if (scope.effect.special < 0) {
      for (const buff of target.buffs.all()) {
        if (
          buff.effectId === 149 &&
          (scope.effect.special === -1 || buff.value === -scope.effect.special)
        ) {
          removeEffectBuff(scope, target, buff);
        }
      }
      syncBuffs(scope, target);
      return;
    }
    const gfx =
      scope.spell.spellId === 686 && target.player?.sex === 1
        ? 8011
        : scope.effect.special;
    addEffectBuff(scope, {
      value: gfx,
      onApply: () => {
        target.appearanceGfx = gfx;
        scope.emitter.emitAppearance?.(scope.fight, target);
      },
      onRemove: () => {
        target.appearanceGfx =
          target.buffs
            .all()
            .filter((buff) => buff.effectId === 149)
            .at(-1)?.value ?? null;
        scope.emitter.emitAppearance?.(scope.fight, target);
      },
    });
  }

  @EffectHandler(950)
  handleSetState(scope: Scope): void {
    const target = scope.target;
    if (!target || target.dead) {
      return;
    }
    const state = scope.effect.special as FightStateId;
    addEffectBuff(scope, {
      dispellable: false,
      onApply: () => {
        target.states.set(state, -1);
        scope.emitter.emitState?.(scope.fight, target.id, state, true);
      },
      onRemove: () => {
        if (
          !target.buffs
            .all()
            .some(
              (buff) =>
                buff.effectId === 950 && buff.sourceEffect?.special === state
            )
        ) {
          target.states.clear(state);
          scope.emitter.emitState?.(scope.fight, target.id, state, false);
        }
      },
    });
  }

  @EffectHandler(951)
  handleRemoveState(scope: Scope): void {
    const target = scope.target;
    if (!target) {
      return;
    }
    const state = scope.effect.special as FightStateId;
    for (const buff of target.buffs.all()) {
      if (buff.effectId === 950 && buff.sourceEffect?.special === state) {
        removeEffectBuff(scope, target, buff);
      }
    }
    target.states.clear(state);
    scope.emitter.emitState?.(scope.fight, target.id, state, false);
    syncBuffs(scope, target);
  }
}
