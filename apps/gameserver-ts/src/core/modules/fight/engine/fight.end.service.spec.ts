import { expect, test } from "bun:test";

import type { DofusMessage } from "@dofus/proto/server_messages_pb";
import { FightChallenge } from "@modules/fight/challenges/fight.challenge.base";
import { Fight } from "@modules/fight/core/fight.entity";
import { Fighter } from "@modules/fight/core/fight.fighter";
import { FighterKind, FightType, TeamSide } from "@modules/fight/fight.types";
import { FightMap } from "@modules/fight/map/fight.map";
import { FightRegistryService } from "@modules/fight/registry/fight.registry";
import { InventoryFramesService } from "@modules/inventory/inventory.frames.service";
import { InventoryRepository } from "@modules/inventory/inventory.repository";
import { JobsRepository } from "@modules/jobs/jobs.repository";
import { JobsService } from "@modules/jobs/jobs.service";
import { MapTransitionService } from "@modules/maps/maps.transition.service";
import { MapMonsterService } from "@modules/monsters/map-monster.service";
import { MonstersRepository } from "@modules/monsters/monsters.repository";
import { PlayerPresenceService } from "@modules/player-presence/player-presence.service";
import { PlayersProgressionService } from "@modules/players/players.progression.service";
import { PlayersRepository } from "@modules/players/players.repository";
import { SpellsService } from "@modules/spells/spells.service";
import { StatsService } from "@modules/stats/stats.service";
import { Test } from "@nestjs/testing";
import { TransactionHost } from "@nestjs-cls/transactional";
import { GatewayFrameService } from "@shared/gateway-adapter/gateway-frame.service";

import { FightEndService } from "./fight.end.service";
import { FightHistoryRepository } from "./fight.history.repository";

async function harness(failCommit = false) {
  const trace: string[] = [];
  const messages: DofusMessage[] = [];
  const registry = new FightRegistryService();
  const fight = new Fight(
    FightType.PvM,
    1,
    new FightMap(15, 17, [200], [230]),
    [
      { side: TeamSide.Side0, leaderId: 1 },
      { side: TeamSide.Side1, leaderId: 2 },
    ]
  );
  const player = Fighter.fromPlayer("player", {
    id: 1,
    name: "Player",
    level: 1,
    life: 57,
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
  });
  const monster = new Fighter(2, FighterKind.Monster, "Piou", 18, 2, 3, 3);
  monster.monsterTemplateId = 42;
  monster.monsterXp = 100;
  monster.monsterKamasMin = 10;
  monster.monsterKamasMax = 10;
  monster.setLp(0);
  fight.teams[0].add(player);
  fight.teams[1].add(monster);
  registry.add(fight);
  const module = await Test.createTestingModule({
    providers: [
      FightEndService,
      { provide: FightRegistryService, useValue: registry },
      {
        provide: GatewayFrameService,
        useValue: {
          broadcast: (_targets: string[], message: DofusMessage) => {
            messages.push(message);
            trace.push(message.payload.case ?? "frame");
          },
        },
      },
      {
        provide: FightHistoryRepository,
        useValue: {
          insertHistory: async () => {
            trace.push("history");
            return { id: "1" };
          },
          insertParticipant: async () => {},
        },
      },
      {
        provide: PlayersRepository,
        useValue: {
          setLife: async () => {},
          findById: async () => {
            trace.push("xp-snapshot");
            return { level: 3, experience: "110" };
          },
          addXpAndKamas: async () => {
            trace.push("reward");
          },
        },
      },
      {
        provide: PlayersProgressionService,
        useValue: { applyExperience: async () => null },
      },
      { provide: SpellsService, useValue: {} },
      {
        provide: StatsService,
        useValue: {
          sendStats: async () => {
            trace.push("stats");
          },
        },
      },
      {
        provide: PlayerPresenceService,
        useValue: { getByCharacter: () => undefined },
      },
      { provide: MapTransitionService, useValue: {} },
      { provide: MapMonsterService, useValue: {} },
      {
        provide: MonstersRepository,
        useValue: {
          dropsFor: async () => [
            {
              monsterId: 42,
              itemTemplateId: 287,
              itemType: 15,
              rate: 100,
              minQuantity: 1,
              maxQuantity: 1,
            },
          ],
        },
      },
      {
        provide: InventoryRepository,
        useValue: {
          findTemplate: async () => ({ effects: "" }),
          insertItem: async () => ({ id: "88", templateId: 287 }),
        },
      },
      {
        provide: InventoryFramesService,
        useValue: {
          sendItemAdd: () => {
            trace.push("item");
          },
          sendTemplateFor: async (_session: string, id: number) => {
            trace.push(`template:${id}`);
          },
        },
      },
      {
        provide: JobsRepository,
        useValue: { findPlayerJob: async () => undefined },
      },
      { provide: JobsService, useValue: {} },
      {
        provide: TransactionHost,
        useValue: {
          withTransaction: async (work: () => Promise<void>) => {
            await work();
            if (failCommit) {
              throw new Error("commit failed");
            }
            trace.push("commit");
          },
        },
      },
    ],
  }).compile();
  return {
    fight,
    registry,
    module,
    trace,
    messages,
    end: module.get(FightEndService),
  };
}

test("result is persisted once; loot templates precede GE and stats refresh without a level-up", async () => {
  const h = await harness();
  try {
    await Promise.all([h.end.endFight(h.fight), h.end.endFight(h.fight)]);
    expect(h.trace.filter((entry) => entry === "reward")).toHaveLength(1);
    expect(h.trace.indexOf("commit")).toBeLessThan(h.trace.indexOf("item"));
    expect(h.trace.indexOf("template:287")).toBeLessThan(
      h.trace.indexOf("gameEnd")
    );
    expect(h.trace.filter((entry) => entry === "stats")).toHaveLength(1);
    const result = h.messages.find(
      (message) => message.payload.case === "gameEnd"
    );
    if (result?.payload.case !== "gameEnd") {
      throw new Error("Missing result");
    }
    expect(result.payload.value.winnerTeam).toBe(0);
    expect(result.payload.value.results[0]?.level).toBe(3);
    expect(result.payload.value.results[0]?.isPlayer).toBe(true);
    expect(result.payload.value.results[0]?.experience).toMatchObject({
      current: 110n,
      levelFloor: 90n,
      nextLevelFloor: 160n,
    });
    expect(result.payload.value.results[1]?.isPlayer).toBe(false);
    expect(result.payload.value.results[1]?.experience).toBeUndefined();
    expect(h.trace.indexOf("reward")).toBeLessThan(
      h.trace.indexOf("xp-snapshot")
    );
    expect(h.trace.indexOf("xp-snapshot")).toBeLessThan(
      h.trace.indexOf("commit")
    );
    expect(result.payload.value.results[0]?.xpWon).toBe(100n);
    expect(result.payload.value.results[0]?.kamaWon).toBe(10n);
    expect(result.payload.value.results[0]?.itemsWon[0]?.itemId).toBe(287);
    expect(h.registry.isInFight("player")).toBe(false);
  } finally {
    h.registry.remove(h.fight.id);
    await h.module.close();
  }
});

test("a rejected reward transaction never announces an item or result", async () => {
  const h = await harness(true);
  try {
    await expect(h.end.endFight(h.fight)).rejects.toThrow("commit failed");
    expect(h.trace).not.toContain("item");
    expect(h.messages).toHaveLength(0);
  } finally {
    h.registry.remove(h.fight.id);
    await h.module.close();
  }
});

class ResultChallenge extends FightChallenge {
  constructor(
    readonly challengeId: number,
    readonly challengeName: string
  ) {
    super();
  }
}

test("GE snapshots successful and failed challenges after resolution, once", async () => {
  const h = await harness();
  const success = new ResultChallenge(1, "Zombie");
  success.xpBonusPct = 25;
  success.dropBonusPct = 50;
  const failed = new ResultChallenge(2, "Statue");
  failed.fail(h.fight, null);
  h.fight.modules.add(success);
  h.fight.modules.add(failed);
  try {
    await h.end.endFight(h.fight);
    await h.end.endFight(h.fight);
    const endings = h.messages.filter(
      (message) => message.payload.case === "gameEnd"
    );
    expect(endings).toHaveLength(1);
    const message = endings[0];
    if (message?.payload.case !== "gameEnd") {
      throw new Error("Missing GE");
    }
    expect(message.payload.value.challenges).toMatchObject([
      {
        challengeId: 1,
        name: "Zombie",
        succeeded: true,
        xpBonusPct: 25,
        dropBonusPct: 50,
      },
      { challengeId: 2, name: "Statue", succeeded: false },
    ]);
    expect(message.payload.value.results[0]?.xpWon).toBe(125n);
  } finally {
    h.registry.remove(h.fight.id);
    await h.module.close();
  }
});
