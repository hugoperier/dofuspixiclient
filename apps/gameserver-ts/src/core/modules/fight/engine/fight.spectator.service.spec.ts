import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import type { DofusMessage } from "@dofus/proto/server_messages_pb";
import type { MapMonsterService } from "@modules/monsters/map-monster.service";
import type { PlayerPresenceService } from "@modules/player-presence/player-presence.service";
import type { GatewayFrameService } from "@shared/gateway-adapter/gateway-frame.service";
import { SpriteMovementEntry_Operation } from "@dofus/proto/game_pb";
import { Fight } from "@modules/fight/core/fight.entity";
import { Fighter } from "@modules/fight/core/fight.fighter";
import { PlacementState } from "@modules/fight/core/fight.states";
import { FighterKind, FightType, TeamSide } from "@modules/fight/fight.types";
import { FightMap } from "@modules/fight/map/fight.map";

import { FightSpectatorService } from "./fight.spectator.service";

const ENGAGED_GROUP = 42;
const OTHER_GROUP = 43;

interface Sent {
  targets: string[];
  message: DofusMessage;
}

function setup() {
  const fight = new Fight(
    FightType.PvM,
    1,
    new FightMap(15, 17, [100], [200]),
    [
      { side: TeamSide.Side0, leaderId: 1 },
      { side: TeamSide.Side1, leaderId: ENGAGED_GROUP },
    ]
  );
  const player = new Fighter(1, FighterKind.Player, "Dev", 50, 6, 3, 1);
  player.sessionId = "s1";
  fight.teams[0].add(player);
  fight.teams[1].add(
    new Fighter(-1_000_000, FighterKind.Monster, "Piou", 10, 2, 3, 1)
  );
  fight.transition(new PlacementState());

  const sent: Sent[] = [];
  const frames = {
    broadcast: (targets: string[], message: DofusMessage) =>
      sent.push({ targets, message }),
  } as unknown as GatewayFrameService;
  const presence = {
    onMap: () => [
      { sessionId: "s1", characterId: "1", accessories: [] },
      { sessionId: "s2", characterId: "7", accessories: [] },
    ],
  } as unknown as PlayerPresenceService;
  const monsters = {
    groupsOnMap: () => [{ id: OTHER_GROUP }],
  } as unknown as MapMonsterService;
  const service = new FightSpectatorService(
    {} as never,
    frames,
    presence,
    {} as never,
    monsters
  );
  return { fight, player, sent, service };
}

function movements(sent: Sent[]) {
  return sent.flatMap(({ targets, message }) =>
    message.payload.case === "gameMovement"
      ? [{ targets, entries: message.payload.value.entries }]
      : []
  );
}

describe("FightSpectatorService.sendInitial", () => {
  test("clears the exploration sprites before the fighters arrive", () => {
    const { fight, player, sent, service } = setup();

    service.sendInitial(fight, "s1", player);

    const [hide, join] = movements(sent);
    expect(hide?.targets).toEqual(["s1"]);
    expect(
      hide?.entries.every(
        (e) => e.operation === SpriteMovementEntry_Operation.REMOVE
      )
    ).toBe(true);
    expect(hide?.entries.map((e) => e.spriteId).sort()).toEqual(
      [String(ENGAGED_GROUP), String(OTHER_GROUP), "7"].sort()
    );
    expect(join?.entries.map((e) => e.spriteId).sort()).toEqual(
      ["-1000000", "1"].sort()
    );
  });

  test("keeps the viewer's own sprite", () => {
    const { fight, player, sent, service } = setup();

    service.sendInitial(fight, "s1", player);

    const [hide] = movements(sent);
    expect(hide?.entries.map((e) => e.spriteId)).not.toContain("1");
  });
});
