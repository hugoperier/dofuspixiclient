import { afterEach, expect, test } from "bun:test";

import { create, fromBinary, type MessageInitShape } from "@bufbuild/protobuf";
import { ClientMessageSchema, DofusMessageSchema } from "@dofus/proto";

import type { AudioManager } from "../../audio/audio-manager";
import type { Battlefield } from "../../scene";
import type { Connection } from "../connection";
import type { CharacterHandler } from "./character.handler";
import { CombatPresentation } from "../../scene/fight/combat-presentation";
import { fightActor } from "../../stores/fight-store";
import { MessageHandler } from "../message-handler";
import { FightHandler } from "./fight.handler";
import { MapHandler } from "./map.handler";

const tick = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const handlers: FightHandler[] = [];
afterEach(() => {
  for (const handler of handlers.splice(0)) {
    handler.destroy();
  }
  fightActor.send({ type: "LEAVE" });
});

function setup(spectator = false) {
  fightActor.send({ type: "LEAVE" });
  const messages = new MessageHandler();
  const sent: Uint8Array[] = [];
  const connection = {
    send: (data: Uint8Array) => {
      sent.push(data);
      return true;
    },
  };
  const handler = new FightHandler(messages, connection, () => "1");
  handlers.push(handler);
  const queue = new CombatPresentation();
  handler.setCombatPresentation(queue);
  const send = (
    payload: MessageInitShape<typeof DofusMessageSchema>["payload"]
  ) => messages.handle(create(DofusMessageSchema, { payload }));
  send({ case: "gameJoin", value: { fightId: 42, isSpectator: spectator } });
  send({ case: "gameStartToPlay", value: {} });
  return { messages, sent, connection, handler, queue, send };
}

test("real fight/map handlers serialize GAS/GAF paths and acknowledge only their presentation", async () => {
  const { messages, queue, send, sent, connection } = setup();
  for (const id of [10, 20]) {
    fightActor.send({
      type: "FIGHTER_UPSERT",
      fighter: {
        spriteId: String(id),
        name: String(id),
        level: 1,
        team: 1,
        cell: id === 10 ? 200 : 300,
        hp: 100,
        maxHp: 100,
        ap: 6,
        maxAp: 6,
        mp: 3,
        maxMp: 3,
        gfxId: 10,
        dead: false,
        color1: -1,
        color2: -1,
        color3: -1,
      },
    });
  }
  const first = deferred();
  const moves: { id: number; path: number[] }[] = [];
  const battlefield = {
    moveWorldActor: async (id: number, path: number[]) => {
      moves.push({ id, path });
      if (id === 10) {
        await first.promise;
      }
    },
  } as unknown as Battlefield;
  const map = new MapHandler(
    messages,
    connection as Connection,
    {} as AudioManager,
    { getCurrentCharacter: () => ({ spriteId: "1" }) } as CharacterHandler,
    () => battlefield
  );
  map.setCombatPresentation(queue);
  for (const [actionId, id, paths] of [
    [
      1,
      10,
      [
        [200, 215],
        [215, 230],
        [230, 245],
      ],
    ],
    [2, 20, [[300, 315]]],
  ] as const) {
    send({
      case: "gameActionsStart",
      value: { actionId, fightId: 42, spriteId: String(id) },
    });
    for (const path of paths) {
      send({
        case: "gameAction",
        value: {
          actionType: 1,
          sequenceId: actionId,
          spriteId: String(id),
          actionData: { case: "movement", value: { pathCells: [...path] } },
        },
      });
    }
    send({
      case: "gameActionsFinish",
      value: { actionId, fightId: 42, spriteId: String(id) },
    });
  }
  send({
    case: "gameTurnReady",
    value: { fightId: 42, turnEpoch: 5, spriteId: "20" },
  });
  await tick();
  expect(moves).toEqual([{ id: 10, path: [200, 215, 230, 245] }]);
  expect(sent).toHaveLength(0);
  first.resolve();
  await queue.whenIdle();
  await tick();
  expect(moves).toEqual([
    { id: 10, path: [200, 215, 230, 245] },
    { id: 20, path: [300, 315] },
  ]);
  expect(
    sent.map((data) => fromBinary(ClientMessageSchema, data).payload)
  ).toMatchObject([
    { case: "gameTurnOk", value: { fightId: 42, turnEpoch: 5, spriteId: "1" } },
  ]);
});

test("an old combat cannot acknowledge or finish a newly joined combat", async () => {
  const { queue, handler, send, sent } = setup();
  const old = deferred();
  handler.setHandlers({ onFightEnd: () => old.promise });
  queue.enqueue(() => old.promise);
  send({ case: "gameTurnReady", value: { fightId: 42, turnEpoch: 5 } });
  send({ case: "gameEnd", value: {} });
  send({ case: "gameJoin", value: { fightId: 43 } });
  old.resolve();
  await tick();
  expect(sent).toHaveLength(0);
  expect(fightActor.getSnapshot().matches("placement")).toBe(true);
  expect(fightActor.getSnapshot().context.fightId).toBe(43);
});

test("spectators never participate in the turn barrier", async () => {
  const { send, sent } = setup(true);
  send({ case: "gameTurnReady", value: { fightId: 42, turnEpoch: 5 } });
  await tick();
  expect(sent).toHaveLength(0);
});

test("disconnect cancels an acknowledgement waiting for animation", async () => {
  const { handler, queue, send, sent } = setup();
  const move = deferred();
  queue.enqueue(() => move.promise);
  send({ case: "gameTurnReady", value: { fightId: 42, turnEpoch: 5 } });
  handler.cancelPresentation();
  move.resolve();
  await tick();
  expect(sent).toHaveLength(0);
  expect(queue.busy).toBe(false);
});

test.each(["sprite load", "movement"])(
  "a late %s cannot restore the previous map position",
  async (kind) => {
    const { messages, sent, send, connection } = setup();
    fightActor.send({ type: "LEAVE" });
    const waiting = deferred();
    const positions: number[][] = [];
    const battlefield = {
      addWorldActor: () => waiting.promise,
      moveWorldActor: () => waiting.promise,
      getWorldActorRenderer: () => null,
      setPathfinding() {},
      prepareWorldActors() {},
      loadMapFromData: async () => {},
      revealMap: async () => {},
    } as unknown as Battlefield;
    new MapHandler(
      messages,
      connection as Connection,
      {
        playMusic: async () => {},
        playEnvironment: async () => {},
      } as unknown as AudioManager,
      {
        getCurrentCharacter: () => ({ spriteId: "1" }),
        setMapPosition: (map: number, cell: number) =>
          positions.push([map, cell]),
      } as unknown as CharacterHandler,
      () => battlefield
    );
    if (kind === "sprite load") {
      send({
        case: "gameMovement",
        value: {
          entries: [
            { operation: 1, spriteId: "1", spriteType: 1, cellId: 200 },
          ],
        },
      });
    } else {
      send({
        case: "gameAction",
        value: {
          actionType: 1,
          sequenceId: 7,
          spriteId: "1",
          actionData: { case: "movement", value: { pathCells: [200, 215] } },
        },
      });
    }
    await tick();
    send({ case: "gameMapData", value: { mapId: 99, width: 15, height: 17 } });
    await tick();
    waiting.resolve();
    await tick();
    expect(positions).toEqual([]);
    expect(
      sent.map((data) => fromBinary(ClientMessageSchema, data).payload.case)
    ).not.toContain("gameActionAck");
  }
);
