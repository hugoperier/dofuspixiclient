import type {
  SpellEffect,
  SpellLevel,
} from "@modules/fight/cast/fight.spell.types";
import type { ItemEffect } from "@modules/inventory/item-effects";
import type { WeaponInfo } from "@modules/inventory/weapon-info";
import { TargetMask } from "@modules/fight/effects/fight.target-mask";
import { AreaKind } from "@modules/fight/fight.types";

/** `dofus.datacenter.CloseCombat.CLOSE_COMBAT_SPELL_ID`. */
export const CLOSE_COMBAT_SPELL_ID = 0;

/**
 * What a weapon does when it lands.
 *
 * A weapon template's effect list mixes two unrelated things: what the
 * swing inflicts, and what wearing the item grants. `+1 Force` (118) is
 * folded into the wearer's characteristics the moment the item is
 * equipped — replaying it as a cast effect would grant Force to whoever
 * got hit. So the swing takes an explicit allow-list rather than the
 * whole list.
 *
 * Derived from the effect ids that actually occur on the 4 363 items of
 * super-type 2 in `items.json`, intersected with the ids that read as an
 * action rather than a statistic: elemental damage (96-100), life steal
 * (91-95), the AP/MP the heavier weapons strip (101, 127), and the heal
 * a handful of wands carry (108). Anything else on a weapon is dropped
 * from the swing rather than guessed at — the same stance
 * `combatUnavailableReason` takes on an unknown spell effect.
 */
const WEAPON_HIT_EFFECTS = new Set([
  91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 108, 127,
]);

/**
 * The close-combat attack, as a spell the cast pipeline can resolve.
 *
 * 1.29 models it exactly this way: `CloseCombat` *is* `Spell(0, 1)`,
 * and every getter on it — `apCost`, `rangeMin`, `criticalHit`,
 * `effectsNormalHit` — returns the weapon's value when a weapon is held
 * and the punch's own when it is not. `punch` is the `spell_levels(0, 1)`
 * row, seeded from the lang bundle by migration 0039, so bare hands need
 * no special case at all: they are the row.
 *
 * @param punch  `spell_levels(0, 1)` — "Coup de poing".
 * @param weapon The equipped weapon, or undefined for bare hands.
 */
export function buildCloseCombatSpell(
  punch: SpellLevel,
  weapon?: {
    info: WeaponInfo;
    effects: readonly ItemEffect[];
  }
): SpellLevel {
  if (!weapon) {
    return punch;
  }

  const { info } = weapon;
  const effects = weapon.effects
    .filter((effect) => WEAPON_HIT_EFFECTS.has(effect.id))
    .map(toSpellEffect);

  return {
    ...punch,
    apCost: Math.max(1, info.apCost),
    rangeMin: info.rangeMin,
    rangeMax: info.rangeMax,
    criticalRate: info.criticalRate,
    failureRate: info.failureRate,
    lineOfSight: info.lineOfSight,
    lineOnly: info.lineOnly,
    // A weapon's range is fixed: `CloseCombat.canBoostRange` is false,
    // so Portée bonuses do not reach it.
    modifiableRange: false,
    // 1.29 puts no per-turn or per-target cap on a weapon —
    // `launchCountByTurn` and `launchCountByPlayerTurn` are both 0.
    castPerTurn: 0,
    castPerTarget: 0,
    cooldown: 0,
    effects,
    // `criticalHitBonus` is a flat add on every effect of the swing
    // (`Item.criticalHitBonus`, index 0 of the weapon block), not a
    // separate effect list of its own.
    //
    // The dice formula has to move with the bounds. `rollEffect` rolls
    // the dice and then clamps the result to `[min, max]`: raising only
    // the bounds leaves a `1d7+0` roll of 1..7 clamped into 6..12, so
    // every critical came out at its floor instead of its range.
    criticalEffects: effects.map((effect) => ({
      ...effect,
      min: effect.min + info.criticalBonus,
      max: effect.max + info.criticalBonus,
      ...(effect.dice
        ? { dice: shiftDice(effect.dice, info.criticalBonus) }
        : {}),
    })),
    // An unarmed punch is available to everyone; so is a weapon the
    // player is already allowed to wear.
    combatUnavailableReason:
      effects.length === 0
        ? "Cette arme ne peut pas encore être utilisée en combat."
        : "",
  };
}

/**
 * An item effect is `{id, param1, param2, param3}` where the two params
 * are the damage bounds and `param3` is the dice formula. A spell effect
 * wants explicit bounds plus a target mask, which the weapon block never
 * carries.
 *
 * The mask is `AnyFighter` rather than the per-effect default: a swing
 * lands on whoever is standing there, ally included. The punch row that
 * migration 0039 seeds says so itself — `spell_levels(0, 1)` carries
 * mask 7 on its damage effect, not `Enemy` — and taking
 * `defaultTargetMaskForEffect` instead would make a sword refuse to hit
 * a teammate the retail client happily lets you hit.
 */
function toSpellEffect(effect: ItemEffect): SpellEffect {
  return {
    id: effect.id,
    min: effect.param1,
    max: Math.max(effect.param1, effect.param2),
    special: 0,
    duration: 0,
    // 0 is "always applies" — the registry only rolls between effects
    // whose probability is strictly inside 0..100.
    probability: 0,
    areaKind: AreaKind.None,
    areaSize: 0,
    targetMask: TargetMask.AnyFighter,
    dice: effect.param3,
  };
}

/**
 * Move a dice formula's constant term by `bonus` — `1d7+0` plus 5 is
 * `1d7+5`. Keeps the distribution the weapon describes instead of
 * flattening a critical onto one value.
 *
 * An unparseable formula is returned untouched: `rollEffect` ignores
 * what it cannot match and falls back to the bounds, which already
 * carry the bonus.
 */
function shiftDice(dice: string, bonus: number): string {
  const parts = dice.match(/^(\d+d\d+)([+-]\d+)?$/);

  if (!parts?.[1]) {
    return dice;
  }

  const constant = Number(parts[2] ?? 0) + bonus;
  return `${parts[1]}${constant < 0 ? constant : `+${constant}`}`;
}
