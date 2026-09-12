import type { SpellLevel } from "@modules/fight/cast/fight.spell";
import type { ActiveState } from "@modules/fight/core/fight.active-state";
import type { Fight } from "@modules/fight/core/fight.entity";
import type { Fighter } from "@modules/fight/core/fight.fighter";
import type { CastContext } from "@modules/fight/effects/fight.buff.types";
import type { SummonTemplate } from "@modules/spells/combat-catalog.types";
import type { CloseCombatAttack } from "@modules/spells/spells.service";

export interface SpellPort {
  summonTemplate?(
    id: number,
    grade: number
  ): Promise<SummonTemplate | undefined>;
  spellLevel(spellId: number, level: number): Promise<SpellLevel | undefined>;
  playerSpellRank(
    playerId: string,
    spellId: number
  ): Promise<number | undefined>;
  /**
   * Spell 0, built from the equipped weapon. Optional so the test
   * harnesses that only exercise real spells need not stub it; a caster
   * with no port for it simply cannot swing.
   */
  closeCombatSpell?(playerId: string): Promise<CloseCombatAttack | undefined>;
}

export interface FightRegistry {
  bySession(sessionId: string): Fight | undefined;
}

export class CastError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export interface CastResult {
  fight: Fight;
  caster: Fighter;
  spellId: number;
  level: number;
  targetCell: number;
  critical: boolean;
  failure: boolean;
  affectedCells: number[];
}

/**
 * Output of `CastSpellUseCase.resolve()`. Captures everything `apply()`
 * needs to mutate state and emit GAs, without `apply()` having to redo
 * any validation. Splitting the use case into resolve→apply lets the
 * caller (fight-turn.handler) interleave broadcasts between phases:
 * resolve (no broadcasts) → directionChange + spellLaunch → apply
 * (emits damage / heal / status). Without this split, `apply` would
 * emit damage BEFORE the wire saw the spell launch — which the client
 * receives as `onDamage` running while `spellSequencer` is still its
 * initial `Promise.resolve()`, so the popup fires instantly instead
 * of gating behind the spell visual.
 */
export interface CastResolution {
  turnEpoch: number;
  targetId: number;
  fight: Fight;
  active: ActiveState;
  caster: Fighter;
  spell: SpellLevel;
  spellId: number;
  level: number;
  targetCell: number;
  critical: boolean;
  failure: boolean;
  /**
   * Set when this is a weapon swing rather than a spell. Carries what
   * the `GA;303` broadcast needs — which weapon, which pose — because
   * the client holds no equipment but its own.
   */
  closeCombat?: CloseCombatAttack;
  /**
   * Pre-loaded trigger spell levels for spawn effects (glyph/trap/
   * summon). Resolved here so apply() stays synchronous around the
   * per-effect handler dispatch.
   */
  triggerCache: Map<string, SpellLevel>;
  summonCache: Map<string, SummonTemplate>;
  castCtx: CastContext;
}
