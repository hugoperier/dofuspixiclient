import { castGeometryError, cellToCoord, type FightMapLos } from "@dofus/grid";

import type { SpellEntry } from "../stores/spells-store";
import type { FighterSnapshot } from "./fight.machine";

/** Server metadata drives previews; unseen positions never enter this map. */
export function spellTargetError(
  spell: SpellEntry,
  caster: FighterSnapshot,
  fighters: readonly FighterSnapshot[],
  map: FightMapLos,
  cell: number,
  walkable: boolean
): string | null {
  const ids = new Set(spell.effectIds ?? []);
  const present = fighters.filter(
    (f) => !f.dead && !f.hidden && !f.carriedById && f.cell >= 0
  );
  const target = present.find((f) => f.cell === cell);
  const destination = [4, 51, 180, 181, 185, 780].some((id) => ids.has(id));
  if ((spell.emptyCell || destination) && (!walkable || target)) {
    return "La destination doit être libre et praticable.";
  }
  if ((spell.requiredStates ?? []).some((id) => !caster.states?.includes(id))) {
    return "État requis absent.";
  }
  if ((spell.forbiddenStates ?? []).some((id) => caster.states?.includes(id))) {
    return "État incompatible avec ce sort.";
  }
  if (
    (ids.has(180) || ids.has(181)) &&
    fighters.filter(
      (f) => !f.dead && !f.staticFighter && f.summonedBy === caster.spriteId
    ).length >= (caster.maxSummons ?? 1)
  ) {
    return "Limite de créatures invoquées atteinte.";
  }
  if (
    ids.has(780) &&
    !fighters.some((f) => f.dead && f.resurrectable && f.team === caster.team)
  ) {
    return "Aucun allié ne peut être ressuscité.";
  }
  if (
    ids.has(50) &&
    (!target ||
      target === caster ||
      target.states?.includes(6) ||
      caster.carriedById ||
      caster.carryingId ||
      target.carriedById ||
      target.carryingId)
  ) {
    return "Cette cible ne peut pas être portée.";
  }
  if (ids.has(51) && !caster.carryingId) {
    return "Vous ne portez aucune cible.";
  }
  if (
    (ids.has(4) || ids.has(8)) &&
    (caster.states?.includes(7) || caster.carriedById)
  ) {
    return "Votre état interdit cette téléportation.";
  }
  if (
    ids.has(8) &&
    (!target ||
      target === caster ||
      target.states?.includes(6) ||
      caster.carryingId ||
      target.carriedById ||
      target.carryingId)
  ) {
    return "Ces positions ne peuvent pas être échangées.";
  }
  if (spell.spellId === 438 && target?.team !== caster.team) {
    return "Transposition nécessite un allié.";
  }
  if (spell.spellId === 445 && (!target || target.team === caster.team)) {
    return "Coopération nécessite un ennemi.";
  }
  let ignoredCell: number | undefined;
  if (ids.has(783)) {
    const a = cellToCoord(caster.cell, map.width),
      b = cellToCoord(cell, map.width);
    if ((a.x !== b.x && a.y !== b.y) || (a.x === b.x && a.y === b.y)) {
      return "Peur se lance en ligne.";
    }
    ignoredCell =
      caster.cell +
      (a.x !== b.x
        ? Math.sign(b.x - a.x) * map.width
        : Math.sign(b.y - a.y) * (map.width - 1));
    const adjacent = present.find((f) => f.cell === ignoredCell);
    // A guessed invisible target is legal. Only an observed rooted fighter
    // can be rejected here; the server resolves an unobserved adjacent cell.
    if (adjacent?.states?.includes(6)) {
      return "Cette cible ne peut pas être poussée.";
    }
  }
  const geometry = castGeometryError(
    {
      ...map,
      occupantOf: (id) =>
        id === ignoredCell
          ? undefined
          : present.find((f) => f.cell === id)?.spriteId,
    },
    caster.cell,
    cell,
    { ...spell, rangeBonus: caster.rangeBonus ?? 0 }
  );
  return geometry ? "Cellule hors portée, occupée ou masquée." : null;
}
