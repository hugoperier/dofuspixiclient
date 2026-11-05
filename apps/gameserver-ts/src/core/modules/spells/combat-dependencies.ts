import type { SpellLevel } from "../fight/cast/fight.spell.types";
import type { SummonTemplate } from "./combat-catalog.types";
import { combatUnavailableReason } from "./spells.combat-data";

export interface CombatDataPort {
  spellLevel(id: number, rank: number): Promise<SpellLevel | undefined>;
  summonTemplate?(
    id: number,
    grade: number
  ): Promise<SummonTemplate | undefined>;
}

export interface PreparedCombatData {
  spells: Map<string, SpellLevel>;
  summons: Map<string, SummonTemplate>;
  reason: string;
}

/** The book, audit and cast use this graph walk, including exact summon spell ranks. */
export async function prepareCombatData(
  root: SpellLevel,
  port: CombatDataPort,
  hasHandler?: (id: number) => boolean
): Promise<PreparedCombatData> {
  const result: PreparedCombatData = {
    spells: new Map(),
    summons: new Map(),
    reason: "",
  };
  const queue = [root];
  for (let i = 0; i < queue.length; i++) {
    const spell = queue[i];
    if (!spell) {
      continue;
    }
    const key = `${spell.spellId}:${spell.level}`;
    if (result.spells.has(key)) {
      continue;
    }
    result.spells.set(key, spell);
    const effects = [...spell.effects, ...spell.criticalEffects];
    result.reason =
      spell.combatUnavailableReason || combatUnavailableReason(effects);
    if (result.reason) {
      break;
    }
    for (const effect of effects) {
      if (hasHandler && effect.id !== 666 && !hasHandler(effect.id)) {
        result.reason = `Effet ${effect.id} sans résolveur (${key}).`;
        break;
      }
      const dependencies: { spellId: number; level: number }[] = [];
      if (effect.id === 400 || effect.id === 401 || effect.id === 787) {
        dependencies.push({
          spellId: effect.min,
          level: effect.max > 0 ? effect.max : spell.level,
        });
      }
      if (effect.id === 181 || effect.id === 185) {
        const summonKey = `${effect.min}:${effect.max}`;
        if (result.summons.has(summonKey)) {
          continue;
        }
        const summon = await port.summonTemplate?.(effect.min, effect.max);
        if (
          !summon ||
          summon.templateId !== effect.min ||
          summon.grade !== effect.max ||
          summon.life <= 0
        ) {
          result.reason = `Grade d’invocation ${summonKey} absent ou invalide.`;
          break;
        }
        result.summons.set(summonKey, summon);
        dependencies.push(...summon.spells);
      }
      for (const dependency of dependencies) {
        const dependencyKey = `${dependency.spellId}:${dependency.level}`;
        if (result.spells.has(dependencyKey)) {
          continue;
        }
        const level = await port.spellLevel(
          dependency.spellId,
          dependency.level
        );
        if (!level || level.level !== dependency.level) {
          result.reason = `Sort dépendant ${dependencyKey} absent.`;
          break;
        }
        queue.push(level);
      }
      if (result.reason) {
        break;
      }
    }
    if (result.reason) {
      break;
    }
  }
  return result;
}
