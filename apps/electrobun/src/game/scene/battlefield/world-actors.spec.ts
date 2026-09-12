import { expect, spyOn, test } from "bun:test";

import type { MonsterGroupMember } from "@dofus/proto";
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

test("a monster group registers its sprite ids leader-first", async () => {
  // The picking layer routes a click on any member to element 0 of this
  // list, so the order is a contract, not an implementation detail: only
  // the leader stands on the cell the server spawned the group on, and
  // only that cell starts the fight (QA-175).
  const CHILD_IDS = [-1_000_000_001, -1_000_000_002];
  const add = spyOn(PlayerRenderer.prototype, "addPlayer").mockImplementation(
    () => Promise.resolve()
  );
  const children = spyOn(
    PlayerRenderer.prototype,
    "getLinkedChildIds"
  ).mockImplementation(() => [...CHILD_IDS]);
  const registrations: Array<{ id: number; groupSpriteIds?: number[] }> = [];
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
    registerPlayerForPicking: (id, _renderer, _group, _self, _bonus, ids) => {
      registrations.push({
        id,
        ...(ids === undefined ? {} : { groupSpriteIds: [...ids] }),
      });
    },
    unregisterPlayerFromPicking() {},
    markPickingDirty() {},
  });
  try {
    await actors.add({
      id: -7,
      name: "",
      cellId: 300,
      direction: 1,
      look: "1",
      isCurrentPlayer: false,
      monsterGroup: [
        { name: "Piou Violet", level: 4 },
        { name: "Piou Bleu", level: 1 },
        { name: "Piou Vert", level: 1 },
      ] as unknown as MonsterGroupMember[],
    });

    expect(registrations.map((r) => r.id)).toEqual([-7, ...CHILD_IDS]);
    for (const registration of registrations) {
      expect(registration.groupSpriteIds).toEqual([-7, ...CHILD_IDS]);
    }
  } finally {
    actors.destroy();
    children.mockRestore();
    add.mockRestore();
    map.destroy({ children: true });
  }
});
