import { cellsInArea, fightDistance } from "@dofus/grid";

import type { SpellLevel } from "../cast/fight.spell.types";
import type { Fight } from "../core/fight.entity";
import type { Fighter } from "../core/fight.fighter";
import { matchesTargetFilter } from "../effects/fight.target-mask";
import { canPerceive } from "./fight.visibility";

const DAMAGE = new Set([82, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 672]);
const HARM = new Set([
  5, 6, 77, 84, 101, 116, 127, 140, 145, 154, 155, 162, 163, 168, 169, 171, 186,
  215, 216, 217, 218, 268, 271, 320,
]);

export interface AiCast {
  spell: SpellLevel;
  cell: number;
  score: number;
}

/** Scores only perceived fighters. The cast use case remains the rules authority. */
export function aiCastCandidates(
  fight: Fight,
  caster: Fighter,
  spells: SpellLevel[]
): AiCast[] {
  const perceived = fight
    .fighters()
    .filter((f) => !f.dead && canPerceive(f, caster));
  const candidates: AiCast[] = [];
  for (const spell of spells) {
    if (spell.apCost > caster.ap) {
      continue;
    }
    if (
      caster.monsterTemplateId === 2727 &&
      (spell.spellId === 1675
        ? caster.carriedById === null
        : caster.carriedById !== null)
    ) {
      continue;
    }
    const spawn = spell.effects.some((e) =>
      [180, 181, 185, 400, 401].includes(e.id)
    );
    const cells = spawn
      ? cellsInArea(
          fight.fightMap,
          caster.cell,
          caster.cell,
          7,
          Math.min(4, spell.rangeMax)
        ).filter((c) => fight.fightMap.isFree(c))
      : [...new Set([caster.cell, ...perceived.map((f) => f.cell)])];
    for (const cell of cells) {
      let score = 0;
      for (const effect of spell.effects) {
        if (spawn) {
          score += 20;
          continue;
        }
        const self =
          Boolean((effect.targetFilter ?? 0) & 32) ||
          [109, 120, 293].includes(effect.id);
        const area = new Set(
          self
            ? [caster.cell]
            : cellsInArea(
                fight.fightMap,
                caster.cell,
                cell,
                effect.areaKind,
                effect.areaSize
              )
        );
        for (const target of perceived) {
          if (
            !area.has(target.cell) ||
            !matchesTargetFilter(effect.targetFilter ?? 0, caster, target)
          ) {
            continue;
          }
          const ally = target.team === caster.team;
          const magnitude = Math.max(1, Math.min(100, effect.min));
          if (DAMAGE.has(effect.id)) {
            score += (ally ? -3 : 1) * magnitude;
          } else if (effect.id === 108 || effect.id === 143) {
            score +=
              (ally ? 2 : -1) * Math.min(magnitude, target.lpMax - target.lp);
          } else if (HARM.has(effect.id)) {
            score += (ally ? -2 : 1) * magnitude;
          } else if (effect.id === 132) {
            score += ally
              ? target.buffs.all().filter((b) => b.value < 0 || b.periodic)
                  .length * 20
              : target.buffs.all().filter((b) => b.value > 0).length * 20;
          } else if (
            effect.id === 141 ||
            effect.id === 109 ||
            effect.id === 666
          ) {
          } else if (
            !target.buffs.all().some((b) => b.spellId === spell.spellId) ||
            effect.id === 176
          ) {
            score += ally ? 15 : -15;
          }
        }
      }
      if (score > 0) {
        candidates.push({
          spell,
          cell,
          score: score / Math.max(1, spell.apCost),
        });
      }
    }
  }
  return candidates.sort(
    (a, b) =>
      b.score - a.score ||
      fightDistance(fight.fightMap, caster.cell, a.cell) -
        fightDistance(fight.fightMap, caster.cell, b.cell)
  );
}
