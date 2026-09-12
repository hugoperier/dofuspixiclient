/**
 * A weapon's close-combat statistics.
 *
 * 1.29 keeps them on the item, not on a spell: `dofus.datacenter.Item`
 * exposes `apCost` / `rangeMin` / … through `getItemFightEffectsText(i)`,
 * which indexes the lang bundle's `e` array, and
 * `dofus.datacenter.CloseCombat` reads them off the equipped weapon to
 * build the melee attack. Nothing in the StarLoco dump carries them, so
 * the bundle is the only source.
 */
export interface WeaponInfo {
  apCost: number;
  rangeMin: number;
  rangeMax: number;
  /** 1-in-N chance, as retail states it. 0 = never. */
  criticalRate: number;
  /** 1-in-N chance. 0 = never. */
  failureRate: number;
  /** Flat damage added to every effect on a critical. */
  criticalBonus: number;
  lineOnly: boolean;
  lineOfSight: boolean;
}

/**
 * Retail's index into the `e` array, per `Item.as:476-512`:
 *
 *   0 criticalHitBonus · 1 apCost · 2 rangeMin · 3 rangeMax
 *   4 criticalHit · 5 criticalFailure · 6 lineOnly · 7 lineOfSight
 *
 * The v2 lang export emits the array **reversed**, exactly like the `lN`
 * spell arrays whose renversement `migrations/0039` documents. So
 * `retail(i)` is `e[7 - i]`, and the three fixtures in the spec are what
 * hold that claim up: the bow comes out ranged with line of sight, the
 * "Mauvaise Pioche" comes out at 6 AP and a 1-in-10 fumble.
 */
const RETAIL_LENGTH = 8;

function retail(e: readonly unknown[], index: number): unknown {
  return e[RETAIL_LENGTH - 1 - index];
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function bool(value: unknown): boolean {
  return value === true;
}

/**
 * Read one item's `e` array. Returns null when the item has none, or has
 * one of the wrong shape — most items are not weapons, and a shape we do
 * not recognise must not be guessed at.
 *
 * This is the *bundle* side: the seeding migration and the content
 * importer call it. Everything at runtime reads the already-parsed object
 * out of `item_templates.weapon_info` through {@link readWeaponInfo};
 * running the array parse over that object is how the close-combat
 * attack silently came out bare-handed for every weapon in the game.
 */
export function parseWeaponInfo(raw: unknown): WeaponInfo | null {
  if (!Array.isArray(raw) || raw.length !== RETAIL_LENGTH) {
    return null;
  }

  return {
    criticalBonus: num(retail(raw, 0)),
    apCost: num(retail(raw, 1)),
    rangeMin: num(retail(raw, 2)),
    rangeMax: num(retail(raw, 3)),
    criticalRate: num(retail(raw, 4)),
    failureRate: num(retail(raw, 5)),
    lineOnly: bool(retail(raw, 6)),
    lineOfSight: bool(retail(raw, 7)),
  };
}

/**
 * Narrow `item_templates.weapon_info` back into a {@link WeaponInfo}.
 *
 * The column is a `Json`, so it is `unknown` as far as the type system is
 * concerned, and a template that predates the seed carries null. Checking
 * the numeric fields is enough: nothing else writes this column, and a
 * row that has them has been through `parseWeaponInfo` already.
 */
export function readWeaponInfo(stored: unknown): WeaponInfo | null {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) {
    return null;
  }

  const info = stored as Partial<Record<keyof WeaponInfo, unknown>>;
  const numbers = [
    info.apCost,
    info.rangeMin,
    info.rangeMax,
    info.criticalRate,
    info.failureRate,
    info.criticalBonus,
  ];

  if (!numbers.every((value) => typeof value === "number")) {
    return null;
  }

  return {
    apCost: info.apCost as number,
    rangeMin: info.rangeMin as number,
    rangeMax: info.rangeMax as number,
    criticalRate: info.criticalRate as number,
    failureRate: info.failureRate as number,
    criticalBonus: info.criticalBonus as number,
    lineOnly: info.lineOnly === true,
    lineOfSight: info.lineOfSight === true,
  };
}
