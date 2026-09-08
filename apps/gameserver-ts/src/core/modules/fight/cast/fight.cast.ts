import type {
  CastResolution,
  CastResult,
  FightRegistry,
  SpellPort,
} from "@modules/fight/cast/fight.cast.types";
import type { SpellLevel } from "@modules/fight/cast/fight.spell";
import type { ActiveState } from "@modules/fight/core/fight.active-state";
import type { Fight } from "@modules/fight/core/fight.entity";
import type { Fighter } from "@modules/fight/core/fight.fighter";
import type { CastContext } from "@modules/fight/effects/fight.buff.types";
import type {
  EffectRegistry,
  Emitter,
  Scope,
} from "@modules/fight/effects/fight.effect-registry";
import { castGeometryError } from "@dofus/grid";
import { CastError } from "@modules/fight/cast/fight.cast.types";
import {
  Characteristic,
  FightStateId,
  StateName,
} from "@modules/fight/fight.types";
import { prepareCombatData } from "@modules/spells/combat-dependencies";
import { combatUnavailableReason } from "@modules/spells/spells.combat-data";

import { executeSpellEffects } from "../effects/fight.effect-executor";
import { revealFighter } from "../effects/fight.effect-lifecycle";
import { fearTarget } from "../effects/handlers/movement.handler";
import {
  lastResurrectableAlly,
  summonLimitReached,
} from "../effects/handlers/summon.handler";

export type {
  CastResolution,
  CastResult,
  FightRegistry,
  SpellPort,
} from "@modules/fight/cast/fight.cast.types";
export type { TeamSide } from "@modules/fight/fight.types";
export { CastError } from "@modules/fight/cast/fight.cast.types";

export class CastSpellUseCase {
  private readonly applied = new WeakSet<CastResolution>();
  constructor(
    private registry: FightRegistry,
    private spells: SpellPort,
    private effects: EffectRegistry,
    private emitter: Emitter
  ) {}

  async getSpellLevel(
    spellId: number,
    level: number
  ): Promise<SpellLevel | undefined> {
    return this.spells.spellLevel(spellId, level);
  }

  /**
   * Phase 1 of a player cast — validate, roll critical/failure,
   * pre-resolve trigger spells. **Pure** with respect to the fight
   * state: no AP spent, no LP changed, no GAs emitted. Throws
   * CastError on validation failure (no fight, not your turn, no AP,
   * out of range, no LOS, on cooldown, blocked by module, unknown
   * spell). Returns a `CastResolution` snapshot the caller hands to
   * `apply()` once it has broadcast directionChange + spellLaunch.
   */
  async resolve(sessionId: string, params: string): Promise<CastResolution> {
    const fight = this.registry.bySession(sessionId);
    if (!fight || fight.state.name !== StateName.Active) {
      throw new CastError("no_fight", "not in a fight");
    }
    const active = fight.state as ActiveState;
    const caster = fight.fighters().find((f) => f.sessionId === sessionId);
    if (!caster) {
      throw new CastError("no_fight", "not in a fight");
    }

    const current = active.turnList.current();
    if (!current || current.id !== caster.id) {
      throw new CastError("not_your_turn", "not your turn");
    }

    const { spellId, targetCell } = parseCastParams(params);
    if (!caster.player) {
      throw new CastError("no_spell", "Personnage introuvable.");
    }
    const level = await this.spells.playerSpellRank(
      String(caster.player.id),
      spellId
    );
    if (!level) {
      throw new CastError("no_spell", "Ce sort n’est pas appris.");
    }
    return this.resolveCast(fight, active, caster, spellId, targetCell, level);
  }

  /**
   * Same as `resolve()`, but for callers that already hold the fight
   * + caster references (Monster AI in fight.lifecycle.service.ts).
   */
  async resolveFor(
    fight: Fight,
    caster: Fighter,
    spellId: number,
    targetCell: number,
    level: number
  ): Promise<CastResolution> {
    if (fight.state.name !== StateName.Active) {
      throw new CastError("no_fight", "not in a fight");
    }
    const active = fight.state as ActiveState;
    return this.resolveCast(fight, active, caster, spellId, targetCell, level);
  }

  /**
   * Phase 2 — mutate fighter state and broadcast effect GAs (damage,
   * heal, status, summons, death). Must be called AFTER the caller
   * has broadcast `directionChange` + `spellLaunch`, otherwise the
   * client will receive the damage GA before its `onSpellCast` had a
   * chance to install the `spellSequencer` gate, and the popup fires
   * instantly instead of waiting for the spell visual.
   */
  apply(resolution: CastResolution): CastResult {
    return this.runApply(resolution);
  }

  /**
   * One-shot wrapper for callers that don't care about ordering
   * (tests, monster AI without visuals). Equivalent to resolve+apply
   * with no broadcasts in between — preserves the bad ordering on
   * purpose because the existing Monster AI path doesn't broadcast a
   * spellLaunch anyway.
   */
  async execute(sessionId: string, params: string): Promise<CastResult> {
    const resolution = await this.resolve(sessionId, params);
    return this.apply(resolution);
  }

  /**
   * One-shot wrapper for callers that already hold the fight + caster
   * references (Monster AI). Same caveat as `execute`: no broadcasts
   * between phases.
   */
  async castFor(
    fight: Fight,
    caster: Fighter,
    spellId: number,
    targetCell: number,
    level: number
  ): Promise<CastResult> {
    const resolution = await this.resolveFor(
      fight,
      caster,
      spellId,
      targetCell,
      level
    );
    return this.apply(resolution);
  }

  private async resolveCast(
    fight: Fight,
    active: ActiveState,
    caster: Fighter,
    spellId: number,
    targetCell: number,
    level: number
  ): Promise<CastResolution> {
    const epoch = fight.turnEpoch;
    const spell = await this.spells.spellLevel(spellId, level);
    if (!spell) {
      throw new CastError("no_spell", "spell not learned / unknown");
    }

    const reason =
      spell.combatUnavailableReason ||
      combatUnavailableReason([...spell.effects, ...spell.criticalEffects]);
    if (reason) {
      throw new CastError("unsupported_spell", reason);
    }
    for (const effect of [...spell.effects, ...spell.criticalEffects]) {
      if (effect.id !== 666 && !this.effects.handler(effect.id)) {
        throw new CastError(
          "unsupported_spell",
          `Effet ${effect.id} indisponible.`
        );
      }
    }
    this.validate(fight, active, caster, spell, targetCell, epoch);

    const castCtx: CastContext = {
      caster,
      target: null,
      targetCell,
      spell,
      critical: false,
    };
    if (!fight.modules.fireCastPre(fight, castCtx)) {
      throw new CastError("no_spell", "spell blocked by module");
    }

    const baseCrit = Math.max(
      2,
      spell.criticalRate - caster.stats.get(Characteristic.CriticalHit)
    );
    const agility = Math.max(0, caster.stats.get(Characteristic.Agility));
    const critRate = Math.max(
      2,
      Math.floor(
        Math.min(baseCrit, (baseCrit * Math.E * 1.1) / Math.log(agility + 12))
      )
    );
    const critical =
      spell.criticalRate > 0 && Math.floor(fight.random() * critRate) === 0;
    const failure =
      spell.failureRate > 0 &&
      Math.floor(
        fight.random() *
          Math.max(
            2,
            spell.failureRate - caster.stats.get(Characteristic.CriticalFailure)
          )
      ) === 0;
    castCtx.critical = critical;

    const prepared = await prepareCombatData(spell, this.spells, (id) =>
      Boolean(this.effects.handler(id))
    );
    if (prepared.reason) {
      throw new CastError("unsupported_spell", prepared.reason);
    }
    const triggerCache = prepared.spells;
    const summonCache = prepared.summons;

    this.validate(fight, active, caster, spell, targetCell, epoch);
    return {
      turnEpoch: epoch,
      targetId: lookupFighterAt(fight, targetCell)?.id ?? -targetCell - 1,
      fight,
      active,
      caster,
      spell,
      spellId,
      level,
      targetCell,
      critical,
      failure,
      triggerCache,
      summonCache,
      castCtx,
    };
  }

  private validate(
    fight: Fight,
    active: ActiveState,
    caster: Fighter,
    spell: SpellLevel,
    targetCell: number,
    epoch: number
  ): void {
    if (
      fight.ending ||
      fight.state !== active ||
      fight.turnEpoch !== epoch ||
      caster.dead ||
      active.turnList.current()?.id !== caster.id
    ) {
      throw new CastError("not_your_turn", "Ce n’est pas votre tour.");
    }
    if (caster.player && caster.level < spell.minPlayerLevel) {
      throw new CastError("no_spell", "Niveau insuffisant.");
    }
    if (caster.ap < spell.apCost) {
      throw new CastError("no_ap", "Pas assez de PA.");
    }
    const geometry = castGeometryError(
      spell.effects.some((e) => e.id === 783)
        ? {
            width: fight.fightMap.width,
            height: fight.fightMap.height,
            losBlocked: (cell) => fight.fightMap.losBlocked(cell),
            occupantOf: (cell) =>
              cell === fearTarget({ fight, caster, targetCell })?.cell
                ? undefined
                : fight.fightMap.occupantOf(cell),
          }
        : fight.fightMap,
      caster.cell,
      targetCell,
      {
        ...spell,
        rangeBonus: caster.stats.get(Characteristic.Range),
      }
    );
    if (geometry) {
      throw new CastError(geometry, "Cellule hors portée, occupée ou masquée.");
    }
    if (spell.emptyCell && !fight.fightMap.isWalkable(targetCell)) {
      throw new CastError("bad_cell", "Cellule impraticable.");
    }
    const target = lookupFighterAt(fight, targetCell);
    const ids = new Set(
      [...spell.effects, ...spell.criticalEffects].map((e) => e.id)
    );
    if (
      ids.has(400) &&
      fight.fightMap.objects
        .atCell(targetCell)
        .some((object) => object.kind === 1)
    ) {
      throw new CastError("bad_target", "Un piège occupe déjà cette cellule.");
    }
    if (
      [180, 181, 185, 780, 51].some((id) => ids.has(id)) &&
      (!fight.fightMap.isFree(targetCell) ||
        !fight.fightMap.isWalkable(targetCell))
    ) {
      throw new CastError(
        "bad_target",
        "La destination doit être libre et praticable."
      );
    }
    if (
      (ids.has(180) || ids.has(181)) &&
      summonLimitReached({ fight, caster })
    ) {
      throw new CastError(
        "summon_limit",
        "Limite de créatures invoquées atteinte."
      );
    }
    if (ids.has(780) && !lastResurrectableAlly({ fight, caster })) {
      throw new CastError(
        "no_dead_ally",
        "Aucun allié ne peut être ressuscité."
      );
    }
    if (
      ids.has(50) &&
      (!target ||
        target === caster ||
        target.states.has(FightStateId.Rooted) ||
        caster.carriedById !== null ||
        caster.carryingId !== null ||
        target.carriedById !== null ||
        target.carryingId !== null)
    ) {
      throw new CastError("bad_target", "Cette cible ne peut pas être portée.");
    }
    if (ids.has(51) && caster.carryingId === null) {
      throw new CastError("required_state", "Vous ne portez aucune cible.");
    }
    if (ids.has(783) && !fearTarget({ fight, caster, targetCell })) {
      throw new CastError(
        "bad_target",
        "Peur nécessite une cible adjacente dans cette direction."
      );
    }
    if (
      (ids.has(4) || ids.has(8)) &&
      (caster.states.has(FightStateId.Gravity) || caster.carriedById !== null)
    ) {
      throw new CastError(
        "forbidden_state",
        "Votre état interdit cette téléportation."
      );
    }
    if (
      ids.has(8) &&
      (target?.states.has(FightStateId.Rooted) ||
        caster.carryingId !== null ||
        target?.carriedById != null ||
        target?.carryingId != null)
    ) {
      throw new CastError(
        "bad_target",
        "Ces positions ne peuvent pas être échangées."
      );
    }
    if (
      spell.effects.some((effect) => effect.id === 4) &&
      (!fight.fightMap.isFree(targetCell) ||
        !fight.fightMap.isWalkable(targetCell))
    ) {
      throw new CastError("bad_target", "Destination indisponible.");
    }
    if (
      spell.effects.some((effect) => effect.id === 8) &&
      (!target || target === caster)
    ) {
      throw new CastError("bad_target", "Cible indisponible.");
    }
    if (spell.spellId === 438 && (!target || target.team !== caster.team)) {
      throw new CastError("bad_target", "Transposition nécessite un allié.");
    }
    if (spell.spellId === 445 && (!target || target.team === caster.team)) {
      throw new CastError("bad_target", "Coopération nécessite un ennemi.");
    }
    for (const state of spell.requiredStates ?? []) {
      if (!caster.states.has(state as FightStateId)) {
        throw new CastError("required_state", "État requis absent.");
      }
    }
    for (const state of spell.forbiddenStates ?? []) {
      if (caster.states.has(state as FightStateId)) {
        throw new CastError(
          "forbidden_state",
          "État incompatible avec ce sort."
        );
      }
    }
    if (
      !fight.spellUsage.canCast(
        caster.id,
        spell.spellId,
        target?.id ?? -targetCell - 1,
        spell.castPerTurn,
        spell.castPerTarget
      )
    ) {
      throw new CastError(
        "cooldown",
        "Délai de relance ou limite de lancers atteint."
      );
    }
  }

  private runApply(resolution: CastResolution): CastResult {
    const {
      fight,
      active,
      caster,
      spell,
      spellId,
      level,
      targetCell,
      critical,
      failure,
      triggerCache,
      summonCache,
      castCtx,
    } = resolution;

    if (this.applied.has(resolution)) {
      throw new CastError("already_applied", "Action déjà résolue.");
    }
    this.validate(
      fight,
      active,
      caster,
      spell,
      targetCell,
      resolution.turnEpoch
    );
    this.applied.add(resolution);
    caster.spendAp(spell.apCost);
    fight.spellUsage.recordCast(
      caster.id,
      spellId,
      resolution.targetId,
      spell.cooldown
    );

    const result: CastResult = {
      fight,
      caster,
      spellId,
      level,
      targetCell,
      critical,
      failure,
      affectedCells: [],
    };

    if (failure) {
      return result;
    }

    const effect = spell.effects[0] ?? spell.criticalEffects[0];
    if (!effect) {
      return result;
    }
    const scope: Scope = {
      fight,
      caster,
      target: lookupFighterAt(fight, targetCell),
      targetCell,
      castTargetCell: targetCell,
      spell,
      effect,
      critical,
      emitter: this.emitter,
      triggerCache,
      summonCache,
    };
    const directOffensive = (
      critical ? spell.criticalEffects : spell.effects
    ).some(
      (e) =>
        e.duration <= 0 &&
        ((e.id >= 91 && e.id <= 100) || e.id === 82 || e.id === 672)
    );
    if (caster.invisible && directOffensive) {
      revealFighter(scope, caster);
    }
    caster.buffs.each((buff) => buff.onCast?.(fight, castCtx));
    scope.target?.buffs.each((buff) => buff.onTargetedBy?.(fight, castCtx));
    result.affectedCells = executeSpellEffects(this.effects, scope, spell);

    fight.modules.fireCastApplied(fight, castCtx);

    return result;
  }
}

function lookupFighterAt(f: Fight, cell: number): Fighter | null {
  for (const fighter of f.fighters()) {
    if (
      !fighter.dead &&
      fighter.cell === cell &&
      fighter.carriedById === null
    ) {
      return fighter;
    }
  }
  return null;
}

function parseCastParams(params: string): {
  spellId: number;
  targetCell: number;
  level: number;
} {
  const parts = params.split(";");
  if (parts.length < 2) {
    throw new CastError("bad_params", "malformed params");
  }
  if (
    parts.length > 3 ||
    !/^\d+$/.test(parts[0] ?? "") ||
    !/^\d+$/.test(parts[1] ?? "")
  ) {
    throw new CastError("bad_params", "Paramètres de sort invalides.");
  }
  const spellId = Number(parts[0]);
  const targetCell = Number(parts[1]);
  if (!Number.isSafeInteger(spellId) || !Number.isSafeInteger(targetCell)) {
    throw new CastError("bad_params", "Paramètres de sort invalides.");
  }
  return { spellId, targetCell, level: 1 };
}
