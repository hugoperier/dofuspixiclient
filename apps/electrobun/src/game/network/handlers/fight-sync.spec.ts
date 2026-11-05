import { afterEach, beforeEach, expect, test } from "bun:test";

import { create, type MessageInitShape } from "@bufbuild/protobuf";

import type { FighterSnapshot } from "../../machines/fight.machine";
import { fightActor } from "../../stores/fight-store";
import { MessageHandler } from "../message-handler";
import {
  DofusMessageSchema,
  GameActionSchema,
  GameJoinSchema,
  GameTurnMiddleSchema,
} from "../protocol";
import { FightHandler } from "./fight.handler";

const snapshot = (id: string): FighterSnapshot => ({
  spriteId: id,
  name: id,
  level: 100,
  team: 0,
  cell: 600,
  hp: 800,
  maxHp: 1000,
  ap: 6,
  maxAp: 6,
  mp: 3,
  maxMp: 3,
  gfxId: 10,
  dead: false,
  color1: -1,
  color2: -1,
  color3: -1,
});
let messages: MessageHandler;
let handler: FightHandler;
beforeEach(() => {
  fightActor.send({ type: "LEAVE" });
  fightActor.send({
    type: "FIGHT_INIT",
    payload: create(GameJoinSchema),
    mySpriteId: "1",
  });
  fightActor.send({ type: "FIGHTER_UPSERT", fighter: snapshot("1") });
  fightActor.send({
    type: "FIGHTER_UPSERT",
    fighter: { ...snapshot("2"), cell: 625 },
  });
  messages = new MessageHandler();
  handler = new FightHandler(messages, {
    send() {
      return true;
    },
  });
});
afterEach(() => {
  handler.destroy();
  fightActor.send({ type: "LEAVE" });
});
const fighter = (id = "1") => fightActor.getSnapshot().context.fighters.get(id);
function action(
  actionData: MessageInitShape<typeof GameActionSchema>["actionData"],
  spriteId = "1"
) {
  messages.handle(
    create(DofusMessageSchema, {
      payload: {
        case: "gameAction",
        value: create(GameActionSchema, { spriteId, actionData }),
      },
    })
  );
}

test("invisibility forgets the last position and reveal restores the authoritative one", () => {
  action({
    case: "invisibility",
    value: { spriteId: "1", turns: 3, visibility: 2 },
  });
  expect(fighter()?.cell).toBe(-1);
  expect(fighter()?.hidden).toBe(true);
  messages.handle(
    create(DofusMessageSchema, {
      payload: {
        case: "gameTurnMiddle",
        value: create(GameTurnMiddleSchema, {
          entries: [
            {
              spriteId: "1",
              cellNum: -1,
              hidden: true,
              invisible: true,
              lp: 800,
              lpMax: 1000,
            },
          ],
        }),
      },
    })
  );
  expect(fighter()?.cell).toBe(-1);
  action({
    case: "invisibility",
    value: { spriteId: "1", turns: 0, visibility: 0 },
  });
  action({ case: "spritePosition", value: { spriteId: "1", cellId: 675 } });
  expect(fighter()?.cell).toBe(675);
  expect(fighter()?.hidden).toBe(false);
});

test("buff duration updates replace the same buff, and dispel clears it", () => {
  for (const duration of [4, 3, 2]) {
    action({
      case: "effectApply",
      value: {
        targetSpriteId: "1",
        buffId: 77,
        effectId: 118,
        spellId: 1,
        value: 20,
        duration,
      },
    });
  }
  expect(fighter()?.buffs).toEqual([
    { id: 77, effectId: 118, spellId: 1, value: 20, duration: 2 },
  ]);
  action({ case: "removeEffects", value: { targetId: "1" } });
  expect(fighter()?.buffs).toEqual([]);
});

test("carrying, walking and throwing keep both ends of the link consistent", () => {
  action({ case: "carry", value: { carriedSpriteId: "2" } });
  expect(fighter()?.carryingId).toBe("2");
  expect(fighter("2")?.cell).toBe(600);
  action({ case: "movement", value: { pathCells: [600, 624] } });
  expect(fighter("2")?.cell).toBe(624);
  action({ case: "throwCarried", value: { cellId: 650 } });
  expect(fighter()?.carryingId).toBe("");
  expect(fighter("2")?.carriedById).toBe("");
  expect(fighter("2")?.cell).toBe(650);
});

test("resurrection replaces a dead sprite without turning a player into a summon", () => {
  fightActor.send({
    type: "FIGHTER_UPDATE",
    spriteId: "2",
    patch: { dead: true, hp: 0 },
  });
  messages.handle(
    create(DofusMessageSchema, {
      payload: {
        case: "gameAction",
        value: create(GameActionSchema, {
          spriteId: "1",
          actionData: {
            case: "summon",
            value: {
              resurrected: true,
              cellId: 675,
              spriteData: {
                spriteId: "2",
                name: "Restored",
                gfxId: 40,
                lp: 500,
                lpMax: 1000,
                isSummoned: false,
                colors: { color1: 123 },
              },
            },
          },
        }),
      },
    })
  );
  expect(fighter("2")?.dead).toBe(false);
  expect(fighter("2")?.hp).toBe(500);
  expect(fighter("2")?.summonedBy).toBeUndefined();
  expect(fighter("2")?.color1).toBe(123);
});
