import { expect, spyOn, test } from "bun:test";

import { Container } from "pixi.js";

import type { CharacterSpriteLoader } from "@/game/assets/character-sprite";
import { RendererRegistry } from "@/game/render/renderer-registry";

import { PlayerRenderer } from "../player/renderer";
import { Scene } from "../scene";
import { BattlefieldWorldActors } from "./world-actors";

test("an actor loading for the previous world renderer cannot enter the new picking registry", async () => {
  let release = () => {};
  const add = spyOn(PlayerRenderer.prototype, "addPlayer").mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      })
  );
  const registrations: number[] = [];
  const map = new Container(),
    scene = new Scene(),
    registry = new RendererRegistry();
  const actors = new BattlefieldWorldActors({
    mapContainer: () => map,
    mapHandler: () => null,
    scene: () => scene,
    characterSpriteLoader: () => ({}) as CharacterSpriteLoader,
    pickingSystem: () => null,
    pathfinding: () => null,
    cellDataMap: () => new Map(),
    rendererRegistry: () => registry,
    currentMapWidth: () => 15,
    currentMapScale: () => ({ scale: 1, offsetX: 0, offsetY: 0 }),
    transparencyEnabled: () => false,
    applyTransparency() {},
    registerPlayerForPicking: (id) => {
      registrations.push(id);
    },
    unregisterPlayerFromPicking() {},
    markPickingDirty() {},
  });
  try {
    const loading = actors.add({
      id: 1,
      name: "old",
      cellId: 200,
      direction: 1,
      look: "10",
      isCurrentPlayer: true,
    });
    actors.reset();
    release();
    await loading;
    expect(registrations).toEqual([]);
  } finally {
    actors.destroy();
    add.mockRestore();
    map.destroy({ children: true });
  }
});
