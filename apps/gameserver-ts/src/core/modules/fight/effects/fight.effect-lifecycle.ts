import type { Fighter } from "../core/fight.fighter";
import type { Buff } from "./fight.buff.types";
import type { Emitter, Scope } from "./fight.effect-registry.types";
import { ActiveState } from "../core/fight.active-state";
import { FightStateId } from "../fight.types";
import { emptyStatModifier } from "./fight.buff.types";

export function addEffectBuff(
  scope: Scope,
  options: Partial<Buff> = {}
): Buff | undefined {
  const target = scope.target;
  if (!target || target.dead) {
    return;
  }
  const periodic = options.periodic ?? false;
  let remaining = options.remaining ?? scope.effect.duration;
  if (!periodic && target.id === scope.caster.id && remaining > 0) {
    remaining--;
  }
  const buff: Buff = {
    id: 0,
    effectId: scope.effect.id,
    casterId: scope.caster.id,
    targetId: target.id,
    value: scope.effect.min,
    statModifier: emptyStatModifier(),
    spellId: scope.spell.spellId,
    sourceEffect: scope.effect,
    dispellable: ![293, 788, 950].includes(scope.effect.id),
    createdTurn: target.turnCount,
    ...options,
    remaining,
  };
  target.buffs.add(buff);
  buff.onApply?.(scope.fight, target);
  scope.emitter.emitBuff(scope.fight, scope.caster.id, target.id, buff);
  return buff;
}

export function removeEffectBuff(
  scope: Pick<Scope, "fight" | "emitter">,
  target: Fighter,
  buff: Buff
): void {
  if (!target.buffs.remove(buff.id)) {
    return;
  }
  buff.onRemove?.(scope.fight, target);
}

export function dispelEffects(scope: Scope, target: Fighter): void {
  for (const buff of target.buffs.all()) {
    if (buff.dispellable !== false) {
      removeEffectBuff(scope, target, buff);
    }
  }
  syncBuffs(scope, target);
}

export function syncBuffs(
  scope: Pick<Scope, "fight" | "emitter">,
  target: Fighter
): void {
  scope.emitter.emitDispel?.(scope.fight, target.id);
  // The removal packet clears the client list: resend the effects that survive it.
  for (const buff of target.buffs.all()) {
    scope.emitter.emitBuff(scope.fight, buff.casterId, target.id, buff);
  }
}

export function revealFighter(scope: Scope, fighter: Fighter): void {
  const hadInvisibility = fighter.buffs
    .all()
    .some((buff) => buff.effectId === 150);
  for (const buff of fighter.buffs.all()) {
    if (buff.effectId === 150) {
      removeEffectBuff(scope, fighter, buff);
    }
  }
  if (fighter.invisible) {
    fighter.invisible = false;
    scope.emitter.emitVisibility?.(scope.fight, fighter);
  }
  if (hadInvisibility) {
    syncBuffs(scope, fighter);
  }
}

export function releaseCarried(
  scope: Pick<Scope, "fight"> & {
    emitter: Pick<Emitter, "emitUncarry" | "emitState">;
  },
  carrier: Fighter,
  thrown = false
): Fighter | undefined {
  const carried = scope.fight
    .fighters()
    .find((f) => f.id === carrier.carryingId);
  carrier.carryingId = null;
  carrier.states.clear(FightStateId.Carrying);
  if (!carried) {
    return;
  }
  carried.carriedById = null;
  carried.states.clear(FightStateId.Carried);
  if (!carried.dead && scope.fight.fightMap.isFree(carried.cell)) {
    scope.fight.fightMap.occupy(carried.cell, carried.id);
  }
  scope.emitter.emitUncarry?.(scope.fight, carrier, carried, thrown);
  scope.emitter.emitState?.(
    scope.fight,
    carrier.id,
    FightStateId.Carrying,
    false
  );
  scope.emitter.emitState?.(
    scope.fight,
    carried.id,
    FightStateId.Carried,
    false
  );
  return carried;
}

/** All lethal effects share one cleanup path, including expiry and owner death. */
export function killFighter(
  scope: Pick<Scope, "fight" | "emitter">,
  target: Fighter
): void {
  if (target.dead && target.deathOrder > 0) {
    return;
  }
  const { fight, emitter } = scope;
  target.setLp(0);
  target.deathOrder = ++fight.deathSequence;
  fight.fightMap.free(target.cell, target.id);
  releaseCarried(scope, target);
  const carrier = fight.fighters().find((f) => f.id === target.carriedById);
  if (carrier) {
    releaseCarried(scope, carrier);
  }
  emitter.emitDeath(fight, target.id);
  for (const buff of target.buffs.all()) {
    buff.onDeath?.(fight, target);
    removeEffectBuff(scope, target, buff);
  }
  if (fight.state instanceof ActiveState) {
    fight.state.turnList.remove(target.id);
  }
  for (const child of fight.fighters()) {
    if (
      !child.dead &&
      (child.invocatorId === target.id || child.revivedById === target.id)
    ) {
      killFighter(scope, child);
    }
  }
  for (const object of fight.fightMap.objects.snapshot()) {
    if (object.casterId === target.id) {
      fight.fightMap.objects.remove(object.id);
      if (object.kind === 1) {
        emitter.emitTrapRemove(fight, object.cell);
      } else {
        emitter.emitGlyphRemove(fight, object.cell);
      }
    }
  }
  fight.modules.fireFighterDied(fight, target);
  emitter.emitRoster?.(fight);
}
