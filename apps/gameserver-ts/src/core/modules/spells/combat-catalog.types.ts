import type { SpellLevel } from "../fight/cast/fight.spell.types";

export const CLASS_SPECIAL_SPELLS: Readonly<Record<number, number>> = {
  1: 422,
  2: 420,
  3: 425,
  4: 416,
  5: 424,
  6: 412,
  7: 427,
  8: 410,
  9: 418,
  10: 426,
  11: 421,
  12: 423,
};

export interface SummonTemplate {
  templateId: number;
  grade: number;
  level: number;
  name: string;
  gfx: number;
  colors: [number, number, number];
  life: number;
  ap: number;
  mp: number;
  stats: Record<number, number>;
  spells: Array<{ spellId: number; level: number }>;
  ai: number;
  static: boolean;
}

export interface CombatCatalog {
  roots: Array<{ classId: number; spellId: number; special: boolean }>;
  names: Record<number, string>;
  levels: Record<string, SpellLevel>;
  summons: Record<string, SummonTemplate>;
  sources: Record<string, string>;
}

export interface SummonTemplatePort {
  summonTemplate(
    templateId: number,
    grade: number
  ): Promise<SummonTemplate | undefined>;
}
