import { describe, expect, test } from "bun:test";

import { Texture } from "pixi.js";

import type {
  SpellCallbacks,
  SpellContext,
  SpellTextureProvider,
} from "../spell-interface.ts";
import type { SpellClip } from "./clip.ts";
import { SpellDisplayType } from "../spell-interface.ts";
import { resolveAnchor } from "./harness.ts";
import { RuntimeSpell } from "./runtime-spell.ts";

const CASTER = { x: 100, y: 40 };
const TARGET = { x: 160, y: 70 };

/**
 * The shape every generated module translates `_X = _parent.cellTo.x`
 * into (spell-512 sprite_42 frame_1): a child that moves itself onto
 * `root.vars.cellTo` on load. Declares TargetCell, as most generated
 * modules do whatever the canonical value is.
 */
class LiteralCellToSpell extends RuntimeSpell {
  readonly spellId = 9999;
  readonly displayType = SpellDisplayType.TargetCell;
  child: SpellClip | null = null;

  protected registerSymbols(): void {
    this.registry.register({
      name: "effect",
      totalFrames: 1,
      frames: [],
      anchorX: 0.5,
      anchorY: 0.5,
      onLoad: (clip) => {
        const cellTo = clip.parent?.vars.cellTo as { x: number; y: number };
        clip.x = cellTo.x;
        clip.y = cellTo.y;
      },
    });
    // The canonical projectile symbol, so the harness has something to
    // attach when it is configured as a ballistic projectile.
    this.registry.register({
      name: "move",
      totalFrames: 2,
      frames: [],
      anchorX: 0.5,
      anchorY: 0.5,
    });
  }

  protected onSpellStart(_callbacks: SpellCallbacks, ctx: SpellContext): void {
    const sym = this.registry.resolve("effect");
    if (sym) {
      this.child = this.root.attach(sym, "effect", 1, ctx);
    }
  }
}

function context(displayType: number): SpellContext {
  const anchor = resolveAnchor(displayType, CASTER, TARGET);
  return {
    cellFrom: { cellId: 1, ...CASTER, groundLevel: 7 },
    cellTo: { cellId: 2, ...TARGET, groundLevel: 7 },
    displayType,
    anchor,
    angle: 0,
    distance: 0,
    level: 1,
    caster: { id: 1, name: "", team: 0, hp: 0, maxHp: 0, isPlayer: true },
    casterFacingRight: true,
    parentFrame: 0,
    instanceIndex: 0,
    isCritical: false,
  };
}

const callbacks: SpellCallbacks = {
  playSound: () => {},
  onComplete: () => {},
  onHit: () => {},
  onEvent: () => {},
};

const textures: SpellTextureProvider = {
  getTexture: () => Texture.EMPTY,
  hasTexture: () => false,
  getFrames: () => [],
};

/** The protected root clip, for assertions. */
function rootOf(spell: LiteralCellToSpell): SpellClip {
  return (spell as unknown as { root: SpellClip }).root;
}

/** Init the spell the way spell-view does, and return the child's world position. */
function play(displayType: number) {
  const spell = new LiteralCellToSpell();
  const ctx = context(displayType);
  spell.init(ctx, callbacks, textures);
  // spell-view: `spell.container.position.set(context.anchor.x, …)`.
  spell.container.position.set(ctx.anchor.x, ctx.anchor.y);
  const child = spell.child;
  if (!child) {
    throw new Error("effect clip not attached");
  }
  return {
    spell,
    world: { x: ctx.anchor.x + child.x, y: ctx.anchor.y + child.y },
  };
}

describe("root.vars.cellFrom / cellTo live in the container's space", () => {
  test("under TargetCell, cellTo is the container origin", () => {
    const { spell } = play(SpellDisplayType.TargetCell);
    const vars = rootOf(spell).vars;
    expect(vars.cellTo).toEqual({ x: 0, y: 0 });
    expect(vars.cellFrom).toEqual({
      x: CASTER.x - TARGET.x,
      y: CASTER.y - TARGET.y,
    });
    spell.destroy();
  });

  // QA-182: a literal `_X = _parent.cellTo.x` must land on the target in
  // the world under every anchor — it used to land on anchor + target.
  for (const displayType of [
    SpellDisplayType.CasterCell,
    SpellDisplayType.TargetCell,
    SpellDisplayType.WorldAbsolute,
    SpellDisplayType.WorldAbsoluteAlt,
  ]) {
    test(`a literal cellTo placement lands on the target under ${displayType}`, () => {
      const { spell, world } = play(displayType);
      expect(world).toEqual(TARGET);
      spell.destroy();
    });
  }
});

describe("RuntimeSpell configures its harness from the context", () => {
  // QA-181: the server's displayType wins over the module's declaration.
  test("a ballistic context attaches `move` to a TargetCell module", () => {
    const { spell } = play(SpellDisplayType.ProjectileBallistic);
    expect(rootOf(spell).children.has("move")).toBe(true);
    spell.destroy();
  });

  test("a target context leaves the root without projectile", () => {
    const { spell } = play(SpellDisplayType.TargetCell);
    expect(rootOf(spell).children.has("move")).toBe(false);
    spell.destroy();
  });
});

/** A module that only registers the harness-owned symbols it is given. */
class HarnessOwnedSpell extends RuntimeSpell {
  readonly spellId = 9998;
  readonly displayType = SpellDisplayType.TargetCell;
  hits = 0;

  constructor(private readonly symbols: string[]) {
    super();
  }

  protected registerSymbols(): void {
    for (const name of this.symbols) {
      this.registry.register({
        name,
        totalFrames: 10,
        frames: [],
        anchorX: 0.5,
        anchorY: 0.5,
      });
    }
  }
}

function launch(symbols: string[], displayType: number, to = TARGET) {
  const spell = new HarnessOwnedSpell(symbols);
  const ctx = context(displayType);
  ctx.cellTo = { ...ctx.cellTo, ...to };
  ctx.anchor = resolveAnchor(displayType, CASTER, to);
  spell.init(ctx, { ...callbacks, onHit: () => spell.hits++ }, textures);
  spell.container.position.set(ctx.anchor.x, ctx.anchor.y);
  return spell;
}

describe("projectile harness follows VisualEffectHandler.as", () => {
  // QA-181: 1.29 turns only `mc.rotate`; `shoot` sits on `mc`, unturned,
  // on the target.
  for (const displayType of [
    SpellDisplayType.ProjectileLinear,
    SpellDisplayType.ProjectileLinearAlt,
  ]) {
    test(`shoot lands unturned on the target under ${displayType}`, () => {
      const spell = launch(["shoot"], displayType);
      const shoot = rootOf(spell).children.get("shoot");
      if (!shoot) {
        throw new Error("harness did not attach shoot");
      }
      const p = shoot.container.getGlobalPosition();
      expect(p.x).toBeCloseTo(TARGET.x, 6);
      expect(p.y).toBeCloseTo(TARGET.y, 6);
      expect(shoot.rotation + rootOf(spell).rotation).toBeCloseTo(0, 9);
      spell.destroy();
    });
  }

  test("under 21, cellTo is straight ahead in the turned root", () => {
    const spell = launch([], SpellDisplayType.ProjectileLinearAlt);
    const d = Math.hypot(TARGET.x - CASTER.x, TARGET.y - CASTER.y);
    expect(rootOf(spell).vars.cellTo).toEqual({ x: d, y: 0 });
    expect(rootOf(spell).vars.cellFrom).toEqual({ x: 0, y: 0 });
    spell.destroy();
  });

  // Désinvocation (gfx 1100, canon 31) has no `move`: 1.29's arc still
  // runs and lands.
  test("a ballistic arc without `move` still lands and signals the hit", () => {
    const spell = launch(["shoot"], SpellDisplayType.ProjectileBallisticAlt);
    for (let i = 0; i < 600 && spell.hits === 0; i++) {
      spell.update(1000 / 60);
    }
    expect(spell.hits).toBe(1);
    const shoot = rootOf(spell).children.get("shoot");
    const p = shoot?.container.getGlobalPosition();
    expect(p?.x).toBeCloseTo(TARGET.x, 0);
    expect(p?.y).toBeCloseTo(TARGET.y, 0);
    spell.destroy();
  });

  test("a beam cast on the caster's own cell ends at once", () => {
    const spell = launch(["duplicate"], SpellDisplayType.BeamLine, CASTER);
    for (let i = 0; i < 10 && spell.hits === 0; i++) {
      spell.update(1000 / 60);
    }
    expect(spell.hits).toBe(1);
    spell.destroy();
  });
});
