import "reflect-metadata";

import { expect, test } from "bun:test";

import type { DofusMessage } from "@dofus/proto/server_messages_pb";
import type { Fight } from "@modules/fight/core/fight.entity";
import type { GatewayFrameService } from "@shared/gateway-adapter/gateway-frame.service";

import { FightFrameEmitter } from "./fight.frame-emitter";

function harness() {
  const sent: DofusMessage[] = [];
  const frames = {
    broadcast: (_targets: string[], message: DofusMessage) => {
      sent.push(message);
    },
  } as unknown as GatewayFrameService;
  const fight = {
    allSessions: () => ["session-1"],
    fighters: () => [],
  } as unknown as Fight;

  return { sent, emitter: new FightFrameEmitter(frames), fight };
}

function apChange(message: DofusMessage) {
  if (message.payload.case !== "gameAction") {
    throw new Error("not a gameAction frame");
  }

  const { actionData } = message.payload.value;

  if (actionData.case !== "apChange") {
    throw new Error("not an apChange frame");
  }

  return actionData.value;
}

function mpChange(message: DofusMessage) {
  if (message.payload.case !== "gameAction") {
    throw new Error("not a gameAction frame");
  }

  const { actionData } = message.payload.value;

  if (actionData.case !== "mpChange") {
    throw new Error("not an mpChange frame");
  }

  return actionData.value;
}

test("an AP loss is not a cost unless the caller says so", () => {
  const { sent, emitter, fight } = harness();

  emitter.emitAPLoss(fight, 1, 2, 2);

  expect(apChange(sent[0] as DofusMessage).cost).toBe(false);
  expect(apChange(sent[0] as DofusMessage).delta).toBe(-2);
});

test("the AP a caster spends on its own action is marked as a cost", () => {
  const { sent, emitter, fight } = harness();

  emitter.emitAPLoss(fight, 1, 1, 4, true);

  expect(apChange(sent[0] as DofusMessage).cost).toBe(true);
});

test("MP carries the same distinction", () => {
  const { sent, emitter, fight } = harness();

  emitter.emitMPLoss(fight, 1, 2, 3);
  emitter.emitMPLoss(fight, 1, 1, 1, true);

  expect(mpChange(sent[0] as DofusMessage).cost).toBe(false);
  expect(mpChange(sent[1] as DofusMessage).cost).toBe(true);
});
