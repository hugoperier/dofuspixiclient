import { expect, test } from "bun:test";

import { readSpellExtras } from "@dofus/dofasset-format";
import { Texture } from "pixi.js";

import { PreRenderedSpell } from "./pre-rendered-spell";

test("graphic 810 preserves its original sound, impact and removal frames", async () => {
  const bytes = new Uint8Array(
    await Bun.file(
      new URL(
        "../../../../public/assets/spritesheets/spells/810.dofasset",
        import.meta.url
      )
    ).arrayBuffer()
  );
  const extras = readSpellExtras(bytes);
  if (!extras) {
    throw new Error("Graphic 810 lacks its compiled metadata");
  }
  expect(extras.requiresTypeScript).toBe(false);
  expect(extras.fps).toBe(20);
  expect(extras.animationMeta.anim1).toMatchObject({
    hitFrame: 25,
    removeFrame: 53,
  });
  const spell = new PreRenderedSpell(810, {
    manifest: {
      version: 1,
      spriteId: "810",
      animations: extras.animations,
      spell: { ...extras, id: 810 },
    },
    textures: {
      getTexture: () => Texture.EMPTY,
      getFrames: () => Array.from({ length: 54 }, () => Texture.EMPTY),
      hasTexture: () => true,
    },
  });
  const events: string[] = [];
  const cell = { cellId: 0, x: 0, y: 0, groundLevel: 0 };
  spell.init(
    {
      cellFrom: cell,
      cellTo: cell,
      displayType: 11,
      anchor: cell,
      angle: 0,
      distance: 0,
      level: 6,
      caster: {
        id: 1,
        name: "Iop",
        team: 0,
        hp: 100,
        maxHp: 100,
        isPlayer: true,
      },
      casterFacingRight: true,
      parentFrame: 0,
      instanceIndex: 0,
      isCritical: false,
    },
    {
      onHit: () => events.push("impact"),
      onComplete: () => events.push("complete"),
      playSound: (id) => events.push(id),
      onEvent() {},
    }
  );
  spell.update(1150);
  expect(events).toEqual([]);
  spell.update(50);
  expect(events).toEqual(["explosion"]);
  spell.update(50);
  expect(events).toEqual(["explosion", "impact"]);
  spell.update(1350);
  expect(spell.isComplete()).toBe(false);
  spell.update(50);
  expect(events).toEqual(["explosion", "impact", "complete"]);
  spell.update(5000);
  expect(events).toHaveLength(3);
  expect(spell.isComplete()).toBe(true);
  spell.destroy();
});
