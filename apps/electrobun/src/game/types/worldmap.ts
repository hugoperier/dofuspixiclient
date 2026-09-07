import type { Container, Graphics, Sprite } from "pixi.js";

export interface WorldMapBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface WorldMapTile {
  x: number;
  y: number;
  file: string;
}

export interface WorldMapManifest {
  worldmap: string;
  grid_size: number;
  tile_size: number;
  format: string;
  bounds: WorldMapBounds;
  /**
   * Nom de l'aperçu basse résolution, écrit par `just worldmap-optimize`.
   * Absent sur un manifeste non optimisé — le renderer retombe alors sur les
   * seules tuiles de détail.
   */
  overview?: string;
  /** Côté de l'aperçu en pixels ; la planche fait `grid_size * tile_size`. */
  overview_size?: number;
  /**
   * Tuiles d'une seule couleur, groupées par teinte hexadécimale sans `#`.
   * Elles ne sont jamais téléchargées : le renderer en fait des rectangles
   * pleins, ce qui est exact au pixel puisque la tuile était unie.
   */
  uniform_tiles?: Record<string, Array<[number, number]>>;
  /** Tuiles qui portent réellement du détail. */
  tiles: WorldMapTile[];
}

export interface HintGraphic {
  file: string;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

export interface HintManifest {
  format: string;
  graphics: Record<string, HintGraphic>;
}

export interface HintCategory {
  id: number;
  name: string;
  color: string;
}

export interface HintEntry {
  name: string;
  categoryID: number;
  category: string;
  color: string;
  gfxID: number;
}

export interface HintsData {
  categories: HintCategory[];
  hints_by_map: Record<string, HintEntry[]>;
}

export interface HintOverlayEntry {
  name: string;
  categoryID: number;
  gfxID: number;
  mapID: number;
}

export interface HintOverlay {
  x: number;
  y: number;
  hints: HintOverlayEntry[];
}

export interface HintsLayering {
  hint_overlays: HintOverlay[];
}

export interface MapCoordinate {
  x: number;
  y: number;
  sua: number;
}

export type MapCoordinates = Record<string, MapCoordinate>;

export interface HintSpriteData {
  baseX: number;
  baseY: number;
  hintData: HintOverlayEntry;
  groupKey: string;
}

export interface HintGroup {
  sprites: Sprite[];
  hitArea: Graphics | null;
  visualCircle: Graphics | null;
  isSpread: boolean;
}

export interface WorldMapConfig {
  container: HTMLElement;
  width?: number;
  height?: number;
  backgroundColor?: number;
  initialZoom?: number;
  minZoom?: number;
  maxZoom?: number;
  interactive?: boolean;
}

export interface MinimapConfig {
  app: import("pixi.js").Application;
  container: Container;
  size: number;
  zoom?: number;
}

/**
 * Zoom matches original MapNavigator.as: range 10–100, step ±5.
 * MIN_ZOOM (10) = full map fits viewport. MAX_ZOOM (100) = ~14 cells across ≈ 4×4 grid.
 * DEFAULT_ZOOM (50) = opens at mid-zoom, matching Basics.as `mapExplorer_zoom = 50`.
 */
export const WORLDMAP_CONSTANTS = {
  DISPLAY_WIDTH: 742,
  DISPLAY_HEIGHT: 432,
  CHUNK_SIZE: 15,
  DEFAULT_ZOOM: 50,
  MIN_ZOOM: 10,
  MAX_ZOOM: 100,
  ZOOM_STEP: 5,
} as const;

/**
 * Outils de la barre du haut, mutuellement exclusifs comme `_btnMove` /
 * `_btnSelect` en 1.29 (`MapExplorer.as:567-589`).
 *
 * Le 1.29 sépare « déplacer » et « sélectionner » parce que sa sélection pose
 * le drapeau de cible unique. Ici ce rôle revient à l'outil marqueur, et le pan
 * reste disponible dans les deux modes — un bouton « sélectionner » de plus
 * n'aurait rien fait.
 */
export type WorldMapTool = "move" | "marker";

/** Un marqueur posé par le joueur, en coordonnées de carte. */
export interface WorldMapMarker {
  id: string;
  x: number;
  y: number;
  /** Couleur 0xRRGGBB, prise dans `MARKER_COLORS`. */
  color: number;
  label?: string;
}

/**
 * Palette du sélecteur de marqueur. Reprend les teintes que le 1.29 utilisait
 * pour ses drapeaux de carte (`Constants.as:186-193`), plus de quoi distinguer
 * plusieurs annotations.
 */
export const MARKER_COLORS: ReadonlyArray<{ name: string; value: number }> = [
  { name: "Rouge", value: 0xff0000 },
  { name: "Bleu", value: 0x006699 },
  { name: "Vert", value: 0xccff00 },
  { name: "Jaune", value: 0xffcc00 },
  { name: "Violet", value: 0x8844ff },
  { name: "Blanc", value: 0xffffff },
];

/**
 * Identifiant de la case « Grille » dans la rangée de filtres. Le 1.29 écrase
 * l'entrée 0 des catégories avec la grille (`MapExplorer.as:188`), et persiste
 * les sept dans une seule option `MapFilters`.
 */
export const GRID_FILTER_ID = 0;

/** Teinte du survol de sous-zone — `AREA_NO_ALIGNMENT_COLOR` en 1.29. */
export const SUBAREA_HIGHLIGHT_COLOR = 0xffff99;

/** Opacité du survol — `_alpha = 20` dans `MapNavigator.addSubareaClip`. */
export const SUBAREA_HIGHLIGHT_ALPHA = 0.2;

export const HINT_COLORS: Record<string, number> = {
  Orange: 0xff8800,
  Blue: 0x4488ff,
  Green: 0x44ff44,
  Beige: 0xf5deb3,
  Red: 0xff4444,
  Violet: 0x8844ff,
};
