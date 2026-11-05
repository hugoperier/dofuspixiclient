import { describe, expect, test } from "bun:test";

import { combatCatalog } from "../../spells/combat-catalog";
import { prepareCombatData } from "../../spells/combat-dependencies";
import { CastSpellUseCase } from "../cast/fight.cast";
import { ActiveState } from "../core/fight.active-state";
import { Characteristic, Element, FightStateId } from "../fight.types";
import { combatHarness, combatRegistry } from "./combat-test-harness";
import { applyDamageToTarget, dealSpellDamage } from "./fight.damage";
import { executeSpellEffects } from "./fight.effect-executor";
import { dispelEffects, killFighter } from "./fight.effect-lifecycle";
import { rollEffect, selectEffects } from "./fight.effect-registry";

const port = {
  spellLevel: async (id: number, rank: number) =>
    combatCatalog.levels[`${id}:${rank}`],
  summonTemplate: async (id: number, grade: number) =>
    combatCatalog.summons[`${id}:${grade}`],
};
const registry = combatRegistry();
const rootIds = new Set(combatCatalog.roots.map((root) => root.spellId));
const ranks = [
  ...combatCatalog.roots.flatMap((root) =>
    Array.from({ length: 6 }, (_, index) => ({ root, rank: index + 1 }))
  ),
  ...Object.values(combatCatalog.levels)
    .filter((spell) => !rootIds.has(spell.spellId))
    .map((spell) => ({
      root: { classId: 0, spellId: spell.spellId },
      rank: spell.level,
    })),
];

describe("class catalogue: exact ranks and authoritative dependencies", () => {
  test("264 distinct class spells, 1584 root ranks", () => {
    expect(new Set(combatCatalog.roots.map((root) => root.spellId)).size).toBe(
      264
    );
    expect(combatCatalog.roots.length * 6).toBe(1584);
  });
  for (const { root, rank } of ranks) {
    test(`${root.classId} / ${root.spellId} ${combatCatalog.names[root.spellId]} / ${rank}`, async () => {
      const spell = combatCatalog.levels[`${root.spellId}:${rank}`];
      if (!spell) {
        throw new Error("Missing root rank");
      }
      const prepared = await prepareCombatData(spell, port, (id) =>
        Boolean(registry.handler(id))
      );
      expect(prepared.reason).toBe("");
      expect(prepared.spells.get(`${root.spellId}:${rank}`)?.level).toBe(rank);
      for (const critical of [false, true]) {
        if (critical && spell.criticalEffects.length === 0) {
          continue;
        }
        const sourceLines = critical ? spell.criticalEffects : spell.effects;
        const choices = sourceLines.filter(
          (effect) => effect.probability > 0 && effect.probability < 100
        );
        const denominator =
          spell.spellId === 101
            ? choices.reduce((sum, effect) => sum + effect.probability, 0)
            : 100;
        let cumulative = 0;
        const outcomes = choices.length
          ? choices.map((effect) => {
              const value = (cumulative + effect.probability / 2) / denominator;
              cumulative += effect.probability;
              return value;
            })
          : [0.01];
        if (choices.length && cumulative < denominator) {
          outcomes.push((cumulative + denominator) / (2 * denominator));
        }
        for (const outcome of outcomes) {
          let draw = 0;
          const validationDraws =
            Number(spell.criticalRate > 0) + Number(spell.failureRate > 0);
          const h = combatHarness(root.spellId, rank, () => {
            const index = draw++;
            return index >= validationDraws
              ? index === validationDraws
                ? outcome
                : 0.01
              : index === 0 && critical
                ? 0
                : 0.99;
          });
          if (!(h.fight.state instanceof ActiveState)) {
            throw new Error("Fight not active");
          }
          h.fight.state.turnList.advance();
          for (const state of spell.requiredStates ?? []) {
            h.caster.states.set(state, -1);
          }
          const lines = critical ? spell.criticalEffects : spell.effects;
          const filter = lines[0]?.targetFilter ?? 0;
          const target =
            spell.rangeMax === 0
              ? h.caster
              : root.spellId === 438 || filter & (4 | 64)
                ? h.ally
                : h.enemy;
          for (const fighter of [h.enemy, h.ally]) {
            h.fight.fightMap.free(fighter.cell, fighter.id);
            fighter.cell =
              fighter === target
                ? 600 +
                  25 *
                    Math.max(
                      lines.some((effect) => effect.id === 6) &&
                        spell.rangeMax >= 2
                        ? 2
                        : 1,
                      spell.rangeMin
                    )
                : fighter === h.ally
                  ? 400
                  : 425;
            h.fight.fightMap.occupy(fighter.cell, fighter.id);
          }
          if (filter & 8) {
            target.invocatorId = target === h.enemy ? 999 : h.caster.id;
          }
          if (spell.rangeMax === 0 && lines.some((e) => e.areaKind === 1)) {
            h.fight.fightMap.free(h.enemy.cell, h.enemy.id);
            h.enemy.cell = 625;
            h.fight.fightMap.occupy(625, h.enemy.id);
            h.fight.fightMap.free(h.ally.cell, h.ally.id);
            h.ally.cell = 624;
            h.fight.fightMap.occupy(624, h.ally.id);
          }
          let cell = target.cell;
          if (
            lines.some((e) =>
              [4, 180, 181, 185, 400, 401, 780, 51].includes(e.id)
            )
          ) {
            h.fight.fightMap.free(target.cell, target.id);
            if (target !== h.caster) {
              target.cell = 450;
              h.fight.fightMap.occupy(target.cell, target.id);
            } else {
              h.fight.fightMap.occupy(target.cell, target.id);
            }
            cell = 600 + 25 * Math.max(1, spell.rangeMin);
          }
          if (lines.some((e) => e.id === 783)) {
            h.fight.fightMap.free(h.enemy.cell, h.enemy.id);
            h.enemy.cell = 625;
            h.fight.fightMap.occupy(625, h.enemy.id);
            cell = 650;
          }
          if (lines.some((e) => e.id === 780)) {
            killFighter(h.scope, h.ally);
          }
          if (lines.some((e) => e.id === 51)) {
            h.caster.carryingId = h.ally.id;
            h.ally.carriedById = h.caster.id;
            h.fight.fightMap.free(h.ally.cell, h.ally.id);
            h.ally.cell = h.caster.cell;
          }
          h.events.length = 0;
          const casts = new CastSpellUseCase(
            { bySession: () => h.fight },
            { ...port, playerSpellRank: async () => rank },
            h.registry,
            h.scope.emitter
          );
          const apBefore = h.caster.ap;
          if (spell.apCost > 0) {
            h.caster.ap = spell.apCost - 1;
            await expect(
              casts.resolve(h.caster.sessionId, `${root.spellId};${cell}`)
            ).rejects.toMatchObject({ code: "no_ap" });
            expect(h.events).toHaveLength(0);
            h.caster.ap = apBefore;
          }
          for (const state of spell.requiredStates ?? []) {
            h.caster.states.clear(state);
            await expect(
              casts.resolve(h.caster.sessionId, `${root.spellId};${cell}`)
            ).rejects.toMatchObject({ code: "required_state" });
            h.caster.states.set(state, -1);
          }
          for (const state of spell.forbiddenStates ?? []) {
            h.caster.states.set(state, -1);
            await expect(
              casts.resolve(h.caster.sessionId, `${root.spellId};${cell}`)
            ).rejects.toMatchObject({ code: "forbidden_state" });
            h.caster.states.clear(state);
          }
          const resolution = await casts.resolve(
            h.caster.sessionId,
            `${root.spellId};${cell}`
          );
          expect(h.caster.ap).toBe(apBefore);
          expect(resolution.failure).toBe(false);
          expect(resolution.critical).toBe(critical);
          casts.apply(resolution);
          expect(h.caster.apUsedThisTurn).toBe(spell.apCost);
          if (selectEffects(sourceLines, () => outcome, spell.spellId).length) {
            expect(h.events.length).toBeGreaterThan(0);
          }
          for (const fighter of h.fight.fighters()) {
            expect(Number.isFinite(fighter.lp)).toBe(true);
            expect(fighter.lp).toBeGreaterThanOrEqual(0);
            expect(fighter.lp).toBeLessThanOrEqual(fighter.lpMax);
            if (!fighter.dead && fighter.carriedById === null) {
              expect(h.fight.fightMap.occupantOf(fighter.cell)).toBe(
                fighter.id
              );
            }
          }
        }
      }
    });
  }
});

describe("combat interactions", () => {
  test("Feca elemental armor protects the matching element using its caster's stats", () => {
    const h = combatHarness();
    h.caster.stats.setBase(Characteristic.Intelligence, 200);
    h.apply(1, h.ally);
    const before = h.ally.lp;
    applyDamageToTarget(
      { ...h.scope, caster: h.enemy, target: h.ally },
      100,
      Element.Fire
    );
    const fire = before - h.ally.lp;
    applyDamageToTarget(
      { ...h.scope, caster: h.enemy, target: h.ally },
      100,
      Element.Water
    );
    expect(fire).toBeLessThan(100);
    expect(before - fire - h.ally.lp).toBe(100);
  });

  test("Vitality expires once and can kill a fighter surviving on temporary life", () => {
    const h = combatHarness();
    h.apply(155, h.ally);
    expect(h.ally.lpMax).toBe(10300);
    h.ally.lp = 200;
    dispelEffects(h.scope, h.ally);
    dispelEffects(h.scope, h.ally);
    expect(h.ally.lpMax).toBe(10000);
    expect(h.ally.dead).toBe(true);
    expect(h.events.filter((e) => e.type === "death")).toHaveLength(1);
  });

  test("Brokle acts on the recipient and has precedence over the attacker's Poisse", () => {
    const h = combatHarness();
    h.apply(416, h.caster);
    const scope = {
      ...h.scope,
      effect: { ...h.scope.effect, min: 10, max: 30, dice: "" },
    };
    expect(rollEffect(scope)).toBe(10);
    h.apply(410, h.enemy);
    expect(rollEffect(scope)).toBe(30);
    expect(rollEffect({ ...scope, target: h.ally })).toBe(10);
  });

  test("Bluff chooses exactly one elemental branch on one combat draw", () => {
    const spell = combatCatalog.levels["109:6"];
    if (!spell) { throw new Error("Missing Bluff fixture"); }
    let draws = 0;
    const chosen = selectEffects(
      spell.effects,
      () => {
        draws++;
        return 0.2;
      },
      109
    );
    expect(chosen.filter((e) => e.id === 96 || e.id === 98)).toHaveLength(1);
    expect(draws).toBe(1);
  });

  test("poison ticks through the damage pipeline and is cancelled by dispel", () => {
    const h = combatHarness();
    h.apply(66, h.enemy);
    const before = h.enemy.lp;
    expect(before).toBe(5000);
    h.enemy.buffs.each((buff) => buff.onTurnStart?.(h.fight, h.enemy));
    expect(h.enemy.lp).toBeLessThan(before);
    dispelEffects(h.scope, h.enemy);
    const after = h.enemy.lp;
    h.enemy.buffs.each((buff) => buff.onTurnStart?.(h.fight, h.enemy));
    expect(h.enemy.lp).toBe(after);
  });

  test("Sacrifice redirects damage, never healing or buffs", () => {
    const h = combatHarness();
    h.apply(440, h.ally);
    dealSpellDamage(
      { ...h.scope, caster: h.enemy, target: h.ally },
      Element.Fire,
      100,
      false
    );
    expect(h.ally.lp).toBe(5000);
    expect(h.caster.lp).toBe(4900);
    expect(h.caster.cell).toBe(624);
    h.apply(124, h.ally);
    expect(h.ally.lp).toBeGreaterThan(5000);
    expect(h.caster.lp).toBe(4900);
  });

  test("Chance converts one received damage event to healing", () => {
    const h = combatHarness(3, 6, () => 0);
    h.apply(103, h.ally);
    const actual = applyDamageToTarget(
      { ...h.scope, target: h.ally },
      100,
      Element.Fire
    );
    expect(actual).toBe(0);
    expect(h.ally.lp).toBe(5200);
  });

  test("Laisse restores the last eligible ally and links its life to the caster", () => {
    const h = combatHarness(420);
    killFighter(h.scope, h.ally);
    executeSpellEffects(
      h.registry,
      { ...h.scope, targetCell: 625 },
      h.scope.spell
    );
    expect(h.ally.dead).toBe(false);
    expect(h.ally.revivedById).toBe(h.caster.id);
    expect(h.ally.isInvocation()).toBe(false);
    expect((h.fight.state as ActiveState).turnList.fighters()).toContain(
      h.ally
    );
    killFighter(h.scope, h.caster);
    expect(h.ally.dead).toBe(true);
    expect(h.fight.fightMap.isFree(625)).toBe(true);
  });

  test("catalogue states are independent of invisibility and forced roll properties", () => {
    const h = combatHarness();
    h.apply(72, h.caster);
    expect(h.caster.invisible).toBe(true);
    expect(h.caster.states.has(FightStateId.Drunk)).toBe(false);
    dispelEffects(h.scope, h.caster);
    expect(h.caster.invisible).toBe(false);
  });
});
