import { afterEach, beforeEach, expect, test } from "bun:test";

import { create, fromBinary } from "@bufbuild/protobuf";
import { DofusPathfinding } from "@dofus/grid";
import {
  ClientMessageSchema,
  DofusMessageSchema,
  GameJoinSchema,
  GameTurnStartSchema,
  SpellDataSchema,
} from "@dofus/proto";

import type { MessageHandler } from "./network/message-handler";
import type { Battlefield } from "./scene";
import { GameClient } from "./game-client";
import { spellCastActor } from "./machines/spell-cast.machine";
import { FakeWebSocket, installFakeWebSocket } from "./network/fake-websocket";
import { fightActor } from "./stores/fight-store";
import { applySpellList } from "./stores/spells-store";

const tick = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};

let client: GameClient;
let restore: () => void;
let click: (cell: number) => void;
const highlights = new Set<string>();
/** Sprite moves that reached the renderer holding the fighters. */
const teleports: { id: number; cell: number }[] = [];
/** Sprite moves that went to the empty FightUI renderer, i.e. nowhere. */
const strayTeleports: { id: number; cell: number }[] = [];
beforeEach(() => {
  restore = installFakeWebSocket();
  fightActor.send({ type: "LEAVE" });
  spellCastActor.send({ type: "RESET" });
  client = new GameClient({ serverUrl: "ws://localhost:8080/game" });
  client.connect();
  FakeWebSocket.latest().accept();
  // Supply the loaded scene at the same seam as setBattlefield, without GPU.
  client.setBattlefield({
    setOnCellClick: (fn: typeof click) => {
      click = fn;
    },
    setOnCellHover() {},
    setOnInteractiveUse() {},
    setOnNpcTalk() {},
    setOnNpcExchange() {},
    setOnPlayerExchange() {},
    setOnCraftInvite() {},
    setOnSelfHover() {},
    getCurrentMapData: () => ({
      width: 15,
      height: 17,
      cells: [200, 215, 230, 245, 260].map((id) => ({
        id,
        active: true,
        movement: 4,
      })),
    }),
    isCellLosBlocked: () => false,
    getFightUI: () => ({
      clearHighlightType: (type: string) => highlights.delete(type),
      clearPlacementHighlights() {},
      showSpellRange: () => highlights.add("spell-range"),
      showSpellZone: (cells: number[]) =>
        cells.length
          ? highlights.add("spell-zone")
          : highlights.delete("spell-zone"),
      highlightCells: (_cells: number[], type: string) => highlights.add(type),
      showMovementRange() {},
      // FightUI owns a PlayerRenderer that nothing ever populates, so a
      // sprite move sent here is dropped on the floor. Recorded rather
      // than omitted so the routing is asserted, not assumed.
      teleportPlayer: (id: number, cell: number) => {
        strayTeleports.push({ id, cell });
      },
    }),
    getWorldActorRenderer: () => ({
      teleportPlayer: (id: number, cell: number) => {
        teleports.push({ id, cell });
      },
      getPlayerCell: () => undefined,
    }),
    moveWorldActor: async () => {},
  } as unknown as Battlefield);
  const map = Reflect.get(client, "mapHandler");
  Reflect.set(
    map,
    "pathfinding",
    new DofusPathfinding(15, 17, [200, 215, 230, 245, 260])
  );
  Reflect.set(map, "currentCellId", 200);
  fightActor.send({
    type: "FIGHT_INIT",
    payload: create(GameJoinSchema, { fightId: 1 }),
    mySpriteId: "1",
  });
  fightActor.send({
    type: "FIGHTER_UPSERT",
    fighter: {
      spriteId: "1",
      name: "test",
      level: 200,
      team: 0,
      cell: 200,
      hp: 100,
      maxHp: 100,
      ap: 12,
      maxAp: 12,
      mp: 3,
      maxMp: 3,
      gfxId: 10,
      dead: false,
      color1: -1,
      color2: -1,
      color3: -1,
    },
  });
  fightActor.send({ type: "FIGHT_START" });
  fightActor.send({
    type: "TURN_START",
    payload: create(GameTurnStartSchema, { spriteId: "1", timeMs: 30_000 }),
  });
  applySpellList(
    [1, 2].map((spellId) =>
      create(SpellDataSchema, {
        spellId,
        level: 6,
        apCost: 3,
        rangeMin: 1,
        rangeMax: 2,
        lineOfSight: true,
      })
    )
  );
  FakeWebSocket.latest().sent.splice(0);
});
afterEach(() => {
  // Unmount scene before resetting shared machines.
  Reflect.set(client, "battlefield", null);
  client.destroy();
  fightActor.send({ type: "LEAVE" });
  spellCastActor.send({ type: "RESET" });
  applySpellList([]);
  highlights.clear();
  teleports.splice(0);
  strayTeleports.splice(0);
  restore();
});

test.each([false, true])(
  "an invalid target cancels the selection and overlays, even while busy=%s",
  (busy) => {
    client.fightSelectSpell(1);
    expect(highlights.has("spell-range")).toBe(true);
    fightActor.send({ type: "PRESENTATION_PENDING", pending: busy });
    click(260);
    expect(spellCastActor.getSnapshot().matches("idle")).toBe(true);
    expect(highlights.size).toBe(0);
    expect(FakeWebSocket.latest().sent).toHaveLength(0);
  }
);

const sentPayloads = () =>
  FakeWebSocket.latest().sent.map(
    (data) => fromBinary(ClientMessageSchema, data).payload
  );

test("a cast goes out while an earlier animation is still playing", () => {
  client.fightSelectSpell(1);
  // The presentation queue is busy — an animation is on screen. That
  // is a rendering state and must not cost the player their next
  // action.
  fightActor.send({ type: "PRESENTATION_PENDING", pending: true });
  client.fightSelectSpell(2);
  expect(spellCastActor.getSnapshot().context.spell?.spellId).toBe(2);
  click(215);
  expect(sentPayloads()).toMatchObject([
    { case: "gameAction", value: { actionType: 300, params: "2;215;6" } },
  ]);
});

test("a click made during the round-trip is replayed, not lost", () => {
  client.fightSelectSpell(1);
  fightActor.send({ type: "ACTION_PENDING", pending: true });
  click(215);
  expect(FakeWebSocket.latest().sent).toHaveLength(0);
  // The server answers: the buffered intent goes out on its own.
  fightActor.send({ type: "ACTION_PENDING", pending: false });
  expect(sentPayloads()).toMatchObject([
    { case: "gameAction", value: { actionType: 300, params: "1;215;6" } },
  ]);
});

test("only the last click of a burst is replayed", () => {
  client.fightSelectSpell(1);
  fightActor.send({ type: "ACTION_PENDING", pending: true });
  click(215);
  click(230);
  fightActor.send({ type: "ACTION_PENDING", pending: false });
  expect(sentPayloads()).toMatchObject([
    { case: "gameAction", value: { actionType: 300, params: "1;230;6" } },
  ]);
});

test("a buffered click is dropped when the turn passes to someone else", () => {
  client.fightSelectSpell(1);
  fightActor.send({ type: "ACTION_PENDING", pending: true });
  click(215);
  fightActor.send({
    type: "TURN_START",
    payload: create(GameTurnStartSchema, { spriteId: "2", timeMs: 30_000 }),
  });
  expect(FakeWebSocket.latest().sent).toHaveLength(0);
});

test("an action queued behind a walk starts from the cell the walk ends on", () => {
  const messages = Reflect.get(client, "messageHandler") as MessageHandler;
  // Two MP left and a straight line of cells 15 apart: 200 → 245 is
  // three steps and unaffordable, 215 → 245 is two and fine. So this
  // only passes if the click is computed from where the server has us,
  // not from the sprite still walking towards it.
  fightActor.send({ type: "STATS_UPDATE", mp: 2 });
  click(245);
  expect(FakeWebSocket.latest().sent).toHaveLength(0);

  messages.handle(
    create(DofusMessageSchema, {
      payload: {
        case: "gameAction",
        value: {
          actionType: 1,
          sequenceId: 1,
          spriteId: "1",
          actionData: { case: "movement", value: { pathCells: [200, 215] } },
        },
      },
    })
  );
  click(245);
  expect(sentPayloads()).toMatchObject([
    { case: "gameAction", value: { actionType: 1 } },
  ]);
});

test("a spell held ready follows the caster to the cell they move to", () => {
  const messages = Reflect.get(client, "messageHandler") as MessageHandler;
  client.fightSelectSpell(1);
  expect(spellCastActor.getSnapshot().context.casterCellId).toBe(200);
  messages.handle(
    create(DofusMessageSchema, {
      payload: {
        case: "gameAction",
        value: {
          actionType: 1,
          sequenceId: 1,
          spriteId: "1",
          actionData: { case: "movement", value: { pathCells: [200, 215] } },
        },
      },
    })
  );
  const cast = spellCastActor.getSnapshot();
  expect(cast.matches("targeting")).toBe(true);
  expect(cast.context.casterCellId).toBe(215);
  // Range 1-2 from 215 on this line: 230 is reachable, 200 too, and
  // 260 sits three cells away.
  expect(cast.context.targetingCells).toContain(230);
  expect(cast.context.targetingCells).not.toContain(260);
});

test("a sprite-position frame moves the sprite, not just the fight store", async () => {
  const messages = Reflect.get(client, "messageHandler") as MessageHandler;
  // ACTION_SPRITE_POSITION (4) — what the server emits for every
  // teleport, push, pull, swap and rollback.
  messages.handle(
    create(DofusMessageSchema, {
      payload: {
        case: "gameAction",
        value: {
          actionType: 4,
          sequenceId: 4,
          spriteId: "1",
          actionData: {
            case: "spritePosition",
            value: { spriteId: "1", cellId: 245 },
          },
        },
      },
    })
  );
  await tick();
  expect(teleports).toEqual([{ id: 1, cell: 245 }]);
  expect(strayTeleports).toEqual([]);
  expect(fightActor.getSnapshot().context.fighters.get("1")?.cell).toBe(245);
});
