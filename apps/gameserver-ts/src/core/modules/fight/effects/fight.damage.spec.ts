import { describe, expect, test } from "bun:test";

import type { SpellLevel } from "@modules/fight/cast/fight.spell.types";
import type { Scope } from "@modules/fight/effects/fight.effect-registry.types";
import { Fight } from "@modules/fight/core/fight.entity";
import { Fighter } from "@modules/fight/core/fight.fighter";
import {
  applyDamageToTarget,
  calculateDamage,
  healTarget,
} from "@modules/fight/effects/fight.damage";
import {
  Characteristic,
  Element,
  FighterKind,
  FightType,
  TeamSide,
} from "@modules/fight/fight.types";
import { FightMap } from "@modules/fight/map/fight.map";
import { combatCatalog } from "@modules/spells/combat-catalog";

import { combatHarness } from "./combat-test-harness";
import { executeSpellEffects } from "./fight.effect-executor";

function makeScope(overrides: Partial<Scope> = {}): Scope {
  const caster = new Fighter(1, FighterKind.Player, "caster", 100, 6, 3, 3);
  const target = new Fighter(2, FighterKind.Monster, "target", 100, 6, 3, 3);
  const fmap = new FightMap(15, 17, [], []);
  const fight = new Fight(FightType.PvM, 1, fmap, [
    { side: TeamSide.Side0, leaderId: 1 },
    { side: TeamSide.Side1, leaderId: 2 },
  ]);
  return {
    fight,
    caster,
    target,
    targetCell: 10,
    effect: {
      id: 100,
      min: 10,
      max: 10,
      special: 0,
      duration: 0,
      probability: 100,
      areaKind: 0,
      areaSize: 0,
      targetMask: 0,
    },
    spell: {
      spellId: 1,
      level: 1,
      effects: [],
      criticalEffects: [],
      apCost: 3,
      rangeMin: 1,
      rangeMax: 5,
      criticalRate: 0,
      failureRate: 0,
      lineOfSight: true,
      emptyCell: false,
      modifiableRange: false,
      castPerTurn: 0,
      castPerTarget: 0,
      cooldown: 0,
      lineOnly: false,
      minPlayerLevel: 1,
      critFailureEndsTurn: false,
      visualGfxId: 0,
    },
    critical: false,
    emitter: {
      emitDamage() {},
      emitHeal() {},
      emitDeath() {},
      emitAPLoss() {},
      emitMPLoss() {},
      emitBuff() {},
      emitTeleport() {},
      emitTrapAdd() {},
      emitGlyphAdd() {},
      emitTrapRemove() {},
      emitGlyphRemove() {},
      emitGlyphTrigger() {},
    },
    ...overrides,
  };
}

describe("calculateDamage", () => {
  test("returns roll value with no stats", () => {
    const scope = makeScope();
    const dmg = calculateDamage(scope, Element.Neutral);
    expect(dmg).toBe(10);
  });

  test("scales with caster element stat", () => {
    const scope = makeScope();
    scope.caster.stats.setBase(Characteristic.Strength, 100);
    const dmg = calculateDamage(scope, Element.Neutral);
    expect(dmg).toBe(20);
  });

  test("applies flat resistance", () => {
    const scope = makeScope();
    scope.target?.stats.setBase(Characteristic.ResistNeutral, 5);
    const dmg = calculateDamage(scope, Element.Neutral);
    expect(dmg).toBe(5);
  });

  test("applies percent resistance", () => {
    const scope = makeScope();
    scope.target?.stats.setBase(Characteristic.ResistNeutralPct, 50);
    const dmg = calculateDamage(scope, Element.Neutral);
    expect(dmg).toBe(5);
  });

  test("caps percent resist at 50% for player targets", () => {
    const scope = makeScope();
    const target = scope.target;
    if (!target) {
      throw new Error("target missing");
    }
    target.player = {
      id: 2,
      name: "t",
      level: 1,
      life: 100,
      sex: 0,
      gfx: 10,
      direction: 3,
      stats: {
        strength: 0,
        vitality: 0,
        wisdom: 0,
        intelligence: 0,
        chance: 0,
        agility: 0,
      },
    };
    scope.target?.stats.setBase(Characteristic.ResistNeutralPct, 80);
    const dmg = calculateDamage(scope, Element.Neutral);
    expect(dmg).toBe(5);
  });

  test("never goes below zero", () => {
    const scope = makeScope();
    scope.target?.stats.setBase(Characteristic.ResistNeutral, 999);
    const dmg = calculateDamage(scope, Element.Neutral);
    expect(dmg).toBe(0);
  });
});

describe("applyDamageToTarget", () => {
  test("reduces target HP", () => {
    const scope = makeScope();
    applyDamageToTarget(scope, 30, Element.Neutral);
    expect(scope.target?.lp).toBe(70);
  });

  test("records damage on both fighters", () => {
    const scope = makeScope();
    applyDamageToTarget(scope, 20, Element.Neutral);
    expect(scope.caster.damageDealt).toBe(20);
    expect(scope.target?.damageTaken).toBe(20);
  });

  test("marks target dead at 0 HP", () => {
    const scope = makeScope();
    applyDamageToTarget(scope, 100, Element.Neutral);
    expect(scope.target?.dead).toBe(true);
  });
});

describe("healTarget", () => {
  test("heals target", () => {
    const scope = makeScope();
    scope.target?.setLp(50);
    healTarget(scope, 30);
    expect(scope.target?.lp).toBe(80);
  });

  test("does not exceed lpMax", () => {
    const scope = makeScope();
    scope.target?.setLp(90);
    healTarget(scope, 50);
    expect(scope.target?.lp).toBe(100);
  });
});

describe("absorbed hits", () => {
  // Picore (626) rank 1: 1d5 earth. A target with 5 flat earth resistance
  // absorbs every normal roll.
  function picore() {
    const h = combatHarness(3, 6);
    const base = combatCatalog.levels["3:6"];
    if (!base) {
      throw new Error("Missing fixture 3:6");
    }
    const [effect] = base.effects;
    if (!effect) {
      throw new Error("Fixture 3:6 has no effects");
    }
    const spell: SpellLevel = {
      ...base,
      spellId: 626,
      level: 1,
      effects: [{ ...effect, id: 97, min: 1, max: 5 }],
      criticalEffects: [],
    };
    h.enemy.stats.setBase(Characteristic.ResistEarth, 5);
    return { ...h, spell };
  }

  test("a hit fully absorbed by resistance is reported as 0", () => {
    const h = picore();
    executeSpellEffects(
      h.registry,
      { ...h.scope, target: h.enemy, targetCell: h.enemy.cell },
      h.spell
    );
    const damage = h.events.filter((e) => e.type === "damage");
    expect(damage).toHaveLength(1);
    expect(damage[0]?.values.slice(1, 4)).toEqual([h.caster.id, h.enemy.id, 0]);
    expect(h.enemy.lp).toBe(5000);
  });

  test("a cast on an empty cell reports nothing", () => {
    const h = picore();
    executeSpellEffects(
      h.registry,
      { ...h.scope, target: null, targetCell: 0 },
      h.spell
    );
    expect(h.events.filter((e) => e.type === "damage")).toHaveLength(0);
  });

  test("a zero life cost is not reported", () => {
    const h = picore();
    applyDamageToTarget(
      { ...h.scope, target: h.caster, cause: "life-cost" },
      0,
      Element.Neutral
    );
    expect(h.events.filter((e) => e.type === "damage")).toHaveLength(0);
  });
});
