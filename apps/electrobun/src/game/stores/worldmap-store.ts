import type { WorldMapMarker, WorldMapTool } from "@/game/types/worldmap";
import { GRID_FILTER_ID, MARKER_COLORS } from "@/game/types/worldmap";

import { ExternalStore } from "./game-store";

/**
 * L'état que le joueur pilote depuis la barre du haut de la carte du monde :
 * l'outil actif, les filtres, et ses marqueurs.
 *
 * Tout est persisté en localStorage sur le modèle de `hud/core/keybindings.ts`
 * — le 1.29 rangeait déjà `MapFilters` dans son `SharedObject`
 * (`OptionsManager.as:6`). Les marqueurs vont plus loin que le 1.29, qui n'a
 * qu'un drapeau de cible et ne le persiste nulle part, mais ils restent
 * strictement côté client : aucun message ni table serveur ne porte
 * d'annotation de carte.
 */

const STORAGE_KEY = "dofus:worldmap";

export interface WorldMapState {
  tool: WorldMapTool;
  /** Couleur du prochain marqueur posé. */
  markerColor: number;
  /** Catégorie de hint -> affichée. `GRID_FILTER_ID` pilote la grille. */
  filters: Record<number, boolean>;
  markers: WorldMapMarker[];
  /** Sous-zone survolée, pour la lecture centrale de la barre. */
  hovered: { areaName: string; subareaName: string } | null;
  /** Zoom courant, reflété par le curseur de la barre. */
  zoom: number;
}

/** Défauts du 1.29 : `MapFilters:[0,1,1,1,1,1,1]` — grille éteinte. */
const DEFAULT_FILTERS: Record<number, boolean> = {
  [GRID_FILTER_ID]: false,
  1: true,
  2: true,
  3: true,
  4: true,
  5: true,
  6: true,
};

/** Ce qui survit à un rechargement — le survol et le zoom n'en font pas partie. */
interface Persisted {
  tool: WorldMapTool;
  markerColor: number;
  filters: Record<number, boolean>;
  markers: WorldMapMarker[];
}

const TOOLS: readonly WorldMapTool[] = ["move", "marker"];

function isMarker(value: unknown): value is WorldMapMarker {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const m = value as Partial<WorldMapMarker>;

  return (
    typeof m.id === "string" &&
    Number.isFinite(m.x) &&
    Number.isFinite(m.y) &&
    Number.isFinite(m.color) &&
    (m.label === undefined || typeof m.label === "string")
  );
}

/** Ne jette jamais : une entrée corrompue retombe sur les défauts. */
export function parsePersisted(raw: string | null): Partial<Persisted> {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Partial<Persisted>;

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    const out: Partial<Persisted> = {};

    if (parsed.tool && TOOLS.includes(parsed.tool)) {
      out.tool = parsed.tool;
    }

    if (Number.isFinite(parsed.markerColor)) {
      out.markerColor = parsed.markerColor;
    }

    if (typeof parsed.filters === "object" && parsed.filters !== null) {
      const filters: Record<number, boolean> = { ...DEFAULT_FILTERS };

      for (const [key, value] of Object.entries(parsed.filters)) {
        const id = Number(key);

        if (Number.isInteger(id) && typeof value === "boolean") {
          filters[id] = value;
        }
      }

      out.filters = filters;
    }

    if (Array.isArray(parsed.markers)) {
      out.markers = parsed.markers.filter(isMarker);
    }

    return out;
  } catch {
    return {};
  }
}

function load(): Partial<Persisted> {
  try {
    return parsePersisted(
      globalThis.localStorage?.getItem(STORAGE_KEY) ?? null
    );
  } catch {
    return {};
  }
}

function save(state: WorldMapState): void {
  try {
    const persisted: Persisted = {
      tool: state.tool,
      markerColor: state.markerColor,
      filters: state.filters,
      markers: state.markers,
    };

    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // Mode privé, quota plein : l'état en mémoire reste bon pour la session.
  }
}

const restored = load();

const initialState: WorldMapState = {
  tool: restored.tool ?? "move",
  markerColor: restored.markerColor ?? MARKER_COLORS[0]?.value ?? 0xff0000,
  filters: restored.filters ?? { ...DEFAULT_FILTERS },
  markers: restored.markers ?? [],
  hovered: null,
  zoom: 50,
};

export const worldMapStore = new ExternalStore<WorldMapState>(initialState);

export function setWorldMapTool(tool: WorldMapTool): void {
  worldMapStore.setState({ tool });
  save(worldMapStore.getSnapshot());
}

export function setMarkerColor(color: number): void {
  worldMapStore.setState({ markerColor: color });
  save(worldMapStore.getSnapshot());
}

export function setWorldMapFilter(categoryId: number, enabled: boolean): void {
  const { filters } = worldMapStore.getSnapshot();

  worldMapStore.setState({ filters: { ...filters, [categoryId]: enabled } });
  save(worldMapStore.getSnapshot());
}

export function addMarker(x: number, y: number, color: number): WorldMapMarker {
  const marker: WorldMapMarker = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    x,
    y,
    color,
  };

  const { markers } = worldMapStore.getSnapshot();
  worldMapStore.setState({ markers: [...markers, marker] });
  save(worldMapStore.getSnapshot());

  return marker;
}

export function removeMarker(id: string): void {
  const { markers } = worldMapStore.getSnapshot();

  worldMapStore.setState({ markers: markers.filter((m) => m.id !== id) });
  save(worldMapStore.getSnapshot());
}

export function renameMarker(id: string, label: string): void {
  const { markers } = worldMapStore.getSnapshot();
  const trimmed = label.trim();

  worldMapStore.setState({
    markers: markers.map((m) =>
      m.id === id ? { ...m, ...(trimmed ? { label: trimmed } : {}) } : m
    ),
  });
  save(worldMapStore.getSnapshot());
}

/** Survol et zoom ne sont pas persistés : ils décrivent la vue, pas un choix. */
export function setHoveredSubarea(hovered: WorldMapState["hovered"]): void {
  worldMapStore.setState({ hovered });
}

export function setWorldMapZoom(zoom: number): void {
  worldMapStore.setState({ zoom });
}

export const WORLDMAP_STORAGE_KEY = STORAGE_KEY;
export const WORLDMAP_DEFAULT_FILTERS = DEFAULT_FILTERS;
