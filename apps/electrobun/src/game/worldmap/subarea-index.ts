import type { MapsLangData } from "@/game/lang/maps-lang";
import { getMapsLang } from "@/game/lang/maps-lang";

/**
 * L'index spatial de la carte du monde : « quelle sous-zone sous le curseur »,
 * et « quelles cases forment cette sous-zone » pour en dessiner la silhouette.
 *
 * Le 1.29 n'avait rien à calculer — `MapNavigator.addSubareaClip` attachait un
 * clip `subarea_<id>` pré-dessiné dans le SWF de la carte, teinté à `_alpha=20`
 * (`MapExplorer.as:729-732`). Cette géométrie n'a jamais été exportée ici, donc
 * on la reconstruit par union des cases de la sous-zone, ce qui donne
 * exactement la même silhouette.
 *
 * La source est `maps.json` (déjà chargé pour le libellé de position du HUD),
 * pas `map-data.json` : le bundle porte les mêmes 9 271 cartes avec les mêmes
 * coordonnées, plus la sous-zone que `map-data.json` n'a pas.
 */

export interface Cell {
  x: number;
  y: number;
}

export interface SubareaIndex {
  /** Sous-zone à ces coordonnées, `null` hors du monde. */
  subareaAt(x: number, y: number): number | null;
  /** Carte à ces coordonnées — remplace le scan linéaire de `findMapAtCoord`. */
  mapAt(x: number, y: number): number | null;
  /** Les cases d'une sous-zone, pour le surlignage. */
  cellsOf(subareaId: number): readonly Cell[];
  /** Faux quand le bundle n'est pas encore arrivé. */
  readonly ready: boolean;
}

const EMPTY: readonly Cell[] = [];

function key(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Deux cartes partagent souvent une case : la surface et ce qu'il y a dessous.
 * 557 des 4 880 cases d'Amakna sont dans ce cas — Bonta et ses égouts, une
 * ville et son donjon. La carte du monde montre la surface, donc on écarte
 * d'abord les sous-zones souterraines (`tt === "souterrain"`), puis on garde la
 * plus étendue, puis le plus petit identifiant pour rester déterministe.
 */
function preferSurface(
  candidates: number[],
  data: MapsLangData,
  extent: Map<number, number>
): number {
  const surface = candidates.filter(
    (id) => data.subareas.get(id)?.themeName !== "souterrain"
  );
  const pool = surface.length > 0 ? surface : candidates;

  return pool.reduce(
    (best, id) => {
      const bestExtent = extent.get(best) ?? 0;
      const idExtent = extent.get(id) ?? 0;

      if (idExtent !== bestExtent) {
        return idExtent > bestExtent ? id : best;
      }

      return id < best ? id : best;
    },
    pool[0] ?? candidates[0] ?? 0
  );
}

export function buildSubareaIndex(
  data: MapsLangData,
  superarea: number
): SubareaIndex {
  // Incarnam réemploie les coordonnées d'Amakna — ses 52 cases y sont toutes
  // incluses — donc l'index est forcément par super-aire.
  const superareaOf = (subareaId: number): number | null => {
    const areaId = data.subareas.get(subareaId)?.areaId;

    if (areaId === undefined) {
      return null;
    }

    return data.areaSuperareas.get(areaId) ?? null;
  };

  const candidates = new Map<string, number[]>();
  const mapsAt = new Map<string, number>();
  const cells = new Map<number, Cell[]>();
  const extent = new Map<number, number>();

  for (const [mapId, entry] of data.maps) {
    const subareaId = entry.subareaId;

    if (subareaId <= 0 || superareaOf(subareaId) !== superarea) {
      continue;
    }

    const k = key(entry.x, entry.y);
    const bucket = candidates.get(k);

    if (bucket) {
      if (!bucket.includes(subareaId)) {
        bucket.push(subareaId);
      }
    } else {
      candidates.set(k, [subareaId]);
    }

    // Première carte rencontrée pour la case : `Map` garde l'ordre d'insertion,
    // et le bundle est trié, donc c'est stable d'un chargement à l'autre.
    if (!mapsAt.has(k)) {
      mapsAt.set(k, mapId);
    }

    extent.set(subareaId, (extent.get(subareaId) ?? 0) + 1);
  }

  const resolved = new Map<string, number>();

  for (const [k, bucket] of candidates) {
    const first = bucket[0];

    if (first === undefined) {
      continue;
    }

    const winner =
      bucket.length === 1 ? first : preferSurface(bucket, data, extent);

    resolved.set(k, winner);

    const parts = k.split(",");
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    const list = cells.get(winner);

    if (list) {
      list.push({ x, y });
    } else {
      cells.set(winner, [{ x, y }]);
    }
  }

  return {
    subareaAt: (x, y) => resolved.get(key(x, y)) ?? null,
    mapAt: (x, y) => mapsAt.get(key(x, y)) ?? null,
    cellsOf: (subareaId) => cells.get(subareaId) ?? EMPTY,
    ready: resolved.size > 0,
  };
}

const cache = new Map<number, SubareaIndex>();

/**
 * L'index de la super-aire, construit une fois. Rend `null` tant que
 * `loadMapsLang()` n'a pas résolu — l'appelant réessaie au prochain survol.
 */
export function getSubareaIndex(superarea: number): SubareaIndex | null {
  const cached = cache.get(superarea);

  if (cached) {
    return cached;
  }

  const data = getMapsLang();

  if (!data || data.maps.size === 0) {
    return null;
  }

  const index = buildSubareaIndex(data, superarea);
  cache.set(superarea, index);
  return index;
}

/** Pour les tests — vide la mémoïsation. */
export function resetSubareaIndexCache(): void {
  cache.clear();
}
