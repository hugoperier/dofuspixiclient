import type {
  ISpellAnimation,
  SpellClip,
  SpellContext,
  SpellTextureProvider,
} from "@dofus/spell-runtime";
import { resolveAnchor } from "@dofus/spell-runtime";
import { Texture } from "pixi.js";

import {
  readAnimations,
  readSpellExtras,
} from "../../../packages/dofasset-format/src";
import { PreRenderedSpell } from "../src/game/scene/fight/pre-rendered-spell";

/**
 * Plays every visual under each displayType the canonical data gives it,
 * and reports what goes wrong. In 1.29 the displayType belongs to the
 * spell, not to the visual: `GA;300` carries it from `sorts.spriteInfos`,
 * and one gfx serves several (QA-181). The generated modules were each
 * written against one guessed value. This audit says which modules break
 * once the server's value drives them.
 *
 * Per (gfx, displayType) pair, three checks, without a GPU:
 *
 *   - translation: the cast is played twice, the second time with caster
 *     and target both shifted by OFFSET. A correctly anchored visual
 *     moves by exactly OFFSET; one that mixes world coordinates into a
 *     non-zero anchor moves by twice that, the double offset of QA-182.
 *     No distance threshold to tune, and particles cancel out because
 *     Math.random is seeded identically for both runs.
 *   - harness symbols: the projectile displayTypes need symbols the
 *     module must register (`move`/`shoot`/`duplicate`), and the module
 *     must not attach the harness's `shoot` / `move` a second time.
 *   - lifecycle: exactly one hit and one completion.
 *
 *   bun scripts/audit-spell-display-types.ts           # writes the report, ratchets
 *   bun scripts/audit-spell-display-types.ts --gfx 512 # one visual, prints details
 */

const root = new URL("../../../", import.meta.url);
const OFFSET = { x: 1000, y: 600 };
/** World px. Positions are sums of a few floats; this is rounding slack. */
const EPSILON = 0.5;
const MAX_FRAMES = 1800;

const only = (() => {
  const i = process.argv.indexOf("--gfx");
  return i >= 0 ? Number(process.argv[i + 1]) : null;
})();

// ---- canonical pairs, from the same dump migration 0068 imports ---------

interface SpellRef {
  id: number;
  name: string;
}
const pairs = new Map<
  string,
  { gfx: number; dt: number; spells: SpellRef[] }
>();
{
  const raw = await Bun.file(
    new URL("assets/sources/starloco/sorts.sql", root)
  ).text();
  const row =
    /^INSERT INTO `sorts` VALUES \((\d+),'((?:[^'\\]|\\.)*)',(-?\d+),'([^']*)'/gm;
  for (const m of raw.matchAll(row)) {
    const gfx = Number(m[3]);
    const dt = Number((m[4] ?? "").split(",")[0]);
    if (gfx <= 0 || !(dt >= 10) || (only !== null && gfx !== only)) {
      continue;
    }
    const key = `${gfx}:${dt}`;
    const pair = pairs.get(key) ?? { gfx, dt, spells: [] };
    pair.spells.push({
      id: Number(m[1]),
      name: (m[2] ?? "").replace(/\\'/g, "'"),
    });
    pairs.set(key, pair);
  }
}

// ---- one visual, loaded the way audit-spell-animations.ts loads it ------

/** Textures whose source SVG draws nothing. */
const blankFrames = new WeakSet<Texture>();
/** Texture → the animation it belongs to, to name what a clip draws. */
const textureAnimation = new WeakMap<Texture, string>();

interface Loaded {
  /** Animation names the compiled visual carries — what the SWF exported. */
  exported: ReadonlySet<string>;
  /** Source-SVG paths per animation (`d=` attributes of 30+ chars). */
  paths: ReadonlyMap<string, ReadonlySet<string>>;
  textures: SpellTextureProvider;
  create: () => ISpellAnimation;
  moduleDisplayType: number | null;
}

async function load(gfx: number): Promise<Loaded | null> {
  const file = Bun.file(
    new URL(
      `apps/electrobun/public/assets/spritesheets/spells/${gfx}.dofasset`,
      root
    )
  );
  if (!(await file.exists())) {
    return null;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let compiled: ReturnType<typeof readAnimations>;
  try {
    compiled = readAnimations(bytes);
  } catch {
    return null;
  }
  const extras = readSpellExtras(bytes);
  if (!extras) {
    return null;
  }
  // One texture per frame, so a clip's current frame can be traced back
  // to its source SVG: an authored-empty frame (Frappe's `shoot_0..2`,
  // played at the world origin by retail too before its frame_4 script
  // moves it) draws nothing and must not count as a misplaced visual.
  const svgDir = new URL(
    `tools/combat-exporter/output/spell-anims/${gfx}/`,
    root
  );
  const available = new Map<string, Texture[]>();
  // Every path an animation's source frames draw — to tell when one
  // symbol's content is already baked into another's composite.
  const paths = new Map<string, Set<string>>();
  for (const a of compiled) {
    const frames: Texture[] = [];
    const drawn = new Set<string>();
    for (let i = 0; i < a.frameIds.length; i++) {
      const texture = new Texture({ source: Texture.EMPTY.source });
      textureAnimation.set(texture, a.name);
      const svg = Bun.file(new URL(`${a.name}_${i}.svg`, svgDir));
      if (await svg.exists()) {
        const text = await svg.text();
        if (!/<(use|path|image)\b/.test(text)) {
          blankFrames.add(texture);
        }
        for (const m of text.matchAll(/ d="([^"]{30,})"/g)) {
          drawn.add(m[1] ?? "");
        }
      }
      frames.push(texture);
    }
    available.set(a.name, frames);
    paths.set(a.name, drawn);
  }
  // Mirrors VelloSpellTextureProvider.resolveSymbol (spell-asset-loader.ts).
  const resolve = (name: string): Texture[] => {
    const numbered = /^lib_sprite(\d+)$/.exec(name);
    const alt = numbered
      ? `sprite_${numbered[1]}`
      : name.startsWith("lib_")
        ? name.slice(4)
        : `lib_${name}`;
    return available.get(name) ?? available.get(alt) ?? [];
  };
  const textures: SpellTextureProvider = {
    getFrames: resolve,
    getTexture(name) {
      const split = name.lastIndexOf("_");
      return (
        resolve(name.slice(0, split))[Number(name.slice(split + 1))] ??
        Texture.EMPTY
      );
    },
    hasTexture(name) {
      const split = name.lastIndexOf("_");
      return Boolean(
        resolve(name.slice(0, split))[Number(name.slice(split + 1))]
      );
    },
  };
  if (!extras.requiresTypeScript) {
    return {
      exported: new Set(available.keys()),
      paths,
      textures,
      moduleDisplayType: null,
      create: () =>
        new PreRenderedSpell(gfx, {
          textures,
          manifest: {
            version: 1,
            spriteId: String(gfx),
            animations: extras.animations,
            spell: {
              id: gfx,
              fps: extras.fps,
              mainTimelineScale: extras.mainTimelineScale,
              requiresTypeScript: false,
              sounds: extras.sounds,
              animationMeta: extras.animationMeta,
            },
          },
        }),
    };
  }
  const module = await import(`../src/game/spells/spell-${gfx}.ts`).catch(
    () => null
  );
  const Ctor = module?.[`Spell${gfx}`] ?? module?.default;
  if (!Ctor) {
    return null;
  }
  const probe = new Ctor() as { displayType?: number; destroy(): void };
  const moduleDisplayType = probe.displayType ?? null;
  probe.destroy();
  return {
    exported: new Set(available.keys()),
    paths,
    textures,
    moduleDisplayType,
    create: () => new Ctor(),
  };
}

// ---- one run -------------------------------------------------------------

interface Run {
  /** Per frame: visible clip path → world position. */
  frames: Map<string, { x: number; y: number }>[];
  hits: number;
  completions: number;
  complete: boolean;
  missingSymbols: string[];
  duplicateSymbols: string[];
  /** World px between the harness's `shoot` and the target, when one shows. */
  shootOffTarget: number | null;
  /** Per frame, the animations some clip put on screen. */
  drawnAnimations: Set<string>[];
  error: string | null;
}

const HARNESS_SYMBOLS: Record<
  number,
  { needs: string[]; atInit: Record<string, number> }
> = {
  20: { needs: ["shoot"], atInit: { shoot: 1 } },
  21: { needs: ["shoot"], atInit: { shoot: 1 } },
  30: { needs: ["move", "shoot"], atInit: { move: 1, shoot: 0 } },
  31: { needs: ["move", "shoot"], atInit: { move: 1, shoot: 0 } },
  40: { needs: ["duplicate"], atInit: { shoot: 0 } },
  41: { needs: ["duplicate", "shoot"], atInit: { shoot: 0 } },
};

function clipRoot(spell: ISpellAnimation): SpellClip | null {
  return (spell as unknown as { root?: SpellClip }).root ?? null;
}

/** Whether a clip puts pixels on screen this frame. */
function draws(clip: SpellClip): boolean {
  if (
    !clip.sprite ||
    clip.container.destroyed ||
    blankFrames.has(clip.sprite.texture)
  ) {
    return false;
  }
  for (let c: SpellClip | null = clip; c; c = c.parent) {
    if (!c.visible || c.alpha <= 0) {
      return false;
    }
  }
  return true;
}

function* walk(clip: SpellClip, path: string): Generator<[string, SpellClip]> {
  yield [path, clip];
  for (const [name, child] of clip.children) {
    yield* walk(child, `${path}/${name}`);
  }
}

function play(
  loaded: Loaded,
  dt: number,
  shift: { x: number; y: number },
  direction: 1 | -1,
  seed: number
): Run {
  let state = seed;
  const random = Math.random;
  Math.random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const from = {
    cellId: 200,
    x: 200 + shift.x,
    y: 200 + shift.y,
    groundLevel: 7,
  };
  const to = {
    cellId: 290,
    x: 200 + direction * 240 + shift.x,
    y: 260 + shift.y,
    groundLevel: 7,
  };
  const anchor = resolveAnchor(dt, from, to);
  const context: SpellContext = {
    cellFrom: from,
    cellTo: to,
    displayType: dt,
    anchor,
    angle: (Math.atan2(60, direction * 240) * 180) / Math.PI,
    distance: Math.hypot(240, 60),
    level: 6,
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
  const run: Run = {
    frames: [],
    hits: 0,
    completions: 0,
    complete: false,
    missingSymbols: [],
    duplicateSymbols: [],
    shootOffTarget: null,
    drawnAnimations: [],
    error: null,
  };
  const spell = loaded.create();
  try {
    spell.init(
      context,
      {
        onHit: () => {
          run.hits++;
        },
        onComplete: () => {
          run.completions++;
        },
        playSound() {},
        onEvent() {},
      },
      loaded.textures
    );
    // spell-view.ts: the container sits on the anchor.
    spell.container.position.set(anchor.x, anchor.y);
    const tree = clipRoot(spell);
    const harness = HARNESS_SYMBOLS[dt];
    if (tree && harness) {
      const registry = (
        spell as unknown as {
          registry: { resolve(name: string): unknown };
        }
      ).registry;
      // Only what the SWF has: VisualEffectHandler's attachMovie of a
      // symbol the SWF lacks is a no-op in 1.29 too (Iop's 806 has no
      // `shoot` and plays its rotated main timeline alone).
      const exported = (name: string) =>
        loaded.exported.has(name) || loaded.exported.has(`lib_${name}`);
      run.missingSymbols = harness.needs.filter(
        (s) => exported(s) && !registry.resolve(s)
      );
      for (const [symbol, expected] of Object.entries(harness.atInit)) {
        const attached = [...tree.children.values()].filter(
          (c) => c.symbolName === symbol
        ).length;
        if (attached > expected) {
          run.duplicateSymbols.push(symbol);
        }
      }
    }
    for (let frame = 0; frame < MAX_FRAMES && !spell.isComplete(); frame++) {
      spell.update(1000 / 60);
      const positions = new Map<string, { x: number; y: number }>();
      const drawnNow = new Set<string>();
      if (tree && !spell.container.destroyed) {
        for (const [path, clip] of walk(tree, "root")) {
          if (draws(clip)) {
            const p = clip.container.getGlobalPosition();
            positions.set(path, { x: p.x, y: p.y });
            const animation = clip.sprite
              ? textureAnimation.get(clip.sprite.texture)
              : undefined;
            if (animation) {
              drawnNow.add(animation);
            }
          }
        }
      }
      run.frames.push(positions);
      run.drawnAnimations.push(drawnNow);
      // Under a projectile displayType the harness owns `shoot` and lands
      // it on the target (VisualEffectHandler.as). A module that attaches
      // its own under the same name replaces it wherever it likes — Iop's
      // 809 put it on the caster.
      const shoot = harness ? tree?.children.get("shoot") : undefined;
      if (shoot && run.shootOffTarget === null && !shoot.container.destroyed) {
        const p = shoot.container.getGlobalPosition();
        run.shootOffTarget =
          Math.round(Math.hypot(p.x - to.x, p.y - to.y) * 10) / 10;
      }
    }
    run.complete = spell.isComplete();
  } catch (error) {
    run.error = String(error);
  } finally {
    spell.destroy();
    Math.random = random;
  }
  return run;
}

/** Largest deviation from a pure translation by OFFSET, and where. */
function translationError(
  a: Run,
  b: Run
): { error: number; at: string | null } {
  let worst = 0;
  let at: string | null = null;
  const frames = Math.min(a.frames.length, b.frames.length);
  for (let f = 0; f < frames; f++) {
    const fa = a.frames[f];
    const fb = b.frames[f];
    if (!fa || !fb) {
      continue;
    }
    for (const [path, pa] of fa) {
      const pb = fb.get(path);
      if (!pb) {
        continue;
      }
      const e = Math.hypot(pb.x - pa.x - OFFSET.x, pb.y - pa.y - OFFSET.y);
      if (e > worst) {
        worst = e;
        at = `${path} @${f}`;
      }
    }
  }
  return { error: Math.round(worst * 10) / 10, at };
}

// ---- sweep ---------------------------------------------------------------

interface Row {
  gfx: number;
  displayType: number;
  /**
   * `canonical`: a displayType sorts.spriteInfos gives this visual — what
   * the server sends. `module`: the module's own value, which the client
   * falls back on for a canonical pair this audit flags.
   */
  source: "canonical" | "module";
  moduleDisplayType: number | null;
  spells: SpellRef[];
  translationError: number;
  translationAt: string | null;
  missingSymbols: string[];
  duplicateSymbols: string[];
  shootOffTarget: number | null;
  /**
   * `sprite_N` drawn on its own although every path of it is already in
   * another drawn composite: a timeline child baked into its parent and
   * attached again (Horloge's hand, QA-183). A `sprite_N` has no linkage
   * name, so no `attachMovie` can ask for it — the module made it up.
   */
  doubleDrawn: string[];
  lifecycle: string[];
}

function audit(
  loaded: Loaded,
  gfx: number,
  dt: number,
  source: Row["source"],
  spells: SpellRef[]
): Row {
  const row: Row = {
    gfx,
    displayType: dt,
    source,
    moduleDisplayType: loaded.moduleDisplayType,
    spells,
    translationError: 0,
    translationAt: null,
    missingSymbols: [],
    duplicateSymbols: [],
    shootOffTarget: null,
    doubleDrawn: [],
    lifecycle: [],
  };
  for (const direction of [1, -1] as const) {
    const a = play(loaded, dt, { x: 0, y: 0 }, direction, 123);
    const b = play(loaded, dt, OFFSET, direction, 123);
    const t = translationError(a, b);
    if (t.error > row.translationError) {
      row.translationError = t.error;
      row.translationAt = t.at;
    }
    row.missingSymbols = [
      ...new Set([...row.missingSymbols, ...a.missingSymbols]),
    ];
    row.duplicateSymbols = [
      ...new Set([...row.duplicateSymbols, ...a.duplicateSymbols]),
    ];
    row.doubleDrawn = [
      ...new Set([
        ...row.doubleDrawn,
        ...doubleDrawn(loaded, a.drawnAnimations),
      ]),
    ];
    if (a.shootOffTarget !== null) {
      row.shootOffTarget = Math.max(row.shootOffTarget ?? 0, a.shootOffTarget);
    }
    if (a.error) {
      row.lifecycle.push(`direction=${direction}: ${a.error}`);
    } else if (a.hits !== 1 || a.completions !== 1 || !a.complete) {
      row.lifecycle.push(
        `direction=${direction}: hits=${a.hits}, completions=${a.completions}, complete=${a.complete}`
      );
    }
  }
  return row;
}

/** Below this many paths a shared shape is too likely a coincidence. */
const MIN_BAKED_PATHS = 3;
/** Share of A's visible frames that B must be on screen for too. */
const CO_VISIBLE = 0.9;

function doubleDrawn(loaded: Loaded, frames: readonly Set<string>[]): string[] {
  const shown = new Map<string, number>();
  for (const frame of frames) {
    for (const a of frame) {
      shown.set(a, (shown.get(a) ?? 0) + 1);
    }
  }
  const out: string[] = [];
  for (const [a, count] of shown) {
    const own = loaded.paths.get(a);
    if (!/^sprite_\d+$/.test(a) || !own || own.size < MIN_BAKED_PATHS) {
      continue;
    }
    for (const b of shown.keys()) {
      const other = loaded.paths.get(b);
      if (b === a || !other || other.size <= own.size) {
        continue;
      }
      if (![...own].every((d) => other.has(d))) {
        continue;
      }
      const together = frames.filter((f) => f.has(a) && f.has(b)).length;
      if (together >= CO_VISIBLE * count) {
        out.push(`${a} ⊂ ${b}`);
        break;
      }
    }
  }
  return out;
}

/** `shoot` farther than this from the target is not the harness's landing. */
const SHOOT_SLACK = 2;
const shootMisplaced = (r: Row): boolean =>
  (r.shootOffTarget ?? 0) > SHOOT_SLACK;
const isFlagged = (r: Row): boolean =>
  r.translationError > EPSILON ||
  shootMisplaced(r) ||
  r.missingSymbols.length > 0 ||
  r.duplicateSymbols.length > 0 ||
  r.lifecycle.length > 0;

const report: Row[] = [];
const skipped: number[] = [];
const originalLog = console.log;
const originalWarn = console.warn;
console.log = () => {};
console.warn = () => {};
try {
  const byGfx = new Map<number, { dt: number; spells: SpellRef[] }[]>();
  for (const pair of pairs.values()) {
    byGfx.set(pair.gfx, [...(byGfx.get(pair.gfx) ?? []), pair]);
  }
  for (const [gfx, gfxPairs] of [...byGfx].sort((a, b) => a[0] - b[0])) {
    const loaded = await load(gfx);
    if (!loaded) {
      skipped.push(gfx);
      continue;
    }
    for (const pair of gfxPairs.sort((a, b) => a.dt - b.dt)) {
      report.push(audit(loaded, gfx, pair.dt, "canonical", pair.spells));
    }
    const own = loaded.moduleDisplayType;
    if (own !== null && !gfxPairs.some((p) => p.dt === own)) {
      report.push(audit(loaded, gfx, own, "module", []));
    }
  }
} finally {
  console.log = originalLog;
  console.warn = originalWarn;
}

const canonical = report.filter((r) => r.source === "canonical");
const fallbacks = canonical.filter(isFlagged);
// What the player sees for a fallback pair: the module under its own
// displayType. Flagged here means broken whichever value drives it.
const brokenFallbacks = fallbacks.filter((f) => {
  const own = report.find(
    (r) => r.gfx === f.gfx && r.displayType === f.moduleDisplayType
  );
  return f.moduleDisplayType === null || !own || isFlagged(own);
});
// Baked-and-redrawn symbols, per visual, whatever displayType drives it —
// a defect of the module, not of its anchoring, so it never decides a
// fallback; it has its own count and ratchet.
const doubleDrawnByGfx = new Map<number, Set<string>>();
for (const r of report) {
  for (const d of r.doubleDrawn) {
    doubleDrawnByGfx.set(
      r.gfx,
      (doubleDrawnByGfx.get(r.gfx) ?? new Set()).add(d)
    );
  }
}
const current = {
  doubleDrawnGraphics: doubleDrawnByGfx.size,
  fallbackPairs: fallbacks.length,
  brokenFallbacks: brokenFallbacks.length,
  offsetPairs: canonical.filter((r) => r.translationError > EPSILON).length,
  symbolPairs: canonical.filter(
    (r) =>
      r.missingSymbols.length || r.duplicateSymbols.length || shootMisplaced(r)
  ).length,
  lifecyclePairs: canonical.filter((r) => r.lifecycle.length).length,
};

function why(r: Row): string {
  return [
    r.translationError > EPSILON
      ? `décalé de ${r.translationError}px (${r.translationAt})`
      : "",
    r.missingSymbols.length ? `manque ${r.missingSymbols.join(",")}` : "",
    r.duplicateSymbols.length
      ? `${r.duplicateSymbols.join(",")} en double`
      : "",
    shootMisplaced(r) ? `shoot à ${r.shootOffTarget}px de la cible` : "",
    ...r.lifecycle,
  ]
    .filter(Boolean)
    .join("; ");
}

if (only !== null) {
  console.log(JSON.stringify(report, null, 2));
} else {
  await Bun.write(
    new URL("doc/combat/display-type-audit.json", root),
    `${JSON.stringify(
      {
        _doc:
          "bun apps/electrobun/scripts/audit-spell-display-types.ts — every visual " +
          "played under each canonical displayType of sorts.spriteInfos (QA-181), " +
          "and under the module's own one. translationError: px a visual strays " +
          "from a pure translation of the cast (QA-182).",
        ...current,
        skippedGraphics: skipped,
        flagged: report.filter(isFlagged),
        doubleDrawn: Object.fromEntries(
          [...doubleDrawnByGfx].map(([gfx, set]) => [gfx, [...set].sort()])
        ),
      },
      null,
      2
    )}\n`
  );
  // The client honours the server's displayType except for these pairs,
  // where the module was written against another value and breaks under
  // the canonical one. Each fix to a module shrinks this list on the next
  // run — the server's value then takes over by itself.
  await Bun.write(
    new URL(
      "apps/electrobun/src/game/scene/fight/display-type-fallbacks.json",
      root
    ),
    `${JSON.stringify(
      {
        _doc:
          "GENERATED by apps/electrobun/scripts/audit-spell-display-types.ts — do not " +
          'edit. "gfx:displayType" pairs whose module breaks under the server\'s ' +
          "canonical displayType; spell-view keeps the module's own value for them. " +
          "See QA-181 and doc/combat/display-type-audit.json.",
        pairs: fallbacks.map((r) => `${r.gfx}:${r.displayType}`),
      },
      null,
      2
    )}\n`
  );
}

console.log(
  `${canonical.length} couples canoniques (gfx, displayType), ` +
    `${skipped.length} visuels sans asset ni module\n` +
    `  ancrage décalé (translation)   : ${current.offsetPairs}\n` +
    `  symboles du harness            : ${current.symbolPairs}\n` +
    `  cycle de vie (impact / fin)    : ${current.lifecyclePairs}\n` +
    `  → repli sur le displayType du module : ${current.fallbackPairs}, ` +
    `dont ${current.brokenFallbacks} cassés aussi sous ce repli\n` +
    `  symbole incrusté redessiné      : ${current.doubleDrawnGraphics} visuels`
);
for (const r of fallbacks) {
  const own = report.find(
    (o) => o.gfx === r.gfx && o.displayType === r.moduleDisplayType
  );
  const fallbackNote =
    own && isFlagged(own) ? ` | sous ${own.displayType} : ${why(own)}` : "";
  console.error(
    `${r.gfx} dt=${r.displayType} (module ${r.moduleDisplayType ?? "—"}) ` +
      `[${r.spells.map((s) => s.id).join(",")}]: ${why(r)}${fallbackNote}`
  );
}

if (only === null) {
  // Ratchet, like spell-symbol-baseline.json: counts may only go down.
  const baselineUrl = new URL("doc/combat/display-type-baseline.json", root);
  const baselineFile = Bun.file(baselineUrl);
  if (!(await baselineFile.exists())) {
    await Bun.write(
      baselineUrl,
      `${JSON.stringify(
        {
          _doc:
            "Ratchet for audit-spell-display-types.ts (`just spells-coverage`). " +
            "Lower these as modules are fixed; never raise them. See QA-181.",
          ...current,
        },
        null,
        2
      )}\n`
    );
    console.log(`baseline written: ${JSON.stringify(current)}`);
  } else {
    const baseline = await baselineFile.json();
    const keys = Object.keys(current) as (keyof typeof current)[];
    const worse = keys.filter((k) => current[k] > (baseline[k] ?? 0));
    const better = keys.filter((k) => current[k] < (baseline[k] ?? 0));
    if (worse.length) {
      console.error(
        `REGRESSION sur ${worse.join(", ")} — actuel ${JSON.stringify(current)}`
      );
      process.exitCode = 1;
    } else if (better.length) {
      console.log(
        `Progrès sur ${better.join(", ")} — mets à jour ` +
          `doc/combat/display-type-baseline.json avec ${JSON.stringify(current)}`
      );
    }
  }
}
