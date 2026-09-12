import { describe, expect, it } from "bun:test";

import { create } from "@bufbuild/protobuf";

import { MessageHandler } from "../message-handler";
import { DofusMessageSchema, GameActionSchema } from "../protocol";
import { FightHandler, type SpellCastPayload } from "./fight.handler";

describe("fight audio routing", () => {
  it("consumes a critical marker once, for the matching caster and spell", () => {
    const messages = new MessageHandler();
    const handler = new FightHandler(messages, { send() {} } as never);
    const casts: SpellCastPayload[] = [];
    const alerts: string[] = [];
    handler.setHandlers({
      onSpellCast: (cast) => casts.push(cast),
      onCriticalHit: () => alerts.push("hit"),
      onCriticalMiss: () => alerts.push("miss"),
    });
    const send = (
      spriteId: string,
      kind: "criticalHit" | "criticalMiss" | "spellLaunch",
      spellId: number
    ) => {
      const actionData =
        kind === "criticalHit"
          ? ({ case: kind, value: { spellId } } as const)
          : kind === "criticalMiss"
            ? ({ case: kind, value: { spellId } } as const)
            : ({ case: kind, value: { spellId } } as const);
      messages.handle(
        create(DofusMessageSchema, {
          payload: {
            case: "gameAction",
            value: create(GameActionSchema, { spriteId, actionData }),
          },
        })
      );
    };
    send("1", "criticalHit", 3);
    send("2", "spellLaunch", 3);
    send("1", "spellLaunch", 3);
    send("1", "spellLaunch", 3);
    send("1", "criticalHit", 3);
    send("1", "criticalMiss", 3);
    send("1", "spellLaunch", 3);
    send("1", "criticalHit", 3);
    send("1", "spellLaunch", 4);
    expect(casts.map((c) => c.critical)).toEqual([
      false,
      true,
      false,
      false,
      false,
    ]);
    expect(alerts).toEqual(["hit", "hit", "miss", "hit"]);
    handler.destroy();
  });
});
