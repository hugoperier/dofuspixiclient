import { describe, expect, test } from "bun:test";

import {
  AdminCommandSource,
  AdminItemRoll,
  AdminResourceKind,
  AdminResourceMode,
  AdminRestoreKind,
  AdminTeleportMode,
} from "@dofus/proto/admin_pb";
import { ChatChannel } from "@dofus/proto/common_pb";

import { parseChatInput } from "@/game/chat/chat-commands";

// The parser is the whole contract between what a player types and what goes on
// the wire, so it is worth pinning letter by letter.

describe("plain text", () => {
  test("goes to the active channel with that channel's letter", () => {
    expect(parseChatInput("bonjour", ChatChannel.GENERAL)).toEqual({
      kind: "send",
      channel: ChatChannel.GENERAL,
      destination: "*",
      message: "bonjour",
    });
  });

  test("follows the star button to another channel", () => {
    expect(parseChatInput("vends chapeau", ChatChannel.TRADE)).toEqual({
      kind: "send",
      channel: ChatChannel.TRADE,
      destination: ":",
      message: "vends chapeau",
    });
  });

  test("is truncated at the retail 200-character cap", () => {
    const result = parseChatInput("a".repeat(250), ChatChannel.GENERAL);

    expect(result.kind === "send" && result.message.length).toBe(200);
  });

  test("a blank line is swallowed", () => {
    expect(parseChatInput("   ", ChatChannel.GENERAL)).toEqual({
      kind: "noop",
    });
  });
});

describe("channel commands", () => {
  test.each([
    ["/s salut", ChatChannel.GENERAL, "*"],
    ["/t on focus", ChatChannel.TEAM, "#"],
    ["/p on y va", ChatChannel.PARTY, "$"],
    ["/g coucou", ChatChannel.GUILD, "%"],
    ["/a defense", ChatChannel.ALIGNMENT, "!"],
    ["/r cherche dj", ChatChannel.RECRUITMENT, "?"],
    ["/b vends chapeau", ChatChannel.TRADE, ":"],
  ])("%s", (input, channel, destination) => {
    const result = parseChatInput(input, ChatChannel.GENERAL);

    expect(result.kind === "send" && result.channel).toBe(channel);
    expect(result.kind === "send" && result.destination).toBe(destination);
  });

  test("the French aliases work too", () => {
    expect(parseChatInput("/commerce vends", ChatChannel.GENERAL)).toEqual({
      kind: "send",
      channel: ChatChannel.TRADE,
      destination: ":",
      message: "vends",
    });
  });

  test("commands are case-insensitive", () => {
    const result = parseChatInput("/B vends", ChatChannel.GENERAL);

    expect(result.kind === "send" && result.channel).toBe(ChatChannel.TRADE);
  });

  test("a command overrides the active channel for one message only", () => {
    const result = parseChatInput("/b vends", ChatChannel.GENERAL);

    expect(result.kind === "send" && result.channel).toBe(ChatChannel.TRADE);
    // Nothing here mutates the active channel — the caller keeps passing its own.
    expect(parseChatInput("suite", ChatChannel.GENERAL)).toEqual({
      kind: "send",
      channel: ChatChannel.GENERAL,
      destination: "*",
      message: "suite",
    });
  });

  test("a command with no message says nothing", () => {
    expect(parseChatInput("/b", ChatChannel.GENERAL)).toEqual({ kind: "noop" });
  });

  test("an unknown command reports a syntax error and sends nothing", () => {
    const result = parseChatInput("/zorglub hello", ChatChannel.GENERAL);

    expect(result.kind).toBe("error");
  });
});

describe("whisper", () => {
  test.each(["/w", "/msg", "/whisper"])(
    "%s <nom> <message> targets the name",
    (command) => {
      expect(
        parseChatInput(`${command} Elyne salut`, ChatChannel.GENERAL)
      ).toEqual({
        kind: "send",
        channel: ChatChannel.WHISPER_TO,
        destination: "Elyne",
        message: "salut",
      });
    }
  );

  test("keeps the whole rest of the line as the message", () => {
    const result = parseChatInput(
      "/w Elyne salut ça va ?",
      ChatChannel.GENERAL
    );

    expect(result.kind === "send" && result.message).toBe("salut ça va ?");
  });

  test("a missing message is a syntax error", () => {
    expect(parseChatInput("/w Elyne", ChatChannel.GENERAL).kind).toBe("error");
  });

  test("a one-letter target is a syntax error, as in retail", () => {
    expect(parseChatInput("/w E salut", ChatChannel.GENERAL).kind).toBe(
      "error"
    );
  });
});

describe("admin commands", () => {
  test("opens the drawer and exposes private help", () => {
    expect(parseChatInput("/admin", ChatChannel.GENERAL)).toEqual({
      kind: "admin",
      action: { type: "open" },
    });
    expect(parseChatInput("/admin help", ChatChannel.GENERAL)).toEqual({
      kind: "admin",
      action: { type: "help" },
    });
  });

  test("searches players without sending a chat message", () => {
    expect(parseChatInput("/admin find Ely", ChatChannel.GENERAL)).toEqual({
      kind: "admin",
      action: { type: "find", query: "Ely" },
    });
  });

  test.each([
    ["/tp to Elyne", AdminTeleportMode.SELF_TO_TARGET],
    ["/tp here #42", AdminTeleportMode.TARGET_TO_SELF],
  ])("%s creates a confirmed typed request", (input, mode) => {
    const result = parseChatInput(input, ChatChannel.GENERAL);
    expect(result.kind).toBe("admin");
    if (result.kind !== "admin" || result.action.type !== "execute") {
      return;
    }
    expect(result.action.request.source).toBe(AdminCommandSource.CHAT);
    expect(result.action.request.confirmed).toBe(true);
    expect(result.action.request.command.case).toBe("teleport");
    expect(
      result.action.request.command.case === "teleport" &&
        result.action.request.command.value.mode
    ).toBe(mode);
  });

  test("parses map teleport IDs", () => {
    const result = parseChatInput("/tp map me 7411 383", ChatChannel.GENERAL);
    if (result.kind !== "admin" || result.action.type !== "execute") {
      throw new Error("expected admin execution");
    }
    expect(result.action.request.target?.identifier.case).toBe("self");
    expect(result.action.request.command).toMatchObject({
      case: "teleport",
      value: {
        mode: AdminTeleportMode.TARGET_TO_MAP,
        mapId: 7411,
        cellId: 383,
      },
    });
  });

  test("parses item quantity and perfect roll", () => {
    const result = parseChatInput(
      "/give #42 1001 12 perfect",
      ChatChannel.GENERAL
    );
    if (result.kind !== "admin" || result.action.type !== "execute") {
      throw new Error("expected admin execution");
    }
    expect(result.action.request.command).toMatchObject({
      case: "grantItem",
      value: { itemId: 1001, quantity: 12, roll: AdminItemRoll.PERFECT },
    });
  });

  test.each([
    [
      "/kamas Elyne remove 500",
      AdminResourceKind.KAMAS,
      AdminResourceMode.REMOVE,
    ],
    ["/xp #42 set 12000", AdminResourceKind.XP, AdminResourceMode.SET],
    [
      "/capital me spells add 3",
      AdminResourceKind.SPELL_POINTS,
      AdminResourceMode.ADD,
    ],
  ])("%s parses a resource mutation", (input, resource, mode) => {
    const result = parseChatInput(input, ChatChannel.GENERAL);
    if (result.kind !== "admin" || result.action.type !== "execute") {
      throw new Error("expected admin execution");
    }
    expect(result.action.request.command).toMatchObject({
      case: "changeResource",
      value: { resource, mode },
    });
  });

  test("heal is the life-only restore alias", () => {
    const result = parseChatInput("/heal Elyne", ChatChannel.GENERAL);
    if (result.kind !== "admin" || result.action.type !== "execute") {
      throw new Error("expected admin execution");
    }
    expect(result.action.request.command).toMatchObject({
      case: "restore",
      value: { kind: AdminRestoreKind.LIFE },
    });
  });

  test.each(["/tp", "/give Elyne x", "/kamas Elyne add -1", "/level me x"])(
    "%s is rejected locally",
    (input) => {
      expect(parseChatInput(input, ChatChannel.GENERAL).kind).toBe("error");
    }
  );
});
