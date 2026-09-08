import type { SpellEffect, SpellLevel } from "@modules/fight/cast/fight.spell";
import type { Fight } from "@modules/fight/core/fight.entity";
import type { Fighter } from "@modules/fight/core/fight.fighter";
import type { Buff } from "@modules/fight/effects/fight.buff";
import type { SummonTemplate } from "@modules/spells/combat-catalog.types";

export interface Scope {
  fight: Fight;
  caster: Fighter;
  target: Fighter | null;
  targetCell: number;
  castTargetCell?: number;
  effect: SpellEffect;
  spell: SpellLevel;
  critical: boolean;
  emitter: Emitter;
  /**
   * For glyph (effect 401) / trap (effect 400) / summon (effect 185)
   * dispatches: the SpellLevel of the *trigger* spell named in
   * `effect.min`. Pre-loaded by the cast use-case before the handler
   * runs because these effects need to read the trigger's elemental
   * effects (e.g. fire damage 99 → Fire) to colour the deployed
   * glyph in canonical 1.29 element tints. Undefined when the trigger
   * spell can't be resolved (data error) — handlers fall back to a
   * default tint.
   */
  triggerSpell?: SpellLevel;
  triggerCache?: Map<string, SpellLevel>;
  summonCache?: Map<string, SummonTemplate>;
  applyEffect?: (scope: Scope) => void;
  applySpell?: (scope: Scope, spell: SpellLevel, targets?: Fighter[]) => void;
  cause?:
    | "direct"
    | "poison"
    | "trap"
    | "glyph"
    | "reflection"
    | "life-cost"
    | "push";
  immediate?: boolean;
}

export interface Emitter {
  emitSummon?(fight: Fight, casterId: number, fighter: Fighter): void;
  emitRoster?(fight: Fight): void;
  emitState?(
    fight: Fight,
    targetId: number,
    stateId: number,
    enabled: boolean
  ): void;
  emitVisibility?(fight: Fight, fighter: Fighter): void;
  emitAppearance?(fight: Fight, fighter: Fighter): void;
  emitCarry?(fight: Fight, carrier: Fighter, carried: Fighter): void;
  emitUncarry?(
    fight: Fight,
    carrier: Fighter,
    carried: Fighter,
    thrown: boolean
  ): void;
  emitDispel?(fight: Fight, targetId: number): void;
  emitReduction?(fight: Fight, targetId: number, amount: number): void;
  emitReflection?(
    fight: Fight,
    targetId: number,
    amount: number,
    spell: boolean
  ): void;
  emitGold?(
    fight: Fight,
    casterId: number,
    targetId: number,
    amount: number
  ): void;
  emitDamage(
    fight: Fight,
    attackerId: number,
    targetId: number,
    amount: number,
    element: number
  ): void;
  emitHeal(
    fight: Fight,
    healerId: number,
    targetId: number,
    amount: number
  ): void;
  emitDeath(fight: Fight, targetId: number): void;
  emitAPLoss(
    fight: Fight,
    attackerId: number,
    targetId: number,
    amount: number
  ): void;
  emitMPLoss(
    fight: Fight,
    attackerId: number,
    targetId: number,
    amount: number
  ): void;
  emitBuff(fight: Fight, casterId: number, targetId: number, buff: Buff): void;
  emitTeleport(
    fight: Fight,
    targetId: number,
    fromCell: number,
    toCell: number
  ): void;
  emitTrapAdd(
    fight: Fight,
    casterId: number,
    cell: number,
    size: number,
    color: number,
    areaKind: number
  ): void;
  emitGlyphAdd(
    fight: Fight,
    casterId: number,
    cell: number,
    size: number,
    color: number,
    areaKind: number
  ): void;
  emitTrapRemove(fight: Fight, cell: number): void;
  emitGlyphRemove(fight: Fight, cell: number): void;
  emitGlyphTrigger(
    fight: Fight,
    casterId: number,
    cell: number,
    spellId: number,
    visualGfxId?: number,
    rank?: number,
    hiddenPositionOwnerId?: number
  ): void;
}

export type EffectHandler = (scope: Scope) => void;
