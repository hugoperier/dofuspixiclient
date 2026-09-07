import { describe, expect, it } from "bun:test";

import { parseMapsBundle } from "@/game/lang/maps-lang";

import { buildSubareaIndex } from "./subarea-index";

/**
 * Reprend la forme réelle du bundle, avec les deux pièges qu'il pose :
 *
 *   - Bonta (surface, aire 7) et ses égouts (`tt: "souterrain"`, aire 7)
 *     partagent la case (-32, -53) — 557 cases d'Amakna sont dans ce cas ;
 *   - Incarnam (super-aire 3) réemploie la case (1, 1) d'Amakna.
 */
const BUNDLE = {
  data: {
    MA: {
      m: {
        "100": { x: -32, y: -53, sa: 37 },
        "101": { x: -32, y: -53, sa: 73 },
        "102": { x: -31, y: -53, sa: 37 },
        "103": { x: -30, y: -53, sa: 37 },
        "104": { x: -33, y: -53, sa: 73 },
        "200": { x: 1, y: 1, sa: 95 },
      },
      sa: {
        "37": { n: "Bonta", a: 7, tt: "ville" },
        "73": { n: "Egout de Bonta", a: 7, tt: "souterrain" },
        "95": { n: "Pitons rocheux", a: 45, tt: "exterieur" },
      },
      a: {
        "7": { n: "Bonta", sua: 0 },
        "45": { n: "Incarnam", sua: 3 },
      },
    },
  },
};

const data = parseMapsBundle(BUNDLE);

describe("buildSubareaIndex", () => {
  it("préfère la surface au souterrain sur une case partagée", () => {
    const index = buildSubareaIndex(data, 0);

    expect(index.subareaAt(-32, -53)).toBe(37);
  });

  it("garde le souterrain quand il est seul sur la case", () => {
    const index = buildSubareaIndex(data, 0);

    expect(index.subareaAt(-33, -53)).toBe(73);
  });

  it("n'expose que les cases de la super-aire demandée", () => {
    const amakna = buildSubareaIndex(data, 0);
    const incarnam = buildSubareaIndex(data, 3);

    expect(amakna.subareaAt(1, 1)).toBeNull();
    expect(incarnam.subareaAt(1, 1)).toBe(95);
    expect(incarnam.subareaAt(-32, -53)).toBeNull();
  });

  it("rend null hors du monde", () => {
    const index = buildSubareaIndex(data, 0);

    expect(index.subareaAt(999, 999)).toBeNull();
    expect(index.mapAt(999, 999)).toBeNull();
  });

  it("résout une carte par coordonnées", () => {
    const index = buildSubareaIndex(data, 0);

    expect(index.mapAt(-31, -53)).toBe(102);
  });

  it("réunit les cases d'une sous-zone pour la silhouette", () => {
    const index = buildSubareaIndex(data, 0);
    const cells = [...index.cellsOf(37)].sort((a, b) => a.x - b.x);

    // (-32,-53) revient à Bonta malgré l'égout qui la revendique aussi.
    expect(cells).toEqual([
      { x: -32, y: -53 },
      { x: -31, y: -53 },
      { x: -30, y: -53 },
    ]);
  });

  it("rend un tableau vide pour une sous-zone inconnue", () => {
    const index = buildSubareaIndex(data, 0);

    expect(index.cellsOf(4242)).toEqual([]);
  });
});
