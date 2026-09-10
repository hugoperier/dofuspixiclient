import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";

import type { DofusMessage } from "@dofus/proto/server_messages_pb";
import { Test, type TestingModule } from "@nestjs/testing";
import { GatewayFrameService } from "@shared/gateway-adapter/gateway-frame.service";

import { LangsService } from "../../langs/langs.service";
import { combatCatalog } from "../../spells/combat-catalog";
import { SpellsService } from "../../spells/spells.service";
import { ActiveState } from "../core/fight.active-state";
import { combatHarness, combatRegistry } from "../effects/combat-test-harness";
import { EffectRegistry } from "../effects/fight.effect-registry";
import { FightRegistryService } from "../registry/fight.registry";
import { FightActionsService } from "./fight.actions.service";
import { FightEndService } from "./fight.end.service";
import { FightFrameEmitter } from "./fight.frame-emitter";

const sent: Array<{ targets: string[]; message: DofusMessage }> = [];
let module: TestingModule;
let emitter: FightFrameEmitter;
let actions: FightActionsService;
beforeAll(async () => {
  module = await Test.createTestingModule({
    providers: [
      FightActionsService,
      FightFrameEmitter,
      {
        provide: GatewayFrameService,
        useValue: {
          broadcast: (targets: string[], message: DofusMessage) =>
            sent.push({ targets, message }),
        },
      },
      { provide: FightRegistryService, useValue: new FightRegistryService() },
      {
        provide: SpellsService,
        useValue: {
          spellLevel: async (id: number, rank: number) =>
            combatCatalog.levels[`${id}:${rank}`],
          summonTemplate: async (id: number, grade: number) =>
            combatCatalog.summons[`${id}:${grade}`],
        },
      },
      { provide: EffectRegistry, useValue: combatRegistry() },
      { provide: FightEndService, useValue: { endFight: async () => {} } },
      // Names the spell on the launch frame; the log text is the
      // only thing that reads it, so an empty bundle is enough here.
      { provide: LangsService, useValue: { getSpellSync: () => undefined } },
    ],
  }).compile();
  emitter = module.get(FightFrameEmitter);
  actions = module.get(FightActionsService);
});
beforeEach(() => {
  sent.length = 0;
});
afterAll(async () => {
  await module.close();
});
const packets = (session: string) =>
  sent.filter((p) => p.targets.includes(session)).map((p) => p.message.payload);

test("hidden movement, teleportation and delayed impact positions only reach their team", () => {
  const h = combatHarness();
  h.caster.invisible = true;
  emitter.emitVisibility(h.fight, h.caster);
  emitter.emitMovement(h.fight, h.caster.id, [600, 625]);
  emitter.emitTeleport(h.fight, h.caster.id, 600, 625);
  emitter.emitGlyphTrigger(h.fight, h.caster.id, 625, 1679, 0, 6, h.caster.id);
  for (const session of ["caster", "ally"]) {
    const data = packets(session).flatMap((p) =>
      p.case === "gameAction" ? [p.value.actionData] : []
    );
    expect(data.map((d) => d.case)).toEqual([
      "invisibility",
      "movement",
      "spritePosition",
      "glyph",
    ]);
    const visibility = data[0];
    expect(
      visibility?.case === "invisibility" && visibility.value.visibility
    ).toBe(1);
  }
  const enemy = packets("enemy");
  expect(enemy).toHaveLength(1);
  const action = enemy[0];
  expect(
    action?.case === "gameAction" &&
      action.value.actionData.case === "invisibility" &&
      action.value.actionData.value.visibility
  ).toBe(2);
});

test("GTM masks an invisible position even after its last known cell changes", () => {
  const h = combatHarness();
  h.caster.invisible = true;
  h.caster.cell = 625;
  actions.snapshot(h.fight);
  for (const session of ["caster", "ally", "enemy"]) {
    const packet = packets(session)[0];
    if (packet?.case !== "gameTurnMiddle") {
      throw new Error("Missing GTM");
    }
    const caster = packet.value.entries.find((f) => f.spriteId === "1");
    expect(caster?.cellNum).toBe(session === "enemy" ? -1 : 625);
    expect(caster?.hidden).toBe(session === "enemy");
  }
});

test("revelation sends the current position to every recipient", () => {
  const h = combatHarness();
  h.caster.cell = 675;
  h.caster.invisible = false;
  emitter.emitVisibility(h.fight, h.caster);
  for (const session of ["caster", "ally", "enemy"]) {
    const positions = packets(session).flatMap((p) =>
      p.case === "gameAction" && p.value.actionData.case === "spritePosition"
        ? [p.value.actionData.value.cellId]
        : []
    );
    expect(positions).toEqual([675]);
  }
});

test("trap creation and removal do not disclose their cell to opponents", () => {
  const h = combatHarness();
  emitter.emitTrapAdd(h.fight, h.caster.id, 625, 1, 123, 0);
  emitter.emitTrapRemove(h.fight, 625);
  expect(packets("enemy")).toHaveLength(0);
  expect(packets("caster").map((p) => p.case)).toEqual([
    "gameZoneData",
    "gameZoneData",
  ]);
  expect(packets("ally")).toHaveLength(2);
});

test("a trap launch hides the target cell even when its caster is visible", async () => {
  const h = combatHarness(65, 6);
  if (!(h.fight.state instanceof ActiveState)) {
    throw new Error("Fight not active");
  }
  h.fight.state.turnList.advance();
  h.fight.turnOpen = true;
  await actions.castFor(h.fight, h.caster, 65, 625, 6, h.fight.turnEpoch);
  for (const session of ["caster", "ally", "enemy"]) {
    const launches = packets(session).flatMap((p) =>
      p.case === "gameAction" && p.value.actionData.case === "spellLaunch"
        ? [p.value.actionData.value.cellId]
        : []
    );
    expect(launches).toEqual([session === "enemy" ? -1 : 625]);
  }
});
