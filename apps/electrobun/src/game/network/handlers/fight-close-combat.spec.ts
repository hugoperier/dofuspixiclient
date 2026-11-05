import { describe, expect, it } from "bun:test";

import { create } from "@bufbuild/protobuf";

import { MessageHandler } from "../message-handler";
import { DofusMessageSchema, GameActionSchema } from "../protocol";
import { FightHandler, type SpellCastPayload } from "./fight.handler";

/**
 * `GA;303` — a weapon swing. It reaches the presentation as a spell
 * cast with no visual, carrying the pose the server named for the
 * caster's weapon.
 */
function swing(animation: string): SpellCastPayload | undefined {
  const messages = new MessageHandler();
  const handler = new FightHandler(messages, { send() {} } as never);
  const casts: SpellCastPayload[] = [];
  handler.setHandlers({ onSpellCast: (cast) => casts.push(cast) });

  messages.handle(
    create(DofusMessageSchema, {
      payload: {
        case: "gameAction",
        value: create(GameActionSchema, {
          actionType: 303,
          spriteId: "7",
          actionData: {
            case: "closeCombat",
            value: { targetCell: 230, weaponTemplateId: 40, animation },
          },
        }),
      },
    })
  );

  handler.destroy();
  return casts[0];
}

describe("close-combat routing", () => {
  it("plays the weapon's own pose and no spell visual", () => {
    const cast = swing("anim14");

    expect(cast).toMatchObject({
      casterId: 7,
      spellId: 0,
      visualGfxId: 0,
      targetCellId: 230,
      animation: "anim14",
    });
  });

  it("punches when the server names no pose", () => {
    expect(swing("")?.animation).toBe("anim0");
  });
});
