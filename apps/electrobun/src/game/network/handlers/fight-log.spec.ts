import { afterEach, beforeEach, expect, test } from "bun:test";

import { create, type MessageInitShape } from "@bufbuild/protobuf";

import type { FighterSnapshot } from "../../machines/fight.machine";
import { chatStore } from "../../stores/chat-store";
import { fightActor } from "../../stores/fight-store";
import { MessageHandler } from "../message-handler";
import {
  DofusMessageSchema,
  GameActionSchema,
  GameJoinSchema,
} from "../protocol";
import { FightHandler } from "./fight.handler";

const snapshot = (id: string, name: string): FighterSnapshot => ({
  spriteId: id,
  name,
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
  chatStore.setState({ messages: [], infos: [] });
  fightActor.send({ type: "LEAVE" });
  fightActor.send({
    type: "FIGHT_INIT",
    payload: create(GameJoinSchema),
    mySpriteId: "1",
  });
  fightActor.send({ type: "FIGHTER_UPSERT", fighter: snapshot("1", "Mikos") });
  fightActor.send({
    type: "FIGHTER_UPSERT",
    fighter: snapshot("2", "Bouftou"),
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

const lines = () => chatStore.getSnapshot().messages.map((entry) => entry.text);
const last = () => {
  const { messages } = chatStore.getSnapshot();

  return messages[messages.length - 1];
};

test("a cast names the spell the server resolved and emphasises both names", () => {
  action({
    case: "spellLaunch",
    value: { spellId: 202, cellId: 600, name: "Flèche Magique" },
  });

  const entry = last();
  expect(entry?.text).toBe("Mikos lance Flèche Magique.");
  expect(entry?.segments).toEqual([
    { text: "Mikos", bold: true, underline: true },
    { text: " lance " },
    { text: "Flèche Magique", bold: true },
    { text: "." },
  ]);
});

test("a spell the server could not name falls back to its id", () => {
  action({ case: "spellLaunch", value: { spellId: 202, cellId: 600 } });

  expect(last()?.text).toBe("Mikos lance le sort 202.");
});

test("AP and MP spent on one's own action are not logged", () => {
  action({ case: "apChange", value: { spriteId: "1", delta: -4, cost: true } });
  action({ case: "mpChange", value: { spriteId: "1", delta: -1, cost: true } });

  expect(lines()).toEqual([]);
});

test("AP and MP a spell took off a target are still logged", () => {
  action({ case: "apChange", value: { spriteId: "2", delta: -2 } });
  action({ case: "mpChange", value: { spriteId: "2", delta: -3 } });

  expect(lines()).toEqual(["Bouftou : -2 PA.", "Bouftou : -3 PM."]);
});

test("the state a cost frame carries is applied even though nothing is logged", () => {
  action({ case: "apChange", value: { spriteId: "1", delta: -4, cost: true } });

  expect(fightActor.getSnapshot().context.fighters.get("1")?.ap).toBe(2);
  expect(lines()).toEqual([]);
});

test("an effect with no bundle wording stays out of the log", () => {
  // The bundle is fetched lazily and never resolves under the test
  // runner, so every effect is unknown here — which is exactly the case
  // that used to print "reçoit un effet".
  action({
    case: "effectApply",
    value: {
      effectId: 126,
      targetSpriteId: "2",
      value: 20,
      duration: 3,
      buffId: 7,
    },
  });

  expect(lines()).toEqual([]);
});

test("a timed MP theft is logged once, by its loss frame", () => {
  action({ case: "mpChange", value: { spriteId: "2", delta: -2 } });
  action({
    case: "effectApply",
    value: {
      effectId: 169,
      targetSpriteId: "2",
      value: -2,
      duration: 3,
      buffId: 8,
    },
  });

  expect(lines()).toEqual(["Bouftou : -2 PM."]);
});

test("a death names the fighter in bold and underlined", () => {
  action({ case: "death", value: { spriteId: "2" } });

  expect(last()?.text).toBe("Bouftou est mort.");
  expect(last()?.segments?.[0]).toEqual({
    text: "Bouftou",
    bold: true,
    underline: true,
  });
});
