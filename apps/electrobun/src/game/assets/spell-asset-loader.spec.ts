import { expect, test } from "bun:test";

import { Texture } from "pixi.js";

import type { SpellVelloRenderer } from "@/game/render/spell-vello-renderer";

import { SpellAssetLoader } from "./spell-asset-loader";

test("a symbol the .dofasset lacks degrades to an empty layer, warned once", async () => {
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
  if (!loaded) {
    throw new Error("le sort 610 n'a pas été chargé");
  }
  const textures = loaded.textures;
  expect(textures.getFrames("sprite_9")).toHaveLength(1);
  expect(textures.getAnimationInfo?.("parent")).toBeNull();

  // QA-168: an absent symbol used to throw, and one missing particle
  // layer then aborted the whole spell visual — the player saw nothing
  // at all. A SpellClip with zero frames still runs its frameScripts, so
  // the spell now plays and merely loses that layer.
  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  try {
    expect(textures.getFrames("missing")).toEqual([]);
    expect(textures.hasTexture("missing_0")).toBe(false);
    // Same symbol asked for on every frame of the clip: the warning is
    // deduped per provider, so it never floods the journal.
    expect(textures.getFrames("missing")).toEqual([]);
  } finally {
    console.warn = realWarn;
  }
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain("symbole absent du fichier compilé (missing)");

  // A frame index outside a symbol that *is* present stays an error:
  // that one means the caller asked for a frame the asset should carry.
  expect(() => textures.getTexture("sprite_9_99")).toThrow(
    "texture sprite_9_99 introuvable"
  );
  // Do not destroy Texture.EMPTY, a process-wide fixture owned by Pixi.
});
