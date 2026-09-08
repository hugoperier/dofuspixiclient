import type { AreaKind } from "@modules/fight/fight.types";
import type { SpellLevelRow, SpellTemplateRow } from "@shared/db/schema";

export type Spell = SpellTemplateRow;

export interface SpellEffect {
  id: number;
  min: number;
  max: number;
  special: number;
  duration: number;
  probability: number;
  areaKind: AreaKind;
  areaSize: number;
  targetMask: number;
  /** Server-side exclusion flags from the Retro spell definition (not FT). */
  targetFilter?: number;
  /**
   * Raw lang `param` slot, persisted by migration 0039. Carries the
   * target filter for effects that have one, and the state / item /
   * summon name for the effects whose description template needs it.
   * Optional because the combat resolver never reads it — only the
   * spell book's effect-description formatter does.
   */
  param?: string;
  dice?: string;
}

export type SpellLevel = Omit<
  SpellLevelRow,
  "effects" | "criticalEffects" | "requiredStates" | "forbiddenStates"
> & {
  requiredStates?: number[];
  forbiddenStates?: number[];
  combatUnavailableReason?: string;
  effects: SpellEffect[];
  criticalEffects: SpellEffect[];
  /**
   * Resolved gfx-file id the client should load. Always non-null on
   * the runtime path — the SpellsService coalesces NULL → spellId so
   * downstream code never has to branch.
   */
  visualGfxId: number;
};

export interface MonsterSpell {
  spellId: number;
  level: number;
}
