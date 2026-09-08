import type {
  ISpellAnimation,
  SpellContext,
  SpellTextureProvider,
} from "@dofus/spell-runtime";
import { Texture } from "pixi.js";

import {
  readAnimations,
  readSpellExtras,
} from "../../../packages/dofasset-format/src";
import { PreRenderedSpell } from "../src/game/scene/fight/pre-rendered-spell";

// Exercise the actual modules with the published frame counts. This verifies
// symbol availability and lifecycle only; it cannot certify rendered pixels.
const root = new URL("../../../", import.meta.url);
const coverage = await Bun.file(
  new URL("doc/combat/spell-coverage.json", root)
).json();
const ids: number[] = coverage.assets
  .filter((a: { category: string }) => a.category === "spells")
  .map((a: { id: number }) => a.id)
  .sort((a: number, b: number) => a - b);
const report = [];
const originalRandom = Math.random;
const originalLog = console.log;
console.log = () => {};
try {
  for (const id of ids) {
    const bytes = new Uint8Array(
      await Bun.file(
        new URL(
          `apps/electrobun/public/assets/spritesheets/spells/${id}.dofasset`,
          root
        )
      ).arrayBuffer()
    );
    const compiled = readAnimations(bytes);
    const extras = readSpellExtras(bytes)!;
    const available = new Map(
      compiled.map((a) => [
        a.name,
        Array.from({ length: a.frameIds.length }, () => Texture.EMPTY),
      ])
    );
    const missing = new Set<string>();
    const requested = new Set<string>();
    const failures = new Set<string>();
    const textures: SpellTextureProvider = {
      getFrames(name) {
        requested.add(name);
        const frames = available.get(name);
        if (!frames?.length) {
          missing.add(name);
        }
        return frames ?? [];
      },
      getTexture(name) {
        const split = name.lastIndexOf("_");
        const prefix = name.slice(0, split),
          frame = Number(name.slice(split + 1));
        const texture = this.getFrames(prefix)[frame];
        if (!texture) {
          missing.add(name);
        }
        return texture ?? Texture.EMPTY;
      },
      hasTexture(name) {
        const split = name.lastIndexOf("_");
        return Boolean(
          available.get(name.slice(0, split))?.[Number(name.slice(split + 1))]
        );
      },
    };
    const module = extras.requiresTypeScript
      ? await import(`../src/game/spells/spell-${id}.ts`)
      : null;
    let cases = 0,
      longestMs = 0;
    for (const level of [1, 6]) {
      for (const direction of [-1, 1]) {
        for (const seed of [1, 123, 0xabcdef]) {
          let state = seed;
          Math.random = () => {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return state / 0x100000000;
          };
          const spell: ISpellAnimation = module
            ? new (module[`Spell${id}`] ?? module.default)()
            : new PreRenderedSpell(id, {
                textures,
                manifest: {
                  version: 1,
                  spriteId: String(id),
                  animations: extras.animations,
                  spell: {
                    id,
                    fps: extras.fps,
                    mainTimelineScale: extras.mainTimelineScale,
                    requiresTypeScript: false,
                    sounds: extras.sounds,
                    animationMeta: extras.animationMeta,
                  },
                },
              });
          const from = { cellId: 200, x: 200, y: 200, groundLevel: 7 };
          const to = {
            cellId: 290,
            x: 200 + direction * 240,
            y: 260,
            groundLevel: 7,
          };
          const context: SpellContext = {
            cellFrom: from,
            cellTo: to,
            displayType: 11,
            anchor: to,
            angle: (Math.atan2(60, direction * 240) * 180) / Math.PI,
            distance: Math.hypot(240, 60),
            level,
            casterFacingRight: direction === 1,
            parentFrame: 0,
            instanceIndex: 0,
            isCritical: false,
            caster: {
              id: 1,
              name: "audit",
              team: 0,
              hp: 100,
              maxHp: 100,
              isPlayer: true,
            },
          };
          let hits = 0,
            completions = 0,
            frame = 0;
          try {
            spell.init(
              context,
              {
                onHit: () => {
                  hits++;
                },
                onComplete: () => {
                  completions++;
                },
                playSound() {},
                onEvent() {},
              },
              textures
            );
            for (; frame < 1800 && !spell.isComplete(); frame++) {
              spell.update(1000 / 60);
            }
            if (hits !== 1 || completions !== 1 || !spell.isComplete()) {
              failures.add(
                `level=${level}, direction=${direction}, seed=${seed}: hits=${hits}, completions=${completions}, complete=${spell.isComplete()}`
              );
            }
            longestMs = Math.max(longestMs, Math.round((frame * 1000) / 60));
          } catch (error) {
            failures.add(String(error));
          } finally {
            spell.destroy();
          }
          cases++;
        }
      }
    }
    const moduleBytes = await Bun.file(
      new URL(
        module
          ? `apps/electrobun/src/game/spells/spell-${id}.ts`
          : "apps/electrobun/src/game/scene/fight/pre-rendered-spell.ts",
        root
      )
    ).arrayBuffer();
    report.push({
      id,
      sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
      moduleSha256: new Bun.CryptoHasher("sha256")
        .update(moduleBytes)
        .digest("hex"),
      animations: compiled.map((a) => ({
        name: a.name,
        frames: a.frameIds.length,
      })),
      requested: [...requested].sort(),
      missing: [...missing].sort(),
      failures: [...failures],
      cases,
      longestMs,
      visualVerified: false,
    });
  }
} finally {
  Math.random = originalRandom;
  console.log = originalLog;
}
await Bun.write(
  new URL("doc/combat/animation-audit.json", root),
  JSON.stringify({ visualVerified: false, graphics: report }, null, 2) + "\n"
);
const failed = report.filter((r) => r.missing.length || r.failures.length);
console.log(
  `${report.length} graphics, ${report.reduce((sum, r) => sum + r.cases, 0)} lifecycle cases; ${failed.length} failures`
);
for (const row of failed) {
  console.error(
    `${row.id}: missing=${row.missing.join(",")}; ${row.failures.join("; ")}`
  );
}
if (failed.length) {
  process.exitCode = 1;
}
