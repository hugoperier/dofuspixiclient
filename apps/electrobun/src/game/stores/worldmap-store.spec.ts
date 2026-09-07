import { describe, expect, it } from "bun:test";

import { parsePersisted } from "./worldmap-store";

describe("parsePersisted", () => {
  it("rend vide sans entrée", () => {
    expect(parsePersisted(null)).toEqual({});
    expect(parsePersisted("")).toEqual({});
  });

  it("ne jette pas sur du JSON cassé", () => {
    expect(parsePersisted("{oops")).toEqual({});
    expect(parsePersisted("[1,2,3]")).toEqual({});
    expect(parsePersisted("null")).toEqual({});
  });

  it("rejette un outil inconnu", () => {
    expect(parsePersisted('{"tool":"teleport"}')).toEqual({});
    expect(parsePersisted('{"tool":"marker"}')).toEqual({ tool: "marker" });
  });

  it("complète les filtres manquants avec les défauts 1.29", () => {
    const parsed = parsePersisted('{"filters":{"3":false}}');

    // Grille éteinte, catégories allumées, sauf celle qu'on a coupée.
    expect(parsed.filters).toEqual({
      0: false,
      1: true,
      2: true,
      3: false,
      4: true,
      5: true,
      6: true,
    });
  });

  it("ignore une valeur de filtre qui n'est pas un booléen", () => {
    const parsed = parsePersisted('{"filters":{"2":"oui"}}');

    expect(parsed.filters?.[2]).toBe(true);
  });

  it("écarte les marqueurs mal formés et garde les bons", () => {
    const raw = JSON.stringify({
      markers: [
        { id: "a", x: 1, y: 2, color: 255 },
        { id: "b", x: 3, y: 4, color: 255, label: "Zaap" },
        { id: "c", x: "nope", y: 4, color: 255 },
        { x: 5, y: 6, color: 255 },
        null,
      ],
    });

    expect(parsePersisted(raw).markers).toEqual([
      { id: "a", x: 1, y: 2, color: 255 },
      { id: "b", x: 3, y: 4, color: 255, label: "Zaap" },
    ]);
  });
});
