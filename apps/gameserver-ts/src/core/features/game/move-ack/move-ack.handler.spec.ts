import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import { create } from "@bufbuild/protobuf";
import { GameActionAckSchema } from "@dofus/proto/game_pb";
import { FightRegistryService } from "@modules/fight/registry/fight.registry";
import { PendingMovesService } from "@modules/player-presence/player-presence.pending-moves.service";

import { MoveAckHandler } from "./move-ack.handler";

/**
 * A late ack must not take the live move down with it.
 *
 * The client acks a walk when its animation ends, which can be after it
 * has already asked for another one — the two cross on the wire. The ack
 * handler used to `take` (get-and-delete) the pending move before
 * comparing the ids, so the stale ack deleted the move the player was
 * actually waiting on: nothing was ever committed, the server kept the
 * position the walk started from, and every later click came back
 * `not_adjacent`. The character was frozen until the next map load.
 */
function handlerWith(pending: PendingMovesService): MoveAckHandler {
  return new MoveAckHandler(
    {} as never, // players
    pending,
    {} as never, // presence
    {} as never, // maps
    {} as never, // mapCache
    {} as never, // scripts
    {} as never, // transition
    {} as never, // frames
    {} as never, // mapMonsters
    {} as never, // fightStart
    new FightRegistryService()
  );
}

describe("MoveAckHandler — stale ack", () => {
  test("an ack for a superseded action leaves the pending move alone", async () => {
    const pending = new PendingMovesService();

    pending.set({
      sessionId: "session-1",
      characterId: "char-1",
      actionId: 32,
      mapId: 7369,
      endCell: 345,
      endDirection: 1,
    });

    await handlerWith(pending).handle(
      { sessionId: "session-1" } as never,
      create(GameActionAckSchema, { actionId: 31, isAck: true })
    );

    expect(pending.peek("session-1")?.actionId).toBe(32);
  });

  test("an ack with nothing pending is a no-op, not a throw", async () => {
    const pending = new PendingMovesService();

    await handlerWith(pending).handle(
      { sessionId: "session-1" } as never,
      create(GameActionAckSchema, { actionId: 31, isAck: true })
    );

    expect(pending.peek("session-1")).toBeUndefined();
  });
});
