import { describe, expect, it } from "bun:test";

import { parseWeaponInfo, readWeaponInfo } from "./weapon-info";

/**
 * The `e` array's layout is a deduction, not documentation — see
 * `weapon-info.ts`. These three fixtures are copied verbatim out of
 * `assets/dist/langs/fr/items.json` and are what makes the deduction
 * falsifiable: every close-combat number the server computes flows
 * through this parse, so a wrong index here is a wrong weapon
 * everywhere.
 */
describe("parseWeaponInfo", () => {
  it("reads a sword: melee, 4 AP", () => {
    // 40 — Petite Epée de Boisaille
    expect(parseWeaponInfo([false, false, 30, 50, 1, 1, 4, 5])).toEqual({
      apCost: 4,
      rangeMin: 1,
      rangeMax: 1,
      criticalRate: 50,
      failureRate: 30,
      criticalBonus: 5,
      lineOnly: false,
      lineOfSight: false,
    });
  });

  it("reads a bow: ranged, needs line of sight", () => {
    // 88 — Petit Arc de Boisaille
    expect(parseWeaponInfo([true, false, 50, 30, 6, 2, 4, 5])).toEqual({
      apCost: 4,
      rangeMin: 2,
      rangeMax: 6,
      criticalRate: 30,
      failureRate: 50,
      criticalBonus: 5,
      lineOnly: false,
      lineOfSight: true,
    });
  });

  it("reads a bad pickaxe: dearer to swing, fumbles one time in ten", () => {
    // 1439 — Mauvaise Pioche
    const info = parseWeaponInfo([true, false, 10, 50, 1, 1, 6, 4]);

    expect(info?.apCost).toBe(6);
    expect(info?.failureRate).toBe(10);
    expect(info?.criticalRate).toBe(50);
  });

  it("declines anything that is not a weapon block", () => {
    expect(parseWeaponInfo(undefined)).toBeNull();
    expect(parseWeaponInfo([])).toBeNull();
    expect(parseWeaponInfo([1, 2, 3])).toBeNull();
  });
});

/**
 * The column holds what `parseWeaponInfo` produced, not the `e` array it
 * produced it from. Running the array parse over that object answers
 * null for every weapon in the game, which reads exactly like "the
 * player is bare-handed" — so the round trip gets its own case.
 */
describe("readWeaponInfo", () => {
  it("reads back what the column was seeded with", () => {
    const parsed = parseWeaponInfo([true, false, 50, 30, 6, 2, 4, 5]);
    const stored = JSON.parse(JSON.stringify(parsed));

    expect(readWeaponInfo(stored)).toEqual(parsed);
  });

  it("declines a template that was never seeded", () => {
    expect(readWeaponInfo(null)).toBeNull();
    expect(readWeaponInfo(undefined)).toBeNull();
  });

  it("declines the raw bundle array, which is not what the column holds", () => {
    expect(readWeaponInfo([true, false, 50, 30, 6, 2, 4, 5])).toBeNull();
  });
});
