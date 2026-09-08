#!/usr/bin/env bun

/**
 * Enrich the svg-spritesheet manifests with spell-specific data
 * (requiresTypeScript, sounds, librarySymbols, fps, mainTimelineScale,
 * stopFrame, fadingFrame) from the original combat-exporter manifests.
 *
 * Usage:
 *   bun tools/combat-exporter/merge-spell-manifests.ts
 */

import { exists, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import linearSpells from "./linear-spells.json";

const ROOT = resolve(import.meta.dirname, "../..");
const SPELL_ANIMS_DIR = resolve(
  process.argv[2] ?? join(ROOT, "tools/combat-exporter/output/spell-anims")
);
const SPRITESHEETS_DIR = resolve(
  process.argv[3] ?? join(ROOT, "assets/spritesheets/spells")
);

interface OriginalAnimation {
  name: string;
  frameCount?: number;
  hitFrame?: number;
  removeFrame?: number;
  stopFrame?: number;
  fadingFrame?: number;
  isComposite?: boolean;
  hasMorphShapes?: boolean;
}

interface OriginalManifest {
  id: number;
  fps: number;
  scale: number;
  mainTimelineScale?: number;
  requiresTypeScript?: boolean;
  animations: OriginalAnimation[];
  librarySymbols?: unknown[];
  sounds?: { frame: number; soundId: string }[];
}

async function main() {
  const entries = await readdir(SPRITESHEETS_DIR, { withFileTypes: true });
  let processed = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const spellId = entry.name;
    const generatedManifestPath = join(
      SPRITESHEETS_DIR,
      spellId,
      "manifest.json"
    );
    const originalManifestPath = join(
      SPELL_ANIMS_DIR,
      spellId,
      "manifest.json"
    );

    if (!(await exists(generatedManifestPath))) {
      skipped++;
      continue;
    }
    if (!(await exists(originalManifestPath))) {
      skipped++;
      continue;
    }

    const generated = JSON.parse(await Bun.file(generatedManifestPath).text());
    const original: OriginalManifest = JSON.parse(
      await Bun.file(originalManifestPath).text()
    );
    const linear = Object.entries(linearSpells).find(
      ([id]) => id === spellId
    )?.[1];
    if (
      linear &&
      (original.fps !== linear.fps ||
        original.animations.find((anim) => anim.name === linear.animation)
          ?.frameCount !== linear.frameCount)
    ) {
      throw new Error(
        `Linear animation ${spellId} differs from its reviewed source; inspect its frame scripts before rebuilding.`
      );
    }

    // Build per-animation metadata map (stopFrame, fadingFrame, isComposite, etc.)
    const animationMeta: Record<string, Partial<OriginalAnimation>> = {};
    for (const anim of original.animations) {
      animationMeta[anim.name] = {
        stopFrame: anim.stopFrame,
        fadingFrame: anim.fadingFrame,
        isComposite: anim.isComposite,
        hasMorphShapes: anim.hasMorphShapes,
        ...(linear && anim.name === linear.animation
          ? { hitFrame: linear.hitFrame, removeFrame: linear.removeFrame }
          : {}),
      };
    }

    // Merge spell-specific data under `spell` key.
    // Only reviewed linear clips may use the frame player. Particle systems
    // and scripted composition keep their generated runtime modules.
    generated.spell = {
      id: original.id,
      fps: original.fps,
      mainTimelineScale: original.mainTimelineScale ?? 1,
      requiresTypeScript: !linear,
      sounds: linear?.sounds ?? original.sounds ?? [],
      librarySymbols: original.librarySymbols ?? [],
      animationMeta,
    };

    await Bun.write(generatedManifestPath, JSON.stringify(generated));
    processed++;
  }

  console.log(`Merged ${processed} manifests (skipped ${skipped})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
