import { expect, test } from "bun:test";

import { Container, Sprite, Texture } from "pixi.js";

import type { CellData } from "@/game/datacenter/cell";
import type { AtlasLoader } from "@/game/render/atlas-loader";

import { MapHandler } from "./handler";

test("terrain stays attached during a rebuild and an older load cannot overwrite the current scene", async () => {
  const releases: Array<() => void> = [];
  let defer = false;
  const drawn: number[] = [];
  const handler = new MapHandler({
    atlasLoader: {
      prefetchTiles: () =>
        defer
          ? new Promise<void>((resolve) => releases.push(resolve))
          : Promise.resolve(),
      getZoom: () => 1,
      getTileManifestSync: () => ({ frames: [], offsetX: 0, offsetY: 0 }),
      loadFrameSync: () => Texture.WHITE,
    } as unknown as AtlasLoader,
    onSpriteCreated: (_sprite, id) => {
      drawn.push(id);
    },
  });
  const map = new Container();
  const data = (id: number) => ({
    id,
    width: 15,
    height: 17,
    cells: [
      {
        id: 200,
        active: true,
        ground: id,
        groundLevel: 7,
        groundSlope: 1,
        layer1: 0,
        layer2: 0,
      } as CellData,
    ],
  });
  await handler.renderMap(data(1), map, 1);
  const world = handler.getObjectLayer2();
  const fighter = new Sprite(Texture.WHITE);
  world.addChild(fighter);
  const terrain = map.children
    .flatMap((layer) => layer.children)
    .find((child) => child !== fighter)!;
  defer = true;
  const first = handler.renderMap(data(2), map, 1, null, {
    preserveWorldActors: true,
  });
  expect(terrain.parent !== null).toBe(true);
  const second = handler.renderMap(data(3), map, 1, null, {
    preserveWorldActors: true,
  });
  releases[1]!();
  await second;
  const count = drawn.length;
  releases[0]!();
  await first;
  expect(drawn.length).toBe(count);
  expect(fighter.parent === world).toBe(true);
  expect(map.children.flatMap((layer) => layer.children).length).toBe(2);
});

test("a zoom texture load from the previous map cannot commit after a newer render", async () => {
  let release = () => {};
  let defer = false;
  const loaded: string[] = [];
  const handler = new MapHandler({
    atlasLoader: {
      prefetchTiles: () =>
        defer
          ? new Promise<void>((resolve) => {
              release = resolve;
            })
          : Promise.resolve(),
      setZoom() {},
      getZoom: () => 1,
      getTileManifestSync: () => ({ frames: [], offsetX: 0, offsetY: 0 }),
      loadFrameSync: (key: string) => {
        loaded.push(key);
        return Texture.WHITE;
      },
    } as unknown as AtlasLoader,
  });
  const map = new Container();
  const data = (id: number) => ({
    id,
    width: 15,
    height: 17,
    cells: [
      {
        id: 200,
        active: true,
        ground: id,
        groundLevel: 7,
        groundSlope: 1,
        layer1: 0,
        layer2: 0,
      } as CellData,
    ],
  });
  await handler.renderMap(data(1), map, 1);
  defer = true;
  const zoom = handler.updateTexturesForZoom(2);
  defer = false;
  await handler.renderMap(data(2), map, 1);
  const count = loaded.length;
  release();
  expect(await zoom).toBe(false);
  expect(loaded).toHaveLength(count);
});
