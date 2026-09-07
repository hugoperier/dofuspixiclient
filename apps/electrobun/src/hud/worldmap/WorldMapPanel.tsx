import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { WorldMapMarker, WorldMapTool } from "@/game/types/worldmap";
import { hudStore, toggleWorldMap } from "@/game/stores";
import {
  removeMarker,
  renameMarker,
  worldMapStore,
} from "@/game/stores/worldmap-store";
import { GRID_FILTER_ID } from "@/game/types/worldmap";
import { WorldMapRenderer } from "@/game/worldmap";

import { usePixiApp } from "../contexts/PixiAppContext";
import { WorldMapToolbar } from "./WorldMapToolbar";

interface WorldMapPanelProps {
  visible: boolean;
  zoom: number;
  canvasWidth: number;
  canvasHeight: number;
}

/** Hauteur de la barre d'outils, à l'échelle du HUD. */
const TOOLBAR_BASE_HEIGHT = 34;

/**
 * World map panel.
 * The map itself renders via PIXI (WorldMapRenderer) on the main stage.
 * React owns the toolbar; everything below it belongs to the canvas.
 */
export function WorldMapPanel({
  visible,
  zoom,
  canvasWidth,
  canvasHeight,
}: WorldMapPanelProps) {
  const app = usePixiApp();
  const rendererRef = useRef<WorldMapRenderer | null>(null);
  const loadedRef = useRef(false);
  const [renaming, setRenaming] = useState<WorldMapMarker | null>(null);

  const {
    tool,
    markerColor,
    filters,
    hovered,
    zoom: mapZoom,
  } = useSyncExternalStore(worldMapStore.subscribe, worldMapStore.getSnapshot);

  const toolbarHeight = Math.round(TOOLBAR_BASE_HEIGHT * zoom);

  useEffect(() => {
    if (!app || !visible) {
      return;
    }

    async function init() {
      if (!app) {
        return;
      }

      if (!rendererRef.current) {
        const { Container } = await import("pixi.js");
        const mapContainer = new Container();
        mapContainer.label = "world-map-react";
        app.stage.addChild(mapContainer);

        rendererRef.current = new WorldMapRenderer({
          app,
          parentContainer: mapContainer,
          // Le 1.29 ne téléporte pas au double-clic non plus : il réserve
          // `autorisedMoveCommand` aux MJ (`MapExplorer.as:266-269`).
          onTeleport: () => {},
          onMarkerContextMenu: (marker) => setRenaming(marker),
        });
      }

      const renderer = rendererRef.current;
      renderer.setViewSize(canvasWidth, canvasHeight);
      renderer.setTopInset(toolbarHeight);

      if (!loadedRef.current) {
        await renderer.loadWorldMap(0);
        loadedRef.current = true;
      }

      const snapshot = worldMapStore.getSnapshot();
      renderer.setTool(snapshot.tool);
      renderer.setGridVisible(snapshot.filters[GRID_FILTER_ID] ?? false);

      for (const [id, enabled] of Object.entries(snapshot.filters)) {
        const categoryId = Number(id);

        if (categoryId !== GRID_FILTER_ID) {
          renderer.setCategoryEnabled(categoryId, enabled);
        }
      }

      const currentMapId = hudStore.getSnapshot().minimapMapId;
      renderer.show();

      if (currentMapId != null) {
        renderer.centerOnMapId(currentMapId);
      }
    }

    void init();

    return () => {
      rendererRef.current?.hide();
    };
  }, [app, visible, canvasWidth, canvasHeight, toolbarHeight]);

  useEffect(() => {
    return () => {
      rendererRef.current?.destroy();
      rendererRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  const handleFilterChange = useCallback(
    (categoryId: number, enabled: boolean) => {
      if (categoryId === GRID_FILTER_ID) {
        rendererRef.current?.setGridVisible(enabled);
        return;
      }

      rendererRef.current?.setCategoryEnabled(categoryId, enabled);
    },
    []
  );

  const handleToolChange = useCallback((next: WorldMapTool) => {
    rendererRef.current?.setTool(next);
  }, []);

  const handleZoomChange = useCallback((next: number) => {
    rendererRef.current?.setZoom(next);
  }, []);

  const handleCenter = useCallback(() => {
    rendererRef.current?.centerOnPlayer();
  }, []);

  const handleRenameCommit = useCallback(
    (label: string) => {
      if (renaming) {
        renameMarker(renaming.id, label);
      }

      setRenaming(null);
    },
    [renaming]
  );

  if (!visible) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 15,
        // `none`, surtout pas `auto` : ce conteneur couvre tout le canevas, et
        // en captant le pointeur il privait Pixi de chaque `pointerdown`,
        // `pointermove` et `wheel` — plus de glissé, plus de zoom molette,
        // plus de survol. `HudOverlay` met sa racine à `none` pour exactement
        // cette raison ; seuls les enfants interactifs repassent à `auto`.
        pointerEvents: "none",
      }}
    >
      <WorldMapToolbar
        height={toolbarHeight}
        zoom={zoom}
        tool={tool}
        markerColor={markerColor}
        filters={filters}
        hovered={hovered}
        mapZoom={mapZoom}
        onToolChange={handleToolChange}
        onZoomChange={handleZoomChange}
        onCenterOnPlayer={handleCenter}
        onFilterChange={handleFilterChange}
        onClose={() => toggleWorldMap()}
        renaming={renaming}
        onRenameCommit={handleRenameCommit}
        onRenameCancel={() => setRenaming(null)}
      />

      {renaming && (
        <div
          style={{
            position: "absolute",
            top: toolbarHeight + 4,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 6,
            padding: "4px 8px",
            borderRadius: 4,
            background: "rgba(0, 0, 0, 0.75)",
            color: "#f0e6d2",
            fontFamily: "Verdana, sans-serif",
            fontSize: 11,
            pointerEvents: "auto",
            zIndex: 17,
          }}
        >
          <span>
            Marqueur [{renaming.x}, {renaming.y}]
          </span>
          <button
            type="button"
            onClick={() => {
              removeMarker(renaming.id);
              setRenaming(null);
            }}
            style={{
              background: "#7a2a2a",
              color: "#f0e6d2",
              border: 0,
              borderRadius: 3,
              padding: "1px 6px",
              cursor: "pointer",
            }}
          >
            Supprimer
          </button>
        </div>
      )}
    </div>
  );
}
