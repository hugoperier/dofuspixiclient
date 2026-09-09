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
// --all-graphics widens the sweep from the class-catalogue graphics
// (what spell-coverage.json lists) to every published .dofasset. The
// narrow default is what let 113 broken spells sit behind a "68
// graphiques" figure for so long.
const allGraphics = process.argv.includes("--all-graphics");
const spellsDir = Bun.fileURLToPath(
  new URL("apps/electrobun/public/assets/spritesheets/spells/", root)
);
const ids: number[] = allGraphics
  ? (await Array.fromAsync(new Bun.Glob("*.dofasset").scan({ cwd: spellsDir })))
      .map((file) => Number(file.replace(".dofasset", "")))
      .filter((id) => Number.isFinite(id))
      .sort((a, b) => a - b)
  : (
      await Bun.file(new URL("doc/combat/spell-coverage.json", root)).json()
    ).assets
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
    // A corrupt frame table must not abort the whole sweep — record it
    // against the spell and move on, otherwise one bad asset hides the
    // state of every spell after it.
    let compiled: ReturnType<typeof readAnimations>;
    try {
      compiled = readAnimations(bytes);
    } catch (error) {
      report.push({
        id,
        sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
        moduleSha256: "",
        animations: [],
        requested: [],
        aliased: [],
        missing: [],
        failures: [`readAnimations: ${String(error)}`],
        cases: 0,
        longestMs: 0,
        visualVerified: false,
      });
      continue;
    }
    const extras = readSpellExtras(bytes)!;
    const available = new Map(
      compiled.map((a) => [
        a.name,
        Array.from({ length: a.frameIds.length }, () => Texture.EMPTY),
      ])
    );
    const missing = new Set<string>();
    const aliased = new Set<string>();
    const requested = new Set<string>();
    const failures = new Set<string>();
    // Mirrors VelloSpellTextureProvider.resolveSymbol — the audit must
    // judge modules by what the runtime actually resolves, or it flags
    // spells that render fine.
    const resolveSymbol = (name: string): string | null => {
      if (available.has(name)) {
        return name;
      }
      const numbered = /^lib_sprite(\d+)$/.exec(name);
      const alt = numbered
        ? `sprite_${numbered[1]}`
        : name.startsWith("lib_")
          ? name.slice(4)
          : `lib_${name}`;
      return available.has(alt) ? alt : null;
    };
    const textures: SpellTextureProvider = {
      getFrames(name) {
        requested.add(name);
        const key = resolveSymbol(name);
        if (key === null) {
          missing.add(name);
          return [];
        }
        if (key !== name) {
          aliased.add(`${name}->${key}`);
        }
        const frames = available.get(key);
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
        const key = resolveSymbol(name.slice(0, split));
        return Boolean(
          key && available.get(key)?.[Number(name.slice(split + 1))]
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
      aliased: [...aliased].sort(),
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
// The narrow sweep still owns animation-audit.json so the published
// combat docs keep their shape; --all-graphics writes its own file.
await Bun.write(
  new URL(
    allGraphics
      ? "doc/combat/animation-audit-all.json"
      : "doc/combat/animation-audit.json",
    root
  ),
  JSON.stringify({ visualVerified: false, graphics: report }, null, 2) + "\n"
);
const failed = report.filter((r) => r.missing.length || r.failures.length);
// Three distinct defects, tracked apart because they have three
// different fixes:
//   symboles absents  — the module asks for a sprite the exporter never
//                       emitted (step C: dynamic-symbol re-export)
//   tables illisibles — the compiled animation table is empty/corrupt
//                       (re-compile the .dofasset)
//   alias             — resolved at runtime through the lib_/sprite_
//                       alias; informational, shows what step B carries
const symbolSpells = report.filter((r) => r.missing.length);
const unreadable = report.filter((r) =>
  r.failures.some((f: string) => f.startsWith("readAnimations:"))
);
const missingRefs = report.reduce((sum, r) => sum + r.missing.length, 0);
const aliasedRefs = report.reduce((sum, r) => sum + r.aliased.length, 0);
console.log(
  `${report.length} graphics, ${report.reduce((sum, r) => sum + r.cases, 0)} lifecycle cases\n` +
    `  symboles absents : ${symbolSpells.length} sorts / ${missingRefs} refs\n` +
    `  tables illisibles: ${unreadable.length} sorts\n` +
    `  via alias lib_/sprite_: ${aliasedRefs} refs`
);
for (const row of failed) {
  console.error(
    `${row.id}: missing=${row.missing.join(",")}; ${row.failures.join("; ")}`
  );
}

if (!allGraphics) {
  if (failed.length) {
    process.exitCode = 1;
  }
} else {
  // Ratchet: the full sweep starts from a known-bad baseline (the
  // symbols step C still has to re-export) and must never grow.
  const baselineFile = Bun.file(
    new URL("doc/combat/spell-symbol-baseline.json", root)
  );
  const baseline = (await baselineFile.exists())
    ? await baselineFile.json()
    : null;
  const current = {
    symbolSpells: symbolSpells.length,
    refs: missingRefs,
    unreadable: unreadable.length,
  };
  if (!baseline) {
    await Bun.write(
      new URL("doc/combat/spell-symbol-baseline.json", root),
      `${JSON.stringify(
        {
          _doc:
            "Ratchet for `just spells-coverage`. Lower these as spells are " +
            "re-exported; never raise them. See doc/combat/asset-reconstruction.md.",
          ...current,
        },
        null,
        2
      )}\n`
    );
    console.log(`baseline written: ${JSON.stringify(current)}`);
  } else {
    const keys = ["symbolSpells", "refs", "unreadable"] as const;
    const worse = keys.filter((key) => current[key] > (baseline[key] ?? 0));
    const better = keys.filter((key) => current[key] < (baseline[key] ?? 0));
    if (worse.length) {
      console.error(
        `REGRESSION sur ${worse.join(", ")} — actuel ${JSON.stringify(current)}`
      );
      process.exitCode = 1;
    } else if (better.length) {
      console.log(
        `Progrès sur ${better.join(", ")} — mets à jour ` +
          `doc/combat/spell-symbol-baseline.json avec ${JSON.stringify(current)}`
      );
    }
  }
}
