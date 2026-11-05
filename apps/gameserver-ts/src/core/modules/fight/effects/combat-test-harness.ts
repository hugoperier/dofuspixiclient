import "reflect-metadata";

import type { SpellLevel } from "../cast/fight.spell.types";
import type { EffectHandlerMeta } from "./fight.effect-handler.decorator";
import type { Emitter, Scope } from "./fight.effect-registry.types";
import { combatCatalog } from "../../spells/combat-catalog";
import { ActiveState } from "../core/fight.active-state";
import { Fight } from "../core/fight.entity";
import { Fighter } from "../core/fight.fighter";
import { FighterKind, FightType } from "../fight.types";
import { FightMap } from "../map/fight.map";
import { executeSpellEffects } from "./fight.effect-executor";
import { EFFECT_HANDLER_META } from "./fight.effect-handler.decorator";
import { EffectRegistry } from "./fight.effect-registry";
import { HANDLER_PROVIDERS } from "./fight.effects.module";

export function combatRegistry(): EffectRegistry {
  const registry = new EffectRegistry();
  for (const Provider of HANDLER_PROVIDERS) {
    const instance = new Provider();
    const prototype = Object.getPrototypeOf(instance);
    for (const name of Object.getOwnPropertyNames(prototype)) {
      const metadata = Reflect.getMetadata(
        EFFECT_HANDLER_META,
        prototype[name]
      ) as EffectHandlerMeta | undefined;
      if (!metadata) {
        continue;
      }
      for (const id of metadata.effectIds) {
        if (registry.handler(id)) {
          throw new Error(`Duplicate effect ${id}`);
        }
        registry.register(id, prototype[name].bind(instance));
      }
    }
  }
  return registry;
}

export function combatHarness(
  spellId = 3,
  rank = 6,
  random: () => number = () => 0.99
) {
  const spell = combatCatalog.levels[`${spellId}:${rank}`];
  if (!spell) {
    throw new Error(`Missing fixture ${spellId}:${rank}`);
  }
  const registry = combatRegistry();
  const fight = new Fight(
    FightType.PvM,
    1,
    new FightMap(25, 30, [], []),
    [
      { side: 0, leaderId: 1 },
      { side: 1, leaderId: 3 },
    ],
    random
  );
  const caster = new Fighter(
    1,
    FighterKind.Player,
    "caster",
    10000,
    100,
    10,
    1
  );
  caster.player = {
    id: 1,
    name: "caster",
    level: 200,
    life: 10000,
    sex: 0,
    gfx: 10,
    direction: 1,
    stats: {
      strength: 0,
      intelligence: 0,
      chance: 0,
      agility: 0,
      wisdom: 0,
      vitality: 0,
    },
  };
  caster.sessionId = "caster";
  const ally = new Fighter(2, FighterKind.Player, "ally", 10000, 10, 10, 1);
  const enemy = new Fighter(3, FighterKind.Monster, "enemy", 10000, 10, 10, 1);
  enemy.monsterLevel = 200;
  ally.sessionId = "ally";
  enemy.sessionId = "enemy";
  fight.teams[0].add(caster);
  fight.teams[0].add(ally);
  fight.teams[1].add(enemy);
  caster.cell = 600;
  ally.cell = 624;
  enemy.cell = 650;
  for (const f of fight.fighters()) {
    fight.fightMap.occupy(f.cell, f.id);
    f.lp = 5000;
  }
  fight.transition(new ActiveState());
  const events: { type: string; values: unknown[] }[] = [];
  const record =
    (type: string) =>
    (...values: unknown[]) => {
      events.push({ type, values });
    };
  const emitter: Emitter = {
    emitDamage: record("damage"),
    emitHeal: record("heal"),
    emitDeath: record("death"),
    emitAPLoss: record("ap"),
    emitMPLoss: record("mp"),
    emitBuff: record("buff"),
    emitTeleport: record("teleport"),
    emitTrapAdd: record("trap"),
    emitGlyphAdd: record("glyph"),
    emitTrapRemove: record("trapRemove"),
    emitGlyphRemove: record("glyphRemove"),
    emitGlyphTrigger: record("trigger"),
    emitSummon: record("summon"),
    emitRoster: record("roster"),
    emitState: record("state"),
    emitVisibility: record("visibility"),
    emitAppearance: record("appearance"),
    emitCarry: record("carry"),
    emitUncarry: record("uncarry"),
    emitDispel: record("dispel"),
    emitReduction: record("reduction"),
    emitReflection: record("reflection"),
    emitGold: record("gold"),
  };
  const effect = spell.effects[0];
  if (!effect) {
    throw new Error("Fixture has no effects");
  }
  const scope: Scope = {
    fight,
    caster,
    target: enemy,
    targetCell: enemy.cell,
    castTargetCell: enemy.cell,
    spell,
    effect,
    critical: false,
    emitter,
    triggerCache: new Map(Object.entries(combatCatalog.levels)),
    summonCache: new Map(Object.entries(combatCatalog.summons)),
    applyEffect: (next) => registry.apply(next),
    applySpell: (next, child, targets) => {
      executeSpellEffects(registry, next, child, targets);
    },
  };
  function apply(id: number, target = enemy, level = rank) {
    const child: SpellLevel | undefined =
      combatCatalog.levels[`${id}:${level}`];
    if (!child) {
      throw new Error(`Missing fixture ${id}:${level}`);
    }
    return executeSpellEffects(
      registry,
      { ...scope, target, targetCell: target.cell },
      child,
      [target]
    );
  }
  return { scope, fight, caster, ally, enemy, events, registry, apply };
}
