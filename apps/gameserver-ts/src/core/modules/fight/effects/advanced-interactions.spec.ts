import { describe, expect, test } from "bun:test";

import { combatCatalog } from "../../spells/combat-catalog";
import { CastSpellUseCase } from "../cast/fight.cast";
import { ActiveState } from "../core/fight.active-state";
import { Fighter } from "../core/fight.fighter";
import { aiCastCandidates } from "../engine/fight.ai-policy";
import { moveFighter, pathToward } from "../engine/fight.movement";
import {
  Characteristic as C,
  Element,
  FightStateId,
} from "../fight.types";
import { combatHarness } from "./combat-test-harness";
import { applyDamageToTarget, dealSpellDamage } from "./fight.damage";
import { executeSpellEffects } from "./fight.effect-executor";
import { dispelEffects, killFighter } from "./fight.effect-lifecycle";
import { applyStatBoost } from "./handlers/stat-boost.handler";

function place(
  h: ReturnType<typeof combatHarness>,
  fighter: Fighter,
  cell: number
) {
  h.fight.fightMap.free(fighter.cell, fighter.id);
  fighter.cell = cell;
  h.fight.fightMap.occupy(cell, fighter.id);
}
function age(h: ReturnType<typeof combatHarness>, fighter: Fighter) {
  fighter.turnCount++;
  fighter.punishmentGains.clear();
  for (const b of fighter.buffs.tickDown()) {
    b.onRemove?.(h.fight, fighter);
  }
  fighter.buffs.each((b) => b.onTurnStart?.(h.fight, fighter));
}
function caster(h: ReturnType<typeof combatHarness>, missingSummon = false) {
  if (h.fight.state instanceof ActiveState) {
    h.fight.state.turnList.advance();
  }
  return new CastSpellUseCase(
    { bySession: () => h.fight },
    {
      playerSpellRank: async () => 6,
      spellLevel: async (id, rank) => combatCatalog.levels[`${id}:${rank}`],
      summonTemplate: async (id, rank) =>
        missingSummon ? undefined : combatCatalog.summons[`${id}:${rank}`],
    },
    h.registry,
    h.scope.emitter
  );
}

describe("all invocation grades", () => {
  for (const template of Object.values(combatCatalog.summons)) {
    test(`${template.templateId}:${template.grade} ${template.name}: stats, ownership, timeline, death`, () => {
      const h = combatHarness();
      h.registry.apply({
        ...h.scope,
        target: null,
        targetCell: 625,
        effect: {
          ...h.scope.effect,
          id: template.static ? 185 : 181,
          min: template.templateId,
          max: template.grade,
          duration: 0,
        },
      });
      const summon = h.fight
        .fighters()
        .find((f) => f.invocatorId === h.caster.id);
      expect(summon).toBeDefined();
      if (!summon) {
        throw new Error("Invocation missing");
      }
      expect(summon.lpMax).toBe(template.life * 3);
      expect(summon.ap).toBe(template.ap);
      expect(summon.mp).toBe(template.mp);
      expect(summon.monsterSpells).toEqual(template.spells);
      expect(summon.monsterGfx).toBe(template.gfx);
      expect(summon.summonGrade).toBe(template.grade);
      expect(h.fight.fightMap.occupantOf(625)).toBe(summon.id);
      if (h.fight.state instanceof ActiveState) {
        expect(h.fight.state.turnList.fighters().includes(summon)).toBe(
          !template.static
        );
      }
      killFighter(h.scope, h.caster);
      expect(summon.dead).toBe(true);
      expect(h.fight.fightMap.occupantOf(625)).toBeUndefined();
      expect(
        h.events.filter((e) => e.type === "death" && e.values[1] === summon.id)
      ).toHaveLength(1);
    });
  }
});

test("missing summon data rejects before AP, spawning and spell cooldown", async () => {
  const h = combatHarness();
  const useCase = caster(h, true);
  await expect(useCase.resolve("caster", "34;625")).rejects.toThrow();
  expect(h.caster.ap).toBe(100);
  expect(h.fight.fighters()).toHaveLength(3);
});

test("a second invocation is rejected by the authoritative capacity", async () => {
  const h = combatHarness();
  const useCase = caster(h);
  useCase.apply(await useCase.resolve("caster", "34;625"));
  const ap = h.caster.ap;
  await expect(useCase.resolve("caster", "34;575")).rejects.toThrow("Limite");
  expect(h.caster.ap).toBe(ap);
});

test("Vitalesque caps gains per turn and expires temporary current/max life", () => {
  const h = combatHarness();
  h.apply(441, h.caster);
  const max = h.caster.lpMax;
  applyDamageToTarget(
    { ...h.scope, caster: h.enemy, target: h.caster },
    150,
    Element.Fire
  );
  applyDamageToTarget(
    { ...h.scope, caster: h.enemy, target: h.caster },
    150,
    Element.Fire
  );
  expect(h.caster.punishmentGains.get(108)).toBe(200);
  expect(h.caster.lp).toBe(4900);
  expect(h.caster.lpMax).toBe(max - 30 + 200);
  age(h, h.caster);
  age(h, h.caster);
  expect(h.caster.lpMax).toBe(max - 30);
  expect(h.caster.lp).toBe(4700);
});

test("Mot Lotof follows the local description: once at the target's next turn start", () => {
  const h = combatHarness();
  place(h, h.enemy, 649);
  h.apply(427, h.ally);
  const before = h.enemy.lp;
  h.ally.buffs.each((b) => b.onTurnEnd?.(h.fight, h.ally));
  expect(h.enemy.lp).toBe(before);
  age(h, h.ally);
  expect(h.enemy.lp).toBeLessThan(before);
  const after = h.enemy.lp;
  age(h, h.ally);
  expect(h.enemy.lp).toBe(after);
});

test("lethal damage to Arbre de vie still heals the attacker", () => {
  const h = combatHarness();
  h.registry.apply({
    ...h.scope,
    effect: { ...h.scope.effect, id: 786, duration: -1 },
  });
  h.enemy.lp = 80;
  const hp = h.caster.lp;
  dealSpellDamage(h.scope, Element.Fire, 100, false);
  expect(h.enemy.dead).toBe(true);
  expect(h.caster.lp).toBe(hp + 80);
});

test("life costs ignore elemental stats, armor, resistance and Chance", () => {
  const h = combatHarness();
  h.apply(103, h.caster);
  h.apply(5, h.caster);
  h.caster.stats.setBase(C.Strength, 1000);
  h.caster.stats.setBase(C.ResistNeutralPct, 50);
  const hp = h.caster.lp;
  dealSpellDamage(
    { ...h.scope, target: h.caster, cause: "life-cost" },
    Element.Neutral,
    100
  );
  expect(h.caster.lp).toBe(hp - 100);
});

test("invisible enemies are absent from AI candidates and its path occupancy", () => {
  const h = combatHarness();
  h.enemy.invisible = true;
  const spell = combatCatalog.levels["3:6"];
  if (!spell) {
    throw new Error("Spell missing");
  }
  expect(aiCastCandidates(h.fight, h.caster, [spell])).toHaveLength(0);
  expect(pathToward(h.fight, h.caster, h.enemy)).toEqual([]);
});

test("Peur uses the adjacent fighter and causes no collision damage", async () => {
  const h = combatHarness();
  place(h, h.enemy, 625);
  place(h, h.ally, 650);
  const useCase = caster(h);
  useCase.apply(await useCase.resolve("caster", "73;675"));
  expect(h.enemy.cell).toBe(625);
  expect(h.enemy.lp).toBe(5000);
  expect(h.ally.lp).toBe(5000);
});

test("porter/jeter keeps one occupied cell and lands on a trap", () => {
  const h = combatHarness();
  h.apply(693, h.ally);
  expect(h.caster.carryingId).toBe(h.ally.id);
  expect(h.ally.carriedById).toBe(h.caster.id);
  expect(h.fight.fightMap.occupantOf(624)).toBeUndefined();
  let landed = 0;
  h.fight.fightMap.objects.add({
    id: 0,
    kind: 1,
    casterId: h.enemy.id,
    cell: 625,
    size: 0,
    element: 0,
    spellId: 1,
    spellLevel: 1,
    color: 0,
    remaining: -1,
    onArrival: (_f, victim) => {
      expect(victim).toBe(h.ally);
      landed++;
      return true;
    },
  });
  const spell = combatCatalog.levels["696:6"];
  if (!spell) {
    throw new Error("Chamrak missing");
  }
  executeSpellEffects(
    h.registry,
    { ...h.scope, target: null, targetCell: 625 },
    spell
  );
  expect(h.caster.carryingId).toBeNull();
  expect(h.ally.carriedById).toBeNull();
  expect(h.fight.fightMap.occupantOf(625)).toBe(h.ally.id);
  expect(landed).toBe(1);
});

test("Raulebaque resolves occupied starting-cell cycles atomically", () => {
  const h = combatHarness();
  h.fight.fightMap.free(h.caster.cell, h.caster.id);
  h.fight.fightMap.free(h.enemy.cell, h.enemy.id);
  h.caster.cell = 650;
  h.enemy.cell = 600;
  h.fight.fightMap.occupy(650, 1);
  h.fight.fightMap.occupy(600, 3);
  h.apply(424, h.caster);
  for (const f of h.fight.fighters()) {
    expect(f.cell).toBe(f.initialCell);
    expect(h.fight.fightMap.occupantOf(f.cell)).toBe(f.id);
  }
});

test("dispel removes a scheduled Lotof without firing it", () => {
  const h = combatHarness();
  place(h, h.enemy, 649);
  h.apply(427, h.ally);
  dispelEffects(h.scope, h.ally);
  age(h, h.ally);
  expect(h.enemy.lp).toBe(5000);
});

test("a carried fighter can walk down without moving its carrier", () => {
  const h = combatHarness();
  h.apply(693, h.ally);
  moveFighter(h.fight, h.ally, [625], {
    emitter: h.scope.emitter,
    step() {},
    tackled() {},
  });
  expect(h.caster.cell).toBe(600);
  expect(h.ally.cell).toBe(625);
  expect(h.fight.fightMap.occupantOf(600)).toBe(h.caster.id);
  expect(h.fight.fightMap.occupantOf(625)).toBe(h.ally.id);
  expect(h.caster.carryingId).toBeNull();
  expect(h.ally.carriedById).toBeNull();
  expect(h.ally.states.has(FightStateId.Carried)).toBe(false);
  expect(h.ally.mp).toBe(9);
  expect(h.events.filter((e) => e.type === "uncarry")).toHaveLength(1);
});

test("refusing a carried fighter's path preserves both links and resources", () => {
  const h = combatHarness();
  h.apply(693, h.ally);
  expect(() =>
    moveFighter(h.fight, h.ally, [625, 650], { step() {}, tackled() {} })
  ).toThrow("Chemin");
  expect(h.ally.mp).toBe(10);
  expect(h.ally.cell).toBe(600);
  expect(h.caster.carryingId).toBe(h.ally.id);
  expect(h.ally.carriedById).toBe(h.caster.id);
});

test("Raulebaque detaches two original fighters at their own starting cells", () => {
  const h = combatHarness();
  h.apply(693, h.ally);
  place(h, h.caster, 675);
  h.ally.cell = 675;
  h.apply(424, h.caster);
  for (const f of h.fight.fighters()) {
    expect(f.cell).toBe(f.initialCell);
    expect(h.fight.fightMap.occupantOf(f.cell)).toBe(f.id);
    expect(f.carryingId).toBeNull();
    expect(f.carriedById).toBeNull();
  }
});

test("Raulebaque lands a carried summon at the carrier's previous position", () => {
  const h = combatHarness();
  h.ally.invocatorId = h.caster.id;
  h.ally.initialCell = -1;
  h.apply(693, h.ally);
  place(h, h.caster, 675);
  h.ally.cell = 675;
  h.apply(424, h.caster);
  expect(h.caster.cell).toBe(600);
  expect(h.ally.cell).toBe(675);
  expect(h.fight.fightMap.occupantOf(675)).toBe(h.ally.id);
  expect(h.ally.carriedById).toBeNull();
});

test("Raulebaque preserves a carried pair if the summon cannot land", () => {
  const h = combatHarness();
  h.ally.invocatorId = h.caster.id;
  h.ally.initialCell = -1;
  h.apply(693, h.ally);
  h.apply(424, h.caster);
  expect(h.caster.carryingId).toBe(h.ally.id);
  expect(h.ally.carriedById).toBe(h.caster.id);
  expect(h.fight.fightMap.occupantOf(600)).toBe(h.caster.id);
});

test("dispel reverses current AP/MP buffs exactly once, including after spending", () => {
  const h = combatHarness();
  const scope = { ...h.scope, target: h.ally };
  applyStatBoost(scope, C.ActionPoints, 3);
  applyStatBoost(scope, C.MovementPoints, 2);
  h.ally.spendAp(4);
  h.ally.spendMp(3);
  dispelEffects(h.scope, h.ally);
  dispelEffects(h.scope, h.ally);
  expect(h.ally.ap).toBe(6);
  expect(h.ally.mp).toBe(7);
  expect(h.ally.stats.get(C.ActionPoints)).toBe(10);
  expect(h.ally.stats.get(C.MovementPoints)).toBe(10);
  expect(h.events.filter((e) => e.type === "ap")).toHaveLength(2);
  expect(h.events.filter((e) => e.type === "mp")).toHaveLength(2);
});

test("dispel restores current AP/MP losses exactly once", () => {
  const h = combatHarness();
  for (const id of [168, 169]) {
    h.registry.apply({
      ...h.scope,
      effect: { ...h.scope.effect, id, min: 2, max: 2, dice: "", duration: 2 },
    });
  }
  expect(h.enemy.ap).toBe(8);
  expect(h.enemy.mp).toBe(8);
  dispelEffects(h.scope, h.enemy);
  dispelEffects(h.scope, h.enemy);
  expect(h.enemy.ap).toBe(10);
  expect(h.enemy.mp).toBe(10);
  expect(h.enemy.stats.get(C.ActionPoints)).toBe(10);
  expect(h.enemy.stats.get(C.MovementPoints)).toBe(10);
});

test("Punitive charge strengthens the exact relaunch turn and expires afterwards", () => {
  for (const elapsed of [2, 3]) {
    const h = combatHarness();
    h.apply(171);
    const first = 5000 - h.enemy.lp;
    for (let turn = 0; turn < elapsed; turn++) {
      age(h, h.caster);
    }
    const before = h.enemy.lp;
    h.apply(171);
    expect(before - h.enemy.lp).toBe(first + (elapsed === 2 ? 32 : 0));
    expect(h.caster.buffs.all().filter((b) => b.effectId === 293)).toHaveLength(
      1
    );
  }
});

test("a trap already on the target cell rejects before AP and cooldown", async () => {
  const h = combatHarness();
  const useCase = caster(h);
  useCase.apply(await useCase.resolve("caster", "65;625"));
  const ap = h.caster.ap;
  await expect(useCase.resolve("caster", "65;625")).rejects.toThrow("piège");
  expect(h.caster.ap).toBe(ap);
  expect(h.fight.fightMap.objects.atCell(625)).toHaveLength(1);
});

test("combat cleanup removes temporary vitality, characteristics and links without replaying triggers", () => {
  const h = combatHarness();
  applyStatBoost({ ...h.scope, target: h.caster }, C.Vitality, 200);
  applyStatBoost({ ...h.scope, target: h.caster }, C.ActionPoints, 3);
  h.caster.lp -= 100;
  h.apply(693, h.ally);
  expect(h.caster.lifeAfterCombat()).toBe(4900);
  const events = h.events.length;
  for (const f of h.fight.fighters()) {
    f.finishCombat();
  }
  expect(h.caster.lp).toBe(4900);
  expect(h.caster.lpMax).toBe(10000);
  expect(h.caster.ap).toBe(100);
  expect(h.caster.buffs.all()).toHaveLength(0);
  expect(h.caster.carryingId).toBeNull();
  expect(h.ally.carriedById).toBeNull();
  expect(h.events).toHaveLength(events);
});
