import { describe, expect, it } from "bun:test";

import type { SpellLevel } from "@modules/fight/cast/fight.spell.types";
import type { WeaponInfo } from "@modules/inventory/weapon-info";
import { buildCloseCombatSpell } from "@modules/fight/cast/fight.close-combat";

/** `spell_levels(0, 1)` as migration 0039 seeds it: the bare-handed punch. */
const PUNCH = {
  spellId: 0,
  level: 1,
  apCost: 4,
  rangeMin: 1,
  rangeMax: 1,
  criticalRate: 50,
  failureRate: 20,
  lineOfSight: true,
  emptyCell: false,
  modifiableRange: false,
  castPerTurn: 0,
  castPerTarget: 0,
  cooldown: 0,
  lineOnly: false,
  visualGfxId: 0,
  minPlayerLevel: 0,
  critFailureEndsTurn: false,
  effects: [
    {
      id: 100,
      min: 1,
      max: 5,
      special: 0,
      duration: 0,
      probability: 0,
      areaKind: 0,
      areaSize: 0,
      targetMask: 0,
    },
  ],
  criticalEffects: [],
} as unknown as SpellLevel;

/** 88 — Petit Arc de Boisaille, as `weapon-info` parses it. */
const BOW: WeaponInfo = {
  apCost: 4,
  rangeMin: 2,
  rangeMax: 6,
  criticalRate: 30,
  failureRate: 50,
  criticalBonus: 5,
  lineOnly: false,
  lineOfSight: true,
};

/** Its `itemstats` block: `64#1#4#1d4+0` damage, `7d#1##0d0+1` +1 Chance. */
const BOW_EFFECTS = [
  { id: 100, param1: 1, param2: 4, param3: "1d4+0" },
  { id: 125, param1: 1, param2: 0, param3: "0d0+1" },
];

describe("buildCloseCombatSpell", () => {
  it("is the punch itself when the player holds nothing", () => {
    expect(buildCloseCombatSpell(PUNCH)).toBe(PUNCH);
  });

  it("takes cost, range and criticals from the weapon", () => {
    const swing = buildCloseCombatSpell(PUNCH, {
      info: BOW,
      effects: BOW_EFFECTS,
    });

    expect(swing.apCost).toBe(4);
    expect(swing.rangeMin).toBe(2);
    expect(swing.rangeMax).toBe(6);
    expect(swing.criticalRate).toBe(30);
    expect(swing.failureRate).toBe(50);
    expect(swing.lineOfSight).toBe(true);
    // Portée bonuses do not reach a weapon: `canBoostRange` is false.
    expect(swing.modifiableRange).toBe(false);
    // A weapon has no per-turn cap in 1.29.
    expect(swing.castPerTurn).toBe(0);
  });

  // The load-bearing one: an item's effect list mixes what the swing
  // inflicts with what wearing it grants. Replaying "+1 Chance" as a
  // cast effect would hand the bonus to whoever got shot.
  it("swings the damage and leaves the gear bonus behind", () => {
    const swing = buildCloseCombatSpell(PUNCH, {
      info: BOW,
      effects: BOW_EFFECTS,
    });

    expect(swing.effects).toHaveLength(1);
    expect(swing.effects[0]).toMatchObject({ id: 100, min: 1, max: 4 });
  });

  // A weapon lands on whoever is standing there. The seeded punch row
  // carries mask 7 for exactly this reason.
  it("lets the swing reach an ally", () => {
    const swing = buildCloseCombatSpell(PUNCH, {
      info: BOW,
      effects: BOW_EFFECTS,
    });

    expect(swing.effects[0]?.targetMask).toBe(7);
  });

  it("adds the critical bonus to every effect of the swing", () => {
    const swing = buildCloseCombatSpell(PUNCH, {
      info: BOW,
      effects: BOW_EFFECTS,
    });

    expect(swing.criticalEffects).toHaveLength(1);
    expect(swing.criticalEffects[0]).toMatchObject({ min: 6, max: 9 });
  });

  // `rollEffect` rolls the dice, then clamps to `[min, max]`. Raising
  // the bounds without moving the formula leaves a 1..4 roll clamped
  // into 6..9 — every critical lands on 6. The formula has to move too.
  it("moves the dice formula with the bounds, not just the bounds", () => {
    const swing = buildCloseCombatSpell(PUNCH, {
      info: BOW,
      effects: BOW_EFFECTS,
    });

    expect(swing.effects[0]?.dice).toBe("1d4+0");
    expect(swing.criticalEffects[0]?.dice).toBe("1d4+5");
  });

  it("leaves a formula it cannot read alone", () => {
    const swing = buildCloseCombatSpell(PUNCH, {
      info: BOW,
      effects: [{ id: 100, param1: 1, param2: 4, param3: "" }],
    });

    expect(swing.criticalEffects[0]?.dice).toBe("");
  });

  it("refuses a weapon whose whole effect list is gear statistics", () => {
    const swing = buildCloseCombatSpell(PUNCH, {
      info: BOW,
      effects: [{ id: 125, param1: 1, param2: 0, param3: "" }],
    });

    expect(swing.effects).toEqual([]);
    expect(swing.combatUnavailableReason).not.toBe("");
  });

  it("never lets a boosted weapon cost less than one AP", () => {
    const swing = buildCloseCombatSpell(PUNCH, {
      info: { ...BOW, apCost: 0 },
      effects: BOW_EFFECTS,
    });

    expect(swing.apCost).toBe(1);
  });
});
