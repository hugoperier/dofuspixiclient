import { expect, spyOn, test } from "bun:test";

import { create } from "@bufbuild/protobuf";
import {
  FightResultSchema,
  GameEndSchema,
  GameJoinSchema,
  GameTurnFinishSchema,
  GameTurnStartSchema,
} from "@dofus/proto/game_pb";
import { createActor } from "xstate";

import { fightMachine } from "./fight.machine";

test("placement, authoritative turn and result survive animation drain, then reset", () => {
  const actor = createActor(fightMachine).start();
  actor.send({
    type: "FIGHT_INIT",
    payload: create(GameJoinSchema, { timerMs: 45000 }),
    mySpriteId: "1",
    fightId: 42,
  });
  expect(actor.getSnapshot().matches("placement")).toBe(true);
  expect(actor.getSnapshot().context.deadline).toBeGreaterThan(Date.now());
  actor.send({ type: "STATS_UPDATE", ap: 6, mp: 3, maxAp: 6, maxMp: 3 });
  expect(actor.getSnapshot().context.ap).toBe(6);
  expect(actor.getSnapshot().context.mp).toBe(3);
  actor.send({ type: "FIGHT_START" });
  actor.send({
    type: "TURN_START",
    payload: create(GameTurnStartSchema, {
      spriteId: "1",
      timeMs: 30000,
      tableTurnNum: 2,
    }),
  });
  expect(actor.getSnapshot().matches({ fighting: "myTurn" })).toBe(true);
  actor.send({ type: "STATS_UPDATE", ap: 3, mp: 1 });
  actor.send({ type: "ACTION_PENDING", pending: true });
  expect(actor.getSnapshot().context.ap).toBe(3);
  actor.send({ type: "FINISHING" });
  expect(actor.getSnapshot().context.finishing).toBe(true);
  expect(actor.getSnapshot().context.deadline).toBe(0);
  expect(actor.getSnapshot().context.turnDurationMs).toBe(0);
  const result = create(GameEndSchema, {
    winnerTeam: 0,
    durationMs: 12000,
    results: [
      create(FightResultSchema, { name: "Player", xpWon: 123n, kamaWon: 7n }),
    ],
  });
  actor.send({ type: "FIGHT_END", payload: result });
  expect(actor.getSnapshot().matches("ended")).toBe(true);
  expect(actor.getSnapshot().context.result?.results[0]?.xpWon).toBe(123n);
  expect(actor.getSnapshot().context.actionPending).toBe(false);
  actor.send({
    type: "FIGHT_INIT",
    payload: create(GameJoinSchema, {}),
    fightId: 43,
    mySpriteId: "1",
  });
  expect(actor.getSnapshot().context.result).toBeNull();
  expect(actor.getSnapshot().context.ap).toBe(0);
  expect(actor.getSnapshot().context.turnDurationMs).toBe(0);
  expect(actor.getSnapshot().context.fighters.size).toBe(0);
  actor.stop();
});

test("turn clock resets on early pass and follows the next fighter's duration", () => {
  const now = spyOn(Date, "now").mockReturnValue(1_000);
  const actor = createActor(fightMachine).start();
  try {
    actor.send({
      type: "FIGHT_INIT",
      payload: create(GameJoinSchema, { timerMs: 45_000 }),
      mySpriteId: "1",
    });
    expect(actor.getSnapshot().context.deadline).toBe(46_000);
    expect(actor.getSnapshot().context.turnDurationMs).toBe(0);
    actor.send({ type: "FIGHT_START" });
    expect(actor.getSnapshot().context.deadline).toBe(0);
    actor.send({
      type: "TURN_START",
      payload: create(GameTurnStartSchema, { spriteId: "1", timeMs: 12_000 }),
    });
    expect(actor.getSnapshot().context.deadline).toBe(13_000);
    expect(actor.getSnapshot().context.turnDurationMs).toBe(12_000);

    now.mockReturnValue(7_000);
    actor.send({
      type: "TURN_END",
      payload: create(GameTurnFinishSchema, { spriteId: "1" }),
    });
    expect(actor.getSnapshot().matches({ fighting: "waitingForTurn" })).toBe(
      true
    );
    expect(actor.getSnapshot().context.deadline).toBe(0);
    expect(actor.getSnapshot().context.turnDurationMs).toBe(0);
    actor.send({
      type: "TURN_START",
      payload: create(GameTurnStartSchema, { spriteId: "-1", timeMs: 20_000 }),
    });
    expect(actor.getSnapshot().matches({ fighting: "opponentTurn" })).toBe(
      true
    );
    expect(actor.getSnapshot().context.deadline).toBe(27_000);
    expect(actor.getSnapshot().context.turnDurationMs).toBe(20_000);

    // The client cannot advance the authoritative turn when its clock expires.
    now.mockReturnValue(28_000);
    expect(actor.getSnapshot().matches({ fighting: "opponentTurn" })).toBe(
      true
    );
    actor.send({ type: "LEAVE" });
    expect(actor.getSnapshot().context.deadline).toBe(0);
    expect(actor.getSnapshot().context.turnDurationMs).toBe(0);
  } finally {
    actor.stop();
    now.mockRestore();
  }
});

test("spectator turn clocks stop on TURN_END and on the result", () => {
  const actor = createActor(fightMachine).start();
  actor.send({
    type: "FIGHT_SPECTATE_INIT",
    payload: create(GameJoinSchema, {}),
  });
  const turn = create(GameTurnStartSchema, { spriteId: "-1", timeMs: 30_000 });
  actor.send({ type: "TURN_START", payload: turn });
  expect(actor.getSnapshot().context.turnDurationMs).toBe(30_000);
  actor.send({
    type: "TURN_END",
    payload: create(GameTurnFinishSchema, { spriteId: "-1" }),
  });
  expect(actor.getSnapshot().context.deadline).toBe(0);
  expect(actor.getSnapshot().context.turnDurationMs).toBe(0);
  actor.send({ type: "TURN_START", payload: turn });
  actor.send({ type: "FIGHT_END", payload: create(GameEndSchema, {}) });
  expect(actor.getSnapshot().context.deadline).toBe(0);
  expect(actor.getSnapshot().context.turnDurationMs).toBe(0);
  actor.stop();
});
