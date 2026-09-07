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
import { isValidTarget } from "@modules/fight/effects/fight.target-mask";
import {
  Characteristic,
  type FightStateId,
  StateName,
} from "@modules/fight/fight.types";
import { cellsInArea } from "@modules/fight/map/fight.area";
import { combatUnavailableReason } from "@modules/spells/spells.combat-data";

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
      Math.floor(fight.random() * spell.failureRate) === 0;
    castCtx.critical = critical;

    // Pre-resolve trigger spells for glyph/trap/summon effects. These
    // effects encode the trigger spell ID in `effect.min`; handlers need
    // it for the deployed entity's element AND its damage — the wrapper
    // effect carries neither. Doing this before apply() keeps the
    // per-effect loop synchronous and lets us await spell loading
    // outside the broadcast-sensitive critical section.
    //
    // The trigger is loaded at the level of the spell being cast, not at
    // level 1: a Glyphe Enflammé cast at rank 5 must burn for rank 5.
    // A missing trigger rank rejects the whole cast.
    const effects = critical ? spell.criticalEffects : spell.effects;
    const triggerCache = new Map<number, SpellLevel>();
    for (const eff of effects) {
      const isSpawn = eff.id === 400 || eff.id === 401;
      if (!isSpawn) {
        continue;
      }
      const triggerId = eff.min;
      if (triggerId <= 0 || triggerCache.has(triggerId)) {
        continue;
      }
      const lvl = await this.spells.spellLevel(triggerId, spell.level);
      if (
        !lvl ||
        lvl.combatUnavailableReason ||
        lvl.effects.length === 0 ||
        lvl.effects.some((effect) => effect.id < 96 || effect.id > 100)
      ) {
        throw new CastError(
          "unsupported_spell",
          "Les effets déclenchés de ce sort sont indisponibles."
        );
      }
      triggerCache.set(triggerId, lvl);
    }

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
      fight.fightMap,
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

    const effects = critical ? spell.criticalEffects : spell.effects;
    const seen = new Set<number>();

    for (const eff of effects) {
      if (
        eff.probability > 0 &&
        Math.floor(fight.random() * 100) >= eff.probability
      ) {
        continue;
      }

      // Effects that place a persistent ground entity (trap, glyph) or
      // a creature (summon) read `areaKind`/`areaSize` as the spawned
      // object's trigger / aura zone, NOT as a cast-time AOE. They
      // must run exactly once at the click target — iterating the
      // declared zone would create one entity per cell of the trigger
      // shape (a Cb radius-2 glyph would deploy 13 glyph objects).
      const isSingleTargetSpawn =
        eff.id === 400 || eff.id === 401 || eff.id === 185;
      const cells = isSingleTargetSpawn
        ? [targetCell]
        : cellsInArea(
            fight.fightMap,
            caster.cell,
            targetCell,
            eff.areaKind,
            eff.areaSize
          );
      for (const cell of cells) {
        if (!seen.has(cell)) {
          seen.add(cell);
          result.affectedCells.push(cell);
        }

        const handler = this.effects.handler(eff.id);
        if (!handler) {
          continue;
        }

        let targetFighter = lookupFighterAt(fight, cell);

        // Honor the per-effect target mask (decoded from FT= param +
        // per-effect-id defaults). Mask 0 = no filter declared → permissive.
        if (!isValidTarget(eff.targetMask, caster, targetFighter)) {
          continue;
        }

        if (targetFighter) {
          const current = targetFighter;
          current.buffs.each((b) => {
            if (!b.resolveTarget) {
              return;
            }
            const redirect = b.resolveTarget(fight, current);
            if (redirect) {
              targetFighter = redirect;
            }
          });
        }

        if (targetFighter && spell.rangeMax === 1) {
          let skipHit = false;
          const meleeTarget = targetFighter;
          meleeTarget.buffs.each((b) => {
            if (skipHit || !b.preMeleeHit) {
              return;
            }
            if (b.preMeleeHit(fight, caster, meleeTarget)) {
              skipHit = true;
            }
          });
          if (skipHit) {
            continue;
          }
        }

        const trigger = triggerCache.get(eff.min);
        const scope: Scope = {
          fight,
          caster,
          target: targetFighter,
          targetCell: cell,
          castTargetCell: targetCell,
          effect: eff,
          spell,
          critical,
          emitter: this.emitter,
          ...(trigger ? { triggerSpell: trigger } : {}),
        };
        handler(scope);
      }
    }

    for (const fighter of fight.fighters()) {
      if (!fighter.dead) {
        continue;
      }
      active.turnList.remove(fighter.id);
      // Free the corpse's cell. Without this the fightMap keeps the
      // dead fighter as an occupant, so subsequent
      // `hasLineOfSight(caster → target)` calls reject any ray that
      // crosses the corpse cell — the user perceives this as "the
      // server randomly refuses my cast even though I have a clear
      // shot". Canonical Dofus 1.29 lets spells fly over corpses.
      if (fighter.cell >= 0) {
        fight.fightMap.free(fighter.cell, fighter.id);
      }
    }

    fight.modules.fireCastApplied(fight, castCtx);

    return result;
  }
}

function lookupFighterAt(f: Fight, cell: number): Fighter | null {
  for (const fighter of f.fighters()) {
    if (!fighter.dead && fighter.cell === cell) {
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
