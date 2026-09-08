import { expect, test } from "bun:test";

import { Texture } from "pixi.js";

import type { SpellVelloRenderer } from "@/game/render/spell-vello-renderer";

import { SpellAssetLoader } from "./spell-asset-loader";

test("missing spell symbols fail explicitly while container-only anchor probes remain valid", async () => {
  const bytes = new Uint8Array(
    await Bun.file(
      new URL(
        "../../../public/assets/spritesheets/spells/610.dofasset",
        import.meta.url
      )
    ).arrayBuffer()
  );
  const loader = new SpellAssetLoader();
  loader.setVelloRenderer({
    loadAsset: async () => true,
    getAssetBytes: () => bytes,
    buildAnimation: () => ({
      frames: [Texture.EMPTY],
      frameWidth: 1,
      frameHeight: 1,
      anchorPxX: 0,
      anchorPxY: 0,
    }),
    clearAnimationCache() {},
  } as unknown as SpellVelloRenderer);
  const loaded = await loader.loadSpell(610);
  expect(loaded).not.toBeNull();
  expect(loaded!.textures.getFrames("sprite_9")).toHaveLength(1);
  expect(loaded!.textures.getAnimationInfo?.("parent")).toBeNull();
  expect(() => loaded!.textures.getFrames("missing")).toThrow(
    "symbole missing absent"
  );
  expect(() => loaded!.textures.getTexture("sprite_9_99")).toThrow(
    "texture sprite_9_99 introuvable"
  );
  // Do not destroy Texture.EMPTY, a process-wide fixture owned by Pixi.
});
