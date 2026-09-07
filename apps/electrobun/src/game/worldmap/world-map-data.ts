import type {
  HintManifest,
  HintsData,
  HintsLayering,
  WorldMapManifest,
  WorldMapTile,
} from "@/game/types/worldmap";
import { getMapSuperarea } from "@/game/lang/maps-lang";
import { WORLDMAP_CONSTANTS } from "@/game/types/worldmap";

export interface WorldMapDataSet {
  manifest: WorldMapManifest;
  hintsData: HintsData;
  hintManifest: HintManifest;
  hintsLayering: HintsLayering;
}

const dataCache = new Map<string, WorldMapDataSet>();
const inFlight = new Map<string, Promise<WorldMapDataSet>>();

export function worldMapName(superarea: number): string {
  return superarea === 0 ? "amakna" : "incarnam";
}

/**
 * Les quatre JSON dont la carte a besoin.
 *
 * `map-data.json` n'en fait plus partie : ses 844 Ko ne portaient que
 * `{x, y, sua}` par carte, que `maps.json` — déjà chargé pour le libellé de
 * position — donne aussi, avec la sous-zone en plus. Voir `subarea-index.ts`.
 */
export async function loadWorldMapData(
  superarea: number
): Promise<WorldMapDataSet> {
  const cacheKey = worldMapName(superarea);
  const cached = dataCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  // Le préchargement au ralenti et l'ouverture du panneau peuvent tomber en
  // même temps ; sans ce verrou les deux téléchargeraient tout.
  const pending = inFlight.get(cacheKey);

  if (pending) {
    return pending;
  }

  const promise = (async () => {
    const [manifest, hintsData, hintManifest, hintsLayering] =
      await Promise.all([
        fetch(`/assets/maps/world/${cacheKey}/manifest.json`).then((r) =>
          r.json()
        ) as Promise<WorldMapManifest>,
        fetch("/assets/data/hints-data.json").then((r) =>
          r.json()
        ) as Promise<HintsData>,
        fetch("/assets/maps/hints/manifest.json").then((r) =>
          r.json()
        ) as Promise<HintManifest>,
        fetch("/assets/data/hints-layering.json").then((r) =>
          r.json()
        ) as Promise<HintsLayering>,
      ]);

    const dataSet: WorldMapDataSet = {
      manifest,
      hintsData,
      hintManifest,
      hintsLayering,
    };

    dataCache.set(cacheKey, dataSet);
    inFlight.delete(cacheKey);
    return dataSet;
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}

/** Rectangle visible, en pixels du plan de tuiles. */
export interface TileViewport {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Les tuiles de détail qui touchent le viewport, plus une marge de `margin`
 * tuiles pour que le pan n'attende pas le chargement.
 *
 * C'est le cœur du gain à l'ouverture : le renderer chargeait les 1024 tuiles
 * d'Amakna d'un coup — 1024 requêtes et autant d'uploads de textures dans une
 * frame — alors qu'au zoom par défaut une vingtaine sont visibles.
 */
export function selectVisibleTiles(
  manifest: WorldMapManifest,
  view: TileViewport,
  margin = 1
): WorldMapTile[] {
  const size = manifest.tile_size;
  const minX = Math.floor(view.left / size) - margin;
  const maxX = Math.floor(view.right / size) + margin;
  const minY = Math.floor(view.top / size) - margin;
  const maxY = Math.floor(view.bottom / size) + margin;

  return manifest.tiles.filter(
    (t) => t.x >= minX && t.x <= maxX && t.y >= minY && t.y <= maxY
  );
}

/**
 * Vrai quand les tuiles pleine résolution apportent quelque chose.
 *
 * L'aperçu porte la planche à `overview_size / planeSize` — un quart pour
 * Amakna. En dessous de ce facteur d'affichage, une tuile de détail serait
 * réduite plus fort que l'aperçu ne l'est déjà : autant ne rien télécharger.
 */
export function shouldLoadDetailTiles(
  manifest: WorldMapManifest,
  scale: number
): boolean {
  if (!manifest.overview || !manifest.overview_size) {
    return true;
  }

  const planeSize = manifest.grid_size * manifest.tile_size;
  return scale > manifest.overview_size / planeSize;
}

/** Étendue réelle du contenu, en pixels du plan de tuiles. */
export function contentExtent(manifest: WorldMapManifest): {
  width: number;
  height: number;
} {
  const { bounds } = manifest;
  const { DISPLAY_WIDTH, DISPLAY_HEIGHT } = WORLDMAP_CONSTANTS;

  return {
    width: (bounds.xMax - bounds.xMin + 1) * DISPLAY_WIDTH,
    height: (bounds.yMax - bounds.yMin + 1) * DISPLAY_HEIGHT,
  };
}

export function mapCoordToPixel(
  gameMapX: number,
  gameMapY: number,
  chunkXMin: number,
  chunkYMin: number,
  scale = 1
): [number, number] {
  const { DISPLAY_WIDTH, DISPLAY_HEIGHT, CHUNK_SIZE } = WORLDMAP_CONSTANTS;

  const chunkX = gameMapX / CHUNK_SIZE;
  const chunkY = gameMapY / CHUNK_SIZE;

  const offsetX = chunkX - chunkXMin;
  const offsetY = chunkY - chunkYMin;

  const pixelX = Math.round(offsetX * DISPLAY_WIDTH * scale);
  const pixelY = Math.round(offsetY * DISPLAY_HEIGHT * scale);

  const mapCellWidth = DISPLAY_WIDTH / CHUNK_SIZE;
  const mapCellHeight = DISPLAY_HEIGHT / CHUNK_SIZE;

  return [pixelX + mapCellWidth / 2, pixelY + mapCellHeight / 2];
}

/**
 * Inverse of mapCoordToPixel — converts world map pixel coordinates back to game map coords.
 */
export function pixelToMapCoord(
  pixelX: number,
  pixelY: number,
  chunkXMin: number,
  chunkYMin: number,
  scale = 1
): { x: number; y: number } {
  const { DISPLAY_WIDTH, DISPLAY_HEIGHT, CHUNK_SIZE } = WORLDMAP_CONSTANTS;

  const mapCellWidth = DISPLAY_WIDTH / CHUNK_SIZE;
  const mapCellHeight = DISPLAY_HEIGHT / CHUNK_SIZE;

  const offsetX = (pixelX - mapCellWidth / 2) / (DISPLAY_WIDTH * scale);
  const offsetY = (pixelY - mapCellHeight / 2) / (DISPLAY_HEIGHT * scale);

  const chunkX = offsetX + chunkXMin;
  const chunkY = offsetY + chunkYMin;

  return {
    x: Math.round(chunkX * CHUNK_SIZE),
    y: Math.round(chunkY * CHUNK_SIZE),
  };
}

export function filterHintsByArea(
  hintsLayering: HintsLayering,
  enabledCategories: Set<number>,
  superarea: number
): Array<{
  overlay: { x: number; y: number };
  hint: { name: string; categoryID: number; gfxID: number; mapID: number };
}> {
  const result: Array<{
    overlay: { x: number; y: number };
    hint: { name: string; categoryID: number; gfxID: number; mapID: number };
  }> = [];

  for (const overlay of hintsLayering.hint_overlays) {
    for (const hint of overlay.hints) {
      if (!enabledCategories.has(hint.categoryID)) {
        continue;
      }

      // `null` = carte inconnue du bundle : on la garde plutôt que de faire
      // disparaître un hint parce que le bundle n'a pas fini de charger.
      const hintSuperarea = getMapSuperarea(hint.mapID);

      if (hintSuperarea !== null && hintSuperarea !== superarea) {
        continue;
      }

      result.push({ overlay: { x: overlay.x, y: overlay.y }, hint });
    }
  }

  return result;
}
