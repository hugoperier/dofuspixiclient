import type { TransitionDirection } from "@/game/scene/map/transition";
import { getMapLangCoords, loadMapsLang } from "@/game/lang/maps-lang";

/**
 * Coordonnées monde d'une carte, pour la direction de transition et le libellé
 * de position.
 *
 * La source est le bundle `maps.json` (`game/lang/maps-lang.ts`), pas
 * `map-data.json` : les deux portent les mêmes 9 271 cartes avec les mêmes
 * coordonnées, mais le bundle est déjà chargé pour le libellé du HUD, et un
 * second téléchargement de 844 Ko n'apportait rien.
 *
 * C'est aussi ce qui répare ces deux lectures : elles passaient par un cache
 * que seul `preloadMapCoordinates()` remplissait, et personne ne l'appelait —
 * elles rendaient donc toujours `null`.
 */

/** Amorce le bundle pour que les lectures suivantes soient synchrones. */
export async function preloadMapCoordinates(): Promise<void> {
  await loadMapsLang();
}

/**
 * Compute the transition direction between two maps using their world coordinates.
 * Returns null if either map is unknown or they aren't direct neighbors.
 */
export function getMapTransitionDirection(
  fromMapId: number,
  toMapId: number
): TransitionDirection | null {
  const from = getMapLangCoords(fromMapId);
  const to = getMapLangCoords(toMapId);

  if (!from || !to) {
    return null;
  }

  // Only allow pan for direct neighbors (delta of exactly 1 on one or both axes)
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (dx === 0 && dy === 0) {
    return null;
  }

  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
    return null;
  }

  return { dx, dy };
}

/**
 * The map's world coordinates, or null before the bundle resolves / for a map
 * it doesn't list. Same source as the world map, so the caption and the map
 * marker can never disagree.
 */
export function getMapCoords(mapId: number): { x: number; y: number } | null {
  return getMapLangCoords(mapId);
}
