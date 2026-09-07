import { getMapLangCoords, loadMapsLang } from "@/game/lang/maps-lang";

/**
 * Coordonnées monde d'une carte pour le libellé de position.
 *
 * La source est le bundle `maps.json` (`game/lang/maps-lang.ts`), pas
 * `map-data.json` : les deux portent les mêmes 9 271 cartes avec les mêmes
 * coordonnées, mais le bundle est déjà chargé pour le libellé du HUD, et un
 * second téléchargement de 844 Ko n'apportait rien.
 */

/** Amorce le bundle pour que les lectures suivantes soient synchrones. */
export async function preloadMapCoordinates(): Promise<void> {
  await loadMapsLang();
}

/**
 * The map's world coordinates, or null before the bundle resolves / for a map
 * it doesn't list. Same source as the world map, so the caption and the map
 * marker can never disagree.
 */
export function getMapCoords(mapId: number): { x: number; y: number } | null {
  return getMapLangCoords(mapId);
}
