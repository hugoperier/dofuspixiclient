import type { SpellEffect } from "@modules/fight/cast/fight.spell.types";
import { decodeZones } from "@dofus/grid";

import {
  parseTargetParam,
  TargetMask,
} from "../fight/effects/fight.target-mask";

/** Explicit capabilities, shared by the grimoire and the authoritative cast path. */
export const COMBAT_EFFECTS = new Set([
  4, 5, 6, 8, 77, 84, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 108, 111,
  112, 115, 116, 117, 118, 119, 123, 124, 126, 127, 128, 138, 145, 152, 154,
  155, 157, 168, 169, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 400,
  401, 666, 9, 50, 51, 79, 82, 89, 90, 105, 106, 107, 109, 110, 120, 122, 125,
  130, 131, 132, 140, 141, 142, 143, 149, 150, 160, 161, 162, 163, 171, 176,
  178, 180, 181, 182, 183, 184, 185, 186, 202, 265, 268, 271, 293, 320, 671,
  672, 765, 776, 780, 781, 782, 783, 784, 786, 787, 788, 950, 951,
]);

export function combatUnavailableReason(
  effects: readonly SpellEffect[]
): string {
  if (effects.length === 0) {
    return "Les effets de ce sort ne sont pas disponibles.";
  }
  for (const effect of effects) {
    if (!COMBAT_EFFECTS.has(effect.id)) {
      return unavailableEffectReason(effect.id);
    }
    if (
      !Number.isFinite(effect.min) ||
      !Number.isFinite(effect.max) ||
      effect.probability < 0 ||
      effect.probability > 100
    ) {
      return "Paramètres d’effet invalides.";
    }
    if (effect.areaKind === 8) {
      return "Cette forme de zone n’est pas encore disponible.";
    }
  }
  return "";
}

export function stateIds(raw: unknown): number[] {
  return Array.isArray(raw)
    ? raw.filter(
        (id): id is number =>
          typeof id === "number" && Number.isInteger(id) && id >= 0
      )
    : [];
}

/** Ankama's effect tuple is [dice?, display, param, probability, duration, special, max, min, id]. */
export function decodeCombatEffects(
  raw: unknown,
  zones: string
): SpellEffect[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const areas = decodeZones(zones, raw.length);
  return raw.flatMap((entry: unknown, index) => {
    if (!Array.isArray(entry)) {
      return [];
    }
    const offset = typeof entry[0] === "string" ? 1 : 0;
    if (entry.length < offset + 8) {
      return [];
    }
    const num = (i: number, fallback = 0): number =>
      typeof entry[offset + i] === "number" ? entry[offset + i] : fallback;
    const id = num(7);
    const min = num(6);
    const param =
      typeof entry[offset + 1] === "string" ? entry[offset + 1] : "";
    return [
      {
        id,
        min,
        max: num(5, min),
        special: num(4),
        probability: num(2),
        duration: num(3),
        areaKind: areas[index]?.kind ?? 0,
        areaSize: areas[index]?.size ?? 0,
        targetMask:
          parseTargetParam(param) ??
          (id === 4 || id === 400 || id === 401
            ? TargetMask.EmptyOnly
            : TargetMask.AnyFighter),
        param,
        dice: offset === 1 ? String(entry[0]) : "",
      },
    ];
  });
}

function unavailableEffectReason(id: number): string {
  if ([180, 181, 182, 185, 405, 780].includes(id)) {
    return "Les invocations de ce sort ne sont pas encore disponibles.";
  }
  if (id === 150) {
    return "L’invisibilité n’est pas encore disponible.";
  }
  if ([50, 51].includes(id)) {
    return "Porter et jeter ne sont pas encore disponibles.";
  }
  if ([105, 106, 265].includes(id)) {
    return "Cette protection n’est pas encore disponible.";
  }
  if ([149, 950, 951].includes(id)) {
    return "Les changements d’état de ce sort ne sont pas encore disponibles.";
  }
  return "Ce sort utilise une mécanique encore indisponible.";
}
