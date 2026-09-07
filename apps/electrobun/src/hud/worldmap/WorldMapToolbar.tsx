import { useEffect, useRef, useState } from "react";

import type {
  HintCategory,
  WorldMapMarker,
  WorldMapTool,
} from "@/game/types/worldmap";
import { SideChatPanelFilter } from "@/components/ui/side-chat-panel";
import {
  setMarkerColor,
  setWorldMapFilter,
  setWorldMapTool,
} from "@/game/stores/worldmap-store";
import {
  GRID_FILTER_ID,
  HINT_COLORS,
  MARKER_COLORS,
  WORLDMAP_CONSTANTS,
} from "@/game/types/worldmap";
import { loadWorldMapData } from "@/game/worldmap/world-map-data";

/**
 * La barre du haut de la carte du monde, reprise de `MapExplorer.as`.
 *
 * Elle vivait dans le canevas (`WorldMapRenderer.createCategoryUI`), ancrée en
 * dur en haut à gauche : elle masquait la carte, n'était ni déplaçable ni
 * repliable, son titre restait en anglais et ses cases étaient toutes vertes —
 * QA-028, QA-029 et QA-032. En React elle réutilise le composant de case à
 * cocher colorée du chat, et elle laisse la carte entière visible.
 *
 * Disposition 1.29 : outils et zoom à gauche, `Région : <aire>` au centre,
 * `Filtres` à droite.
 */

interface WorldMapToolbarProps {
  height: number;
  zoom: number;
  tool: WorldMapTool;
  markerColor: number;
  filters: Record<number, boolean>;
  hovered: { areaName: string; subareaName: string } | null;
  mapZoom: number;
  onToolChange: (tool: WorldMapTool) => void;
  onZoomChange: (zoom: number) => void;
  onCenterOnPlayer: () => void;
  onFilterChange: (categoryId: number, enabled: boolean) => void;
  onClose: () => void;
  /** Marqueur en cours de renommage, piloté par le panneau. */
  renaming: WorldMapMarker | null;
  onRenameCommit: (label: string) => void;
  onRenameCancel: () => void;
}

const CLOSE_UP = "/themes/classic/assets/common/close-up.svg";

/** `MapExplorer.as:188` écrase l'entrée 0 des catégories par la grille. */
const GRID_CATEGORY: HintCategory = {
  id: GRID_FILTER_ID,
  name: "Grille",
  color: "Yellow",
};

const FILTER_CSS_COLORS: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(HINT_COLORS).map(([name, value]) => [
      name,
      `#${value.toString(16).padStart(6, "0")}`,
    ])
  ),
  Yellow: "#ffcc00",
};

const TOOLS: ReadonlyArray<{
  id: WorldMapTool;
  label: string;
  glyph: string;
}> = [
  { id: "move", label: "Déplacer la carte", glyph: "✋" },
  { id: "marker", label: "Poser un marqueur", glyph: "⚑" },
];

export function WorldMapToolbar({
  height,
  zoom,
  tool,
  markerColor,
  filters,
  hovered,
  mapZoom,
  onToolChange,
  onZoomChange,
  onCenterOnPlayer,
  onFilterChange,
  onClose,
  renaming,
  onRenameCommit,
  onRenameCancel,
}: WorldMapToolbarProps) {
  const [categories, setCategories] = useState<HintCategory[]>([]);
  const [draft, setDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    void loadWorldMapData(0).then((data) => {
      if (!cancelled) {
        setCategories(data.hintsData.categories);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setDraft(renaming?.label ?? "");

    if (renaming) {
      renameInputRef.current?.focus();
    }
  }, [renaming]);

  const p = (n: number) => n * zoom;
  const { MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } = WORLDMAP_CONSTANTS;
  const rows = [GRID_CATEGORY, ...categories];

  const buttonStyle = (active: boolean): React.CSSProperties => ({
    width: p(22),
    height: p(22),
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: p(12),
    lineHeight: 1,
    background: active ? "#8a7a55" : "#3d3629",
    color: "#f0e6d2",
    border: `${Math.max(1, p(1))}px solid #6b5f47`,
    borderRadius: p(3),
    cursor: "pointer",
    padding: 0,
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: p(8),
        padding: `0 ${p(8)}px`,
        background: "var(--dofus-header-bg, #514a3c)",
        borderBottom: `${Math.max(1, p(1))}px solid #2a2418`,
        fontFamily: "Verdana, sans-serif",
        color: "#f0e6d2",
        // Seule la barre capte le pointeur : le reste du panneau laisse passer
        // vers le canevas Pixi, sans quoi rien n'est cliquable ni glissable.
        pointerEvents: "auto",
        zIndex: 16,
      }}
    >
      {/* ── Outils ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: p(2) }}>
        {TOOLS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            title={entry.label}
            aria-pressed={tool === entry.id}
            onClick={() => {
              setWorldMapTool(entry.id);
              onToolChange(entry.id);
            }}
            style={buttonStyle(tool === entry.id)}
          >
            {entry.glyph}
          </button>
        ))}
        <button
          type="button"
          title="Centrer sur ma position"
          onClick={onCenterOnPlayer}
          style={buttonStyle(false)}
        >
          ⌖
        </button>
      </div>

      {/* Palette du marqueur, visible seulement quand l'outil est actif. */}
      {tool === "marker" && (
        <div style={{ display: "flex", gap: p(2) }}>
          {MARKER_COLORS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              title={entry.name}
              aria-pressed={markerColor === entry.value}
              onClick={() => setMarkerColor(entry.value)}
              style={{
                width: p(14),
                height: p(14),
                padding: 0,
                borderRadius: p(2),
                cursor: "pointer",
                background: `#${entry.value.toString(16).padStart(6, "0")}`,
                border:
                  markerColor === entry.value
                    ? `${Math.max(2, p(2))}px solid #ffffff`
                    : `${Math.max(1, p(1))}px solid #2a2418`,
              }}
            />
          ))}
        </div>
      )}

      {/* ── Zoom ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: p(4) }}>
        <span style={{ fontSize: p(11) }}>Zoom</span>
        <button
          type="button"
          title="Dézoomer"
          onClick={() => onZoomChange(mapZoom - ZOOM_STEP)}
          style={buttonStyle(false)}
        >
          −
        </button>
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={ZOOM_STEP}
          value={mapZoom}
          aria-label="Zoom"
          onChange={(e) => onZoomChange(Number(e.target.value))}
          style={{ width: p(70), cursor: "pointer" }}
        />
        <button
          type="button"
          title="Zoomer"
          onClick={() => onZoomChange(mapZoom + ZOOM_STEP)}
          style={buttonStyle(false)}
        >
          +
        </button>
      </div>

      {/* ── Lecture centrale ───────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          textAlign: "center",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {renaming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onRenameCommit(draft);
            }}
            style={{ display: "flex", justifyContent: "center", gap: p(4) }}
          >
            <input
              ref={renameInputRef}
              value={draft}
              placeholder="Nom du marqueur"
              aria-label="Nom du marqueur"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  onRenameCancel();
                }
              }}
              style={{
                width: p(160),
                fontSize: p(11),
                fontFamily: "Verdana, sans-serif",
                padding: `${p(2)}px ${p(4)}px`,
              }}
            />
            <button type="submit" style={buttonStyle(false)}>
              ✓
            </button>
          </form>
        ) : (
          <>
            <div style={{ fontSize: p(12), fontWeight: "bold" }}>
              {hovered ? `Région : ${hovered.areaName}` : "Carte du monde"}
            </div>
            <div
              style={{
                fontSize: p(10),
                color: "#c3b79a",
                height: p(12),
              }}
            >
              {hovered?.subareaName ?? ""}
            </div>
          </>
        )}
      </div>

      {/* ── Filtres ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: p(4) }}>
        <span style={{ fontSize: p(11) }}>Filtres</span>
        <div style={{ display: "flex", gap: p(2) }}>
          {rows.map((category) => (
            <SideChatPanelFilter
              key={category.id}
              color={FILTER_CSS_COLORS[category.color] ?? "#888888"}
              label={category.name}
              checked={filters[category.id] ?? true}
              onChange={(e) => {
                setWorldMapFilter(category.id, e.target.checked);
                onFilterChange(category.id, e.target.checked);
              }}
              style={{ width: p(18), height: p(18) }}
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        title="Fermer (M)"
        style={{
          background: "transparent",
          border: 0,
          padding: 0,
          cursor: "pointer",
          display: "inline-flex",
        }}
      >
        <img
          src={CLOSE_UP}
          alt=""
          width={p(12)}
          height={p(12)}
          draggable={false}
        />
      </button>
    </div>
  );
}
