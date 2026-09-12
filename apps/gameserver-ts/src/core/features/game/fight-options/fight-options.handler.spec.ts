import "reflect-metadata";

import { beforeEach, describe, expect, test } from "bun:test";

import type { DofusMessage } from "@dofus/proto/server_messages_pb";
import type { FightRegistryService } from "@modules/fight/registry/fight.registry";
import type { GatewayFrameService } from "@shared/gateway-adapter/gateway-frame.service";
import type { HandlerContext } from "@shared/gateway-adapter/ws-router";
import { create } from "@bufbuild/protobuf";
import { GameSetFlagSchema } from "@dofus/proto/game_pb";
import {
  FightBlockJoinRequestSchema,
  FightBlockSpectatorsRequestSchema,
  FightNeedHelpRequestSchema,
} from "@dofus/proto/misc_pb";
import { FightOptionsHandler } from "@features/game/fight-options/fight-options.handler";
import { ActiveState } from "@modules/fight/core/fight.active-state";
import { Fight } from "@modules/fight/core/fight.entity";
import { Fighter } from "@modules/fight/core/fight.fighter";
import { PlacementState } from "@modules/fight/core/fight.states";
import { FighterKind, FightType, TeamSide } from "@modules/fight/fight.types";
import { FightMap } from "@modules/fight/map/fight.map";

const WIDTH = 15;
const HEIGHT = 17;
const LEADER_SESSION = "sess-leader";
const ALLY_SESSION = "sess-ally";

interface Sent {
  targets: string[];
  message: DofusMessage;
}

let fight: Fight;
let sent: Sent[];
let handler: FightOptionsHandler;

/**
 * Two players on side 0 (the first of them the leader) plus one monster
 * on side 1, placed on a fully walkable map.
 */
beforeEach(() => {
  const cells = Array.from({ length: WIDTH * 2 * HEIGHT }, (_, i) => i);
  const fmap = new FightMap(WIDTH, HEIGHT, [100, 101], [200]);
  fmap.setWalkableCells(cells);
  fight = new Fight(FightType.PvM, 1, fmap, [
    { side: TeamSide.Side0, leaderId: 1 },
    { side: TeamSide.Side1, leaderId: -1 },
  ]);

  const leader = new Fighter(1, FighterKind.Player, "Leader", 50, 6, 3, 1);
  leader.sessionId = LEADER_SESSION;
  const ally = new Fighter(2, FighterKind.Player, "Ally", 50, 6, 3, 1);
  ally.sessionId = ALLY_SESSION;
  fight.teams[0].add(leader);
  fight.teams[0].add(ally);
  fight.teams[1].add(new Fighter(-1, FighterKind.Monster, "m", 50, 4, 2, 3));
  fight.transition(new PlacementState());

  sent = [];
  const frames = {
    broadcast: (targets: string[], message: DofusMessage) =>
      sent.push({ targets, message }),
  } as unknown as GatewayFrameService;
  const fights = {
    getBySession: (sessionId: string) =>
      fight.fighters().some((f) => f.sessionId === sessionId)
        ? fight
        : undefined,
  } as unknown as FightRegistryService;

  handler = new FightOptionsHandler(frames, fights);
});

const ctx = (sessionId: string): HandlerContext => ({ sessionId });

function lastOption(): { enabled: boolean; option: string; leaderId: number } {
  const frame = sent.at(-1)?.message;
  if (frame?.payload.case !== "gameFightOption") {
    throw new Error("last frame is not a gameFightOption");
  }
  return frame.payload.value;
}

describe("FightOptionsHandler", () => {
  test("the leader toggles an option and every participant hears it", () => {
    handler.handleNeedHelp(
      ctx(LEADER_SESSION),
      create(FightNeedHelpRequestSchema)
    );

    expect(fight.helpAllowed).toBe(true);
    expect(lastOption()).toMatchObject({
      enabled: true,
      option: "H",
      leaderId: 1,
    });
    expect(sent.at(-1)?.targets.sort()).toEqual(
      [ALLY_SESSION, LEADER_SESSION].sort()
    );

    handler.handleNeedHelp(
      ctx(LEADER_SESSION),
      create(FightNeedHelpRequestSchema)
    );
    expect(fight.helpAllowed).toBe(false);
    expect(lastOption().enabled).toBe(false);
  });

  test("a fighter who does not lead a team is ignored", () => {
    handler.handleBlockJoin(
      ctx(ALLY_SESSION),
      create(FightBlockJoinRequestSchema)
    );

    expect(fight.lockedTeam).toBe(false);
    expect(sent).toHaveLength(0);
  });

  test("locking is placement-only, blocking spectators is not", () => {
    fight.transition(new ActiveState());

    handler.handleBlockJoin(
      ctx(LEADER_SESSION),
      create(FightBlockJoinRequestSchema)
    );
    expect(fight.lockedTeam).toBe(false);
    expect(sent).toHaveLength(0);

    handler.handleBlockSpectators(
      ctx(LEADER_SESSION),
      create(FightBlockSpectatorsRequestSchema)
    );
    expect(fight.lockedSpectators).toBe(true);
    expect(lastOption().option).toBe("A");
  });

  test("a flag reaches only the sender's own team", () => {
    handler.handleSetFlag(
      ctx(ALLY_SESSION),
      create(GameSetFlagSchema, { cellId: 150 })
    );

    const frame = sent.at(-1);
    expect(frame?.targets.sort()).toEqual(
      [ALLY_SESSION, LEADER_SESSION].sort()
    );
    if (frame?.message.payload.case !== "gameFlag") {
      throw new Error("expected a gameFlag frame");
    }
    expect(frame.message.payload.value).toMatchObject({
      spriteId: "2",
      cellId: 150,
    });
  });

  test("a flag on a cell outside the map is dropped", () => {
    handler.handleSetFlag(
      ctx(ALLY_SESSION),
      create(GameSetFlagSchema, { cellId: 99999 })
    );

    expect(sent).toHaveLength(0);
  });
});
