import { describe, expect, test } from "bun:test";

import type { DofusMessage } from "@dofus/proto/server_messages_pb";
import { create } from "@bufbuild/protobuf";
import {
  GameActionRequestSchema,
  GameSetReadySchema,
  GameTurnEndSchema,
} from "@dofus/proto/game_pb";
import { FightPlacementHandler } from "@features/game/fight-placement/fight-placement.handler";
import { FightTurnHandler } from "@features/game/fight-turn/fight-turn.handler";
import { PlayerPresenceService } from "@modules/player-presence/player-presence.service";
import { SpellsService } from "@modules/spells/spells.service";
import { Test } from "@nestjs/testing";
import { GatewayFrameService } from "@shared/gateway-adapter/gateway-frame.service";
import { SessionRegistry } from "@shared/gateway-adapter/session-registry";

import type { SpellLevel } from "./fight.spell";
import { LangsService } from "../../langs/langs.service";
import { ActiveState } from "../core/fight.active-state";
import { Fight } from "../core/fight.entity";
import { Fighter } from "../core/fight.fighter";
import { PlacementState } from "../core/fight.states";
import { EffectRegistry, type Emitter } from "../effects/fight.effect-registry";
import { DamageEffectHandler } from "../effects/handlers/damage.handler";
import { FightActionsService } from "../engine/fight.actions.service";
import { FightEndService } from "../engine/fight.end.service";
import { FightFrameEmitter } from "../engine/fight.frame-emitter";
import { FightLifecycleService } from "../engine/fight.lifecycle.service";
import {
  Characteristic,
  FighterKind,
  FightStateId,
  FightType,
  TeamSide,
} from "../fight.types";
import { FightMap } from "../map/fight.map";
import { FightRegistryService } from "../registry/fight.registry";
import { CastSpellUseCase } from "./fight.cast";

function harness(over: Partial<SpellLevel> = {}) {
  const map = new FightMap(15, 17, [200], [230]);
  const fight = new Fight(
    FightType.PvM,
    1,
    map,
    [
      { side: TeamSide.Side0, leaderId: 1 },
      { side: TeamSide.Side1, leaderId: 2 },
    ],
    () => 0.9
  );
  const caster = new Fighter(1, FighterKind.Player, "caster", 100, 6, 3, 3);
  caster.sessionId = "player";
  caster.player = {
    id: 1,
    name: "caster",
    level: 1,
    life: 100,
    sex: 0,
    gfx: 10,
    direction: 3,
    stats: {
      strength: 0,
      intelligence: 0,
      chance: 0,
      agility: 0,
      wisdom: 0,
      vitality: 0,
    },
  };
  const target = new Fighter(2, FighterKind.Monster, "target", 30, 4, 2, 3);
  fight.teams[0].add(caster);
  fight.teams[1].add(target);
  caster.cell = 200;
  target.cell = 230;
  map.occupy(caster.cell, caster.id);
  map.occupy(target.cell, target.id);
  const active = new ActiveState();
  fight.transition(active);
  active.turnList.advance();
  const spell: SpellLevel = {
    spellId: 1,
    level: 1,
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
    visualGfxId: 1,
    effects: [
      {
        id: 100,
        min: 30,
        max: 30,
        probability: 0,
        duration: 0,
        special: 0,
        areaKind: 0,
        areaSize: 0,
        targetMask: 0,
      },
    ],
    criticalEffects: [],
    ...over,
  };
  const damage: number[] = [];
  const emitter: Emitter = {
    emitDamage: (_f, _a, _t, n) => {
      damage.push(n);
    },
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
  };
  const registry = new EffectRegistry();
  registry.register(100, (scope) => new DamageEffectHandler().handle(scope));
  let rank = 0;
  const port = {
    playerSpellRank: async (): Promise<number | undefined> => 1,
    spellLevel: async (_id: number, level: number) => {
      rank = level;
      return spell;
    },
  };
  const casts = new CastSpellUseCase(
    { bySession: () => fight },
    port,
    registry,
    emitter
  );
  return {
    fight,
    caster,
    target,
    active,
    spell,
    map,
    casts,
    damage,
    port,
    effects: registry,
    rank: () => rank,
  };
}

describe("close combat", () => {
  // Spell 0 is never in `player_spells`: 1.29 builds it from the
  // equipped item every time the bar redraws. Routing it through
  // `playerSpellRank` would refuse a swing that is perfectly legal, so
  // this is the case that pins the branch.
  test("resolves a swing the player never learned", async () => {
    const h = harness();
    const swing: SpellLevel = { ...h.spell, spellId: 0, apCost: 4 };
    let rankAsked = false;

    h.port.playerSpellRank = async () => {
      rankAsked = true;
      return undefined;
    };
    (h.port as { closeCombatSpell?: () => Promise<unknown> }).closeCombatSpell =
      async () => ({
        spell: swing,
        weaponTemplateId: 88,
        name: "Petit Arc de Boisaille",
        description: "",
      });

    const resolution = await h.casts.resolve("player", "0;230");

    expect(rankAsked).toBe(false);
    expect(resolution.spell.apCost).toBe(4);
    expect(resolution.closeCombat?.weaponTemplateId).toBe(88);

    h.casts.apply(resolution);
    expect(h.damage).toEqual([30]);
  });

  test("refuses when nothing can answer for the weapon", async () => {
    const h = harness();

    await expect(h.casts.resolve("player", "0;230")).rejects.toThrow(
      "Vous ne pouvez pas frapper."
    );
  });
});

describe("authoritative casting", () => {
  test("ignores a forged rank and resolves death once", async () => {
    const h = harness();
    const resolution = await h.casts.resolve("player", "1;230;6");
    expect(h.rank()).toBe(1);
    expect(h.caster.ap).toBe(6);
    h.casts.apply(resolution);
    expect(h.caster.ap).toBe(3);
    expect(h.target.dead).toBe(true);
    expect(h.map.isFree(230)).toBe(true);
    expect(h.damage).toEqual([30]);
    expect(h.fight.checkFightEnd().ended).toBe(true);
    expect(() => h.casts.apply(resolution)).toThrow("déjà résolue");
    expect(h.fight.spellUsage.canCast(1, 1, 2, 0, 1)).toBe(false);
  });
  test("refuses unlearned, unaffordable and incomplete spells before spending AP", async () => {
    const h = harness();
    h.port.playerSpellRank = async () => undefined;
    await expect(h.casts.resolve("player", "1;230")).rejects.toMatchObject({
      code: "no_spell",
    });
    h.port.playerSpellRank = async () => 1;
    h.caster.ap = 2;
    await expect(h.casts.resolve("player", "1;230")).rejects.toMatchObject({
      code: "no_ap",
    });
    h.caster.ap = 6;
    const baseEffect = h.spell.effects[0];
    if (!baseEffect) {
      throw new Error("Missing fixture damage effect");
    }
    h.spell.criticalEffects = [{ ...baseEffect, id: 181 }];
    await expect(h.casts.resolve("player", "1;230")).rejects.toMatchObject({
      code: "unsupported_spell",
    });
    expect(h.caster.ap).toBe(6);
    expect(h.target.lp).toBe(30);
  });
  test("checks walls, minimum range, line casting and empty cells", async () => {
    const h = harness();
    h.map.setSightBlockedCells([215]);
    await expect(h.casts.resolve("player", "1;230")).rejects.toMatchObject({
      code: "no_los",
    });
    h.map.setSightBlockedCells([]);
    h.spell.rangeMin = 3;
    await expect(h.casts.resolve("player", "1;230")).rejects.toMatchObject({
      code: "out_of_range",
    });
    h.spell.rangeMin = 1;
    h.spell.lineOnly = true;
    await expect(h.casts.resolve("player", "1;201")).rejects.toMatchObject({
      code: "not_in_line",
    });
    h.spell.emptyCell = true;
    await expect(h.casts.resolve("player", "1;230")).rejects.toMatchObject({
      code: "occupied_cell",
    });
  });
  test("range bonuses apply only to modifiable spells", async () => {
    const h = harness({ rangeMax: 1 });
    h.caster.stats.addBuff(Characteristic.Range, 1);
    await expect(h.casts.resolve("player", "1;230")).rejects.toMatchObject({
      code: "out_of_range",
    });
    h.spell.modifiableRange = true;
    expect((await h.casts.resolve("player", "1;230")).targetCell).toBe(230);
  });
  test("checks required states and cooldowns in owner turns", async () => {
    const h = harness({ requiredStates: [FightStateId.Rooted] });
    await expect(h.casts.resolve("player", "1;230")).rejects.toMatchObject({
      code: "required_state",
    });
    h.spell.requiredStates = [];
    h.spell.castPerTurn = 1;
    h.fight.spellUsage.recordCast(1, 1, 9, 2);
    await expect(h.casts.resolve("player", "1;230")).rejects.toMatchObject({
      code: "cooldown",
    });
    h.fight.spellUsage.resetTurn(1);
    await expect(h.casts.resolve("player", "1;230")).rejects.toMatchObject({
      code: "cooldown",
    });
    h.fight.spellUsage.resetTurn(1);
    expect((await h.casts.resolve("player", "1;230")).level).toBe(1);
  });
  test("revalidates after asynchronous loading and turn changes", async () => {
    const h = harness();
    const resolution = await h.casts.resolve("player", "1;230");
    h.fight.turnEpoch++;
    h.active.turnList.advance();
    expect(() => h.casts.apply(resolution)).toThrow("votre tour");
    await expect(
      h.casts.resolveFor(h.fight, h.caster, 1, 230, 1)
    ).rejects.toMatchObject({ code: "not_your_turn" });
    expect(h.caster.ap).toBe(6);
    expect(h.target.lp).toBe(30);
  });
  test("serializes actions and recovers from rejection", async () => {
    const h = harness();
    const trace: number[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = h.fight.runAction(async () => {
      trace.push(1);
      await gate;
      trace.push(2);
      throw new Error("refused");
    });
    const failure = first.catch((error: unknown) => error);
    const second = h.fight.runAction(() => {
      trace.push(3);
    });
    await Promise.resolve();
    expect(trace).toEqual([1]);
    release();
    expect(await failure).toBeInstanceOf(Error);
    await second;
    expect(trace).toEqual([1, 2, 3]);
  });
});

test("Ready starts one runner; validated spells emit launch before damage and finish", async () => {
  const h = harness();
  const sent: DofusMessage[] = [];
  let ends = 0;
  const registry = new FightRegistryService();
  const module = await Test.createTestingModule({
    providers: [
      FightPlacementHandler,
      FightTurnHandler,
      FightActionsService,
      FightLifecycleService,
      FightFrameEmitter,
      { provide: FightRegistryService, useValue: registry },
      {
        provide: GatewayFrameService,
        useValue: {
          broadcast: (_targets: string[], message: DofusMessage) => {
            sent.push(message);
          },
        },
      },
      { provide: SpellsService, useValue: h.port },
      { provide: EffectRegistry, useValue: h.effects },
      { provide: SessionRegistry, useValue: {} },
      {
        provide: PlayerPresenceService,
        useValue: { getByCharacter: () => undefined },
      },
      {
        provide: FightEndService,
        useValue: {
          endFight: async () => {
            ends++;
            h.fight.ending = true;
            registry.remove(h.fight.id);
          },
        },
      },
      // Only the combat log reads the name off the launch frame, so an
      // empty bundle is all these cases need.
      { provide: LangsService, useValue: { getSpellSync: () => undefined } },
    ],
  }).compile();
  try {
    h.fight.transition(new PlacementState());
    h.target.ready = true;
    registry.add(h.fight);
    const ready = module.get(FightPlacementHandler),
      turn = module.get(FightTurnHandler);
    ready.handleSetReady(
      { sessionId: "player" },
      create(GameSetReadySchema, { ready: true })
    );
    ready.handleSetReady(
      { sessionId: "player" },
      create(GameSetReadySchema, { ready: true })
    );
    expect(
      sent.filter((m) => m.payload.case === "gameStartToPlay")
    ).toHaveLength(1);
    await turn.handleAction(
      { sessionId: "player" },
      create(GameActionRequestSchema, { actionType: 300, params: "1;230;6" })
    );
    const actions = sent.flatMap((m) =>
      m.payload.case === "gameAction" ? [m.payload.value.actionData.case] : []
    );
    expect(actions.indexOf("spellLaunch")).toBeLessThan(
      actions.indexOf("damage")
    );
    expect(actions).toContain("death");
    expect(actions).toContain("apChange");
    expect(sent.some((m) => m.payload.case === "gameTurnMiddle")).toBe(true);
    expect(
      sent.some(
        (m) =>
          m.payload.case === "gameActionsFinish" &&
          m.payload.value.actionResultId === 1
      )
    ).toBe(true);
    expect(ends).toBe(1);
    await turn.handleTurnEnd(
      { sessionId: "player" },
      create(GameTurnEndSchema, {})
    );
    expect(ends).toBe(1);
    expect(registry.getRunner(h.fight.id)).toBeUndefined();
  } finally {
    registry.remove(h.fight.id);
    await module.close();
  }
});

test.each(["placement", "active"])(
  "disconnect ends a %s fight once and frees its timer",
  async (phase) => {
    const h = harness();
    const registry = new FightRegistryService();
    let ends = 0;
    const module = await Test.createTestingModule({
      providers: [
        FightActionsService,
        FightFrameEmitter,
        { provide: FightRegistryService, useValue: registry },
        { provide: GatewayFrameService, useValue: { broadcast: () => {} } },
        { provide: SpellsService, useValue: h.port },
        { provide: EffectRegistry, useValue: h.effects },
        {
          provide: FightEndService,
          useValue: {
            endFight: async () => {
              ends++;
              h.fight.ending = true;
              registry.remove(h.fight.id);
            },
          },
        },
        { provide: LangsService, useValue: { getSpellSync: () => undefined } },
      ],
    }).compile();
    try {
      if (phase === "placement") {
        h.fight.transition(new PlacementState());
      }
      registry.add(h.fight);
      const actions = module.get(FightActionsService);
      await actions.onSessionClosed({ session: { sessionId: "player" } });
      await actions.onSessionClosed({ session: { sessionId: "player" } });
      expect(h.caster.dead).toBe(true);
      expect(h.fight.fightMap.occupantOf(h.caster.cell)).toBeUndefined();
      expect(registry.isInFight("player")).toBe(false);
      expect(ends).toBe(1);
    } finally {
      registry.remove(h.fight.id);
      await module.close();
    }
  }
);
