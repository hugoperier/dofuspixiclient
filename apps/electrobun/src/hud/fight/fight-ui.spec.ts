import { expect, test } from "bun:test";

import { Container } from "pixi.js";

import type { CharacterSpriteLoader } from "@/game/assets/character-sprite";
import { RendererRegistry } from "@/game/render/renderer-registry";
import { Scene } from "@/game/scene/scene";

import { FightUI } from "./fight-ui";

test("placement and turns share their overlays and preserve the world's renderer registration", () => {
  const map = new Container();
  const world = new Container();
  map.addChild(world);
  const registry = new RendererRegistry();
  let resized = 0;
  registry.register("player-renderer", () => {
    resized++;
  });
  const ui = new FightUI(
    map,
    new Map(),
    null,
    registry,
    { width: 15, height: 17 },
    {} as CharacterSpriteLoader,
    new Scene(),
    world,
    null
  );
  ui.enterFightMode("placement");
  const highlighter = ui.getCellHighlighter();
  const spells = ui.getSpellRenderer();
  ui.enterFightMode("fighting");
  expect(ui.getCellHighlighter()).toBe(highlighter);
  expect(ui.getSpellRenderer()).toBe(spells);
  ui.exitFightMode();
  registry.notifyResize({
    zoom: 1,
    baseZoom: 1,
    screenWidth: 800,
    screenHeight: 600,
  });
  expect(resized).toBe(1);
  expect(world.parent).toBe(map);
});
