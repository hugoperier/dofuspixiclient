import { expect, test } from "bun:test";

import { Container, Sprite, Texture } from "pixi.js";

import type { AtlasLoader } from "@/game/render/atlas-loader";

import { MapHandler } from "../map/handler";
import { BattlefieldZoom } from "./zoom";

test("a full zoom rebuild preserves actors already attached to the map", async () => {
  const map = new Container();
  const data = { id: 1, width: 15, height: 17, cells: [] };
  const atlas = {
    getZoom: () => 1,
    setZoom() {},
    prefetchTiles: async () => {},
  } as unknown as AtlasLoader;
  const handler = new MapHandler({ atlasLoader: atlas });
  await handler.renderMap(data, map, 1);
  const fighter = new Sprite(Texture.WHITE);
  const layer = handler.getObjectLayer2();
  layer.addChild(fighter);
  const zoom = new BattlefieldZoom({
    mapHandler: () => handler,
    mapContainer: () => map,
    atlasLoader: () => atlas,
    currentMapData: () => data,
    getViewport: () => null,
    onBeforeRebuild() {},
    onAfterRender() {},
  });
  await zoom.forceRender(2);
  expect(fighter.parent === layer).toBe(true);
  expect(layer.parent === map).toBe(true);
  zoom.destroy();
});
