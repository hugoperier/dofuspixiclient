import { expect, test } from "bun:test";

import { Container, type Renderer, Sprite, Texture } from "pixi.js";

import type { PlayerRenderer } from "../player/renderer";
import { PickingSystem } from "../../render/picking-system";
import { contextMenuStore } from "../../stores/context-menu-store";
import { BattlefieldPicking } from "./picking";

test("combat filters exploration hit areas before picking and preserves fighter targets", () => {
  const root = new Container();
  const cpu = new PickingSystem({} as Renderer);
  const tree = new Sprite(Texture.WHITE),
    fighter = new Sprite(Texture.WHITE);
  root.addChild(tree, fighter);
  fighter.position.x = 30;
  const renderer = {
    getPlayerPickingData: () => ({ sprite: fighter }),
    getPlayerName: () => "Fighter",
    getPlayerCell: () => 215,
    setHoverHighlight() {},
    setHpBarVisible() {},
    showName() {},
    hideName() {},
  } as unknown as PlayerRenderer;
  const clicks: number[] = [];
  const picking = new BattlefieldPicking({
    pickingSystem: () => cpu,
    interactiveObjects: () =>
      new Map([
        [
          123,
          {
            id: 1,
            name: "Arbre",
            type: 1,
            skills: [{ id: 101, label: "Couper", jobId: 1 }],
          },
        ],
      ]),
    npcLang: () => new Map(),
    worldActorRenderer: () => renderer,
    app: () => null,
    isCombatFighter: (id) => id === 1,
    onCellPickThrough: (cell) => clicks.push(cell),
  });
  const treeId = picking.registerTile(tree, 123, 200);
  picking.registerPlayer(1, renderer);
  // The CPU picker extracts alpha once; the headless renderer uses its AABB fallback.
  cpu.pick(0.5, 0.5, root);
  const treePick = cpu.pick(0.5, 0.5, root);
  expect(treePick?.object.id).toBe(treeId);
  picking.onObjectClick(treePick!);
  expect(contextMenuStore.getSnapshot().open).toBe(true);
  picking.setCombatMode(true);
  expect(contextMenuStore.getSnapshot().open).toBe(false);
  expect(cpu.pick(0.5, 0.5, root)).toBeNull(); // caller now resolves the actual ground cell
  const fighterPick = cpu.pick(30.5, 0.5, root);
  expect(fighterPick).not.toBeNull();
  picking.onObjectClick(fighterPick!);
  expect(clicks).toEqual([215]);
  expect(contextMenuStore.getSnapshot().open).toBe(false);
  picking.setCombatMode(false);
  expect(cpu.pick(0.5, 0.5, root)?.object.id).toBe(treeId);
  root.destroy({ children: true });
});
