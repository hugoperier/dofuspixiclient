import { describe, expect, it } from "bun:test";

import type { WorldMapManifest } from "@/game/types/worldmap";

import {
  contentExtent,
  selectVisibleTiles,
  shouldLoadDetailTiles,
} from "./world-map-data";

/** Amakna en réduction : grille 4×4 de tuiles de 256, aperçu au quart. */
function manifest(overrides: Partial<WorldMapManifest> = {}): WorldMapManifest {
  const tiles = [];

  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      tiles.push({ x, y, file: `tile_${x}_${y}.webp` });
    }
  }

  return {
    worldmap: "amakna",
    grid_size: 4,
    tile_size: 256,
    format: "webp",
    bounds: { xMin: -6, xMax: 2, yMin: -8, yMax: 3 },
    overview: "overview.webp",
    overview_size: 256,
    tiles,
    ...overrides,
  };
}

describe("selectVisibleTiles", () => {
  it("ne garde que les tuiles touchées, marge comprise", () => {
    const visible = selectVisibleTiles(
      manifest(),
      { left: 300, top: 300, right: 400, bottom: 400 },
      0
    );

    expect(visible).toEqual([{ x: 1, y: 1, file: "tile_1_1.webp" }]);
  });

  it("élargit d'une tuile par défaut pour absorber le pan", () => {
    const visible = selectVisibleTiles(manifest(), {
      left: 300,
      top: 300,
      right: 400,
      bottom: 400,
    });

    expect(visible).toHaveLength(9);
    expect(visible.map((t) => `${t.x},${t.y}`)).toContain("0,0");
    expect(visible.map((t) => `${t.x},${t.y}`)).toContain("2,2");
  });

  it("ignore les tuiles unies, qui ne sont plus dans le manifeste", () => {
    const sparse = manifest({
      tiles: [{ x: 2, y: 2, file: "tile_2_2.webp" }],
    });

    const visible = selectVisibleTiles(
      sparse,
      { left: 0, top: 0, right: 1024, bottom: 1024 },
      0
    );

    expect(visible).toHaveLength(1);
  });

  it("rend une liste vide hors du monde", () => {
    const visible = selectVisibleTiles(
      manifest(),
      { left: 9000, top: 9000, right: 9100, bottom: 9100 },
      0
    );

    expect(visible).toEqual([]);
  });
});

describe("shouldLoadDetailTiles", () => {
  // La planche fait 4 × 256 = 1024 px, l'aperçu 256 : facteur 1/4.
  it("s'abstient quand l'aperçu est déjà plus fin que l'affichage", () => {
    expect(shouldLoadDetailTiles(manifest(), 0.2)).toBe(false);
    expect(shouldLoadDetailTiles(manifest(), 0.25)).toBe(false);
  });

  it("charge le détail dès que l'affichage dépasse l'aperçu", () => {
    expect(shouldLoadDetailTiles(manifest(), 0.3)).toBe(true);
    expect(shouldLoadDetailTiles(manifest(), 1)).toBe(true);
  });

  it("charge toujours quand le manifeste n'a pas d'aperçu", () => {
    const legacy = manifest();
    legacy.overview = undefined;

    expect(shouldLoadDetailTiles(legacy, 0.01)).toBe(true);
  });
});

describe("contentExtent", () => {
  it("mesure le contenu, pas la planche de tuiles", () => {
    // 9 chunks de 742 sur 12 chunks de 432 — le plan fait 1024 px de côté ici,
    // et c'est justement l'écart que `clampPosition` confondait.
    expect(contentExtent(manifest())).toEqual({
      width: 9 * 742,
      height: 12 * 432,
    });
  });
});
