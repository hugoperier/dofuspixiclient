import { create } from "@bufbuild/protobuf";
import {
  AdminChangeResourceCommandSchema,
  type AdminCommandRequest,
  AdminCommandRequestSchema,
  AdminCommandSource,
  AdminGrantItemCommandSchema,
  AdminItemRoll,
  AdminResourceKind,
  AdminResourceMode,
  AdminRestoreCommandSchema,
  AdminRestoreKind,
  AdminSetLevelCommandSchema,
  AdminTargetRefSchema,
  AdminTeleportCommandSchema,
  AdminTeleportMode,
} from "@dofus/proto/admin_pb";
import { ChatChannel } from "@dofus/proto/common_pb";

import { MAX_MESSAGE_LENGTH, styleFor } from "@/game/chat/chat-channels";

/**
 * Slash commands, transcribed from the decompiled client at
 * `assets/sources/client-code/dofus/utils/consoleParsers/ChatConsoleParser.as:142-199`.
 * The French aliases are ours — retail only had the single letters, but the
 * words are what players type.
 */
const COMMAND_CHANNELS: Readonly<Record<string, ChatChannel>> = {
  s: ChatChannel.GENERAL,
  say: ChatChannel.GENERAL,
  t: ChatChannel.TEAM,
  equipe: ChatChannel.TEAM,
  p: ChatChannel.PARTY,
  groupe: ChatChannel.PARTY,
  g: ChatChannel.GUILD,
  guilde: ChatChannel.GUILD,
  a: ChatChannel.ALIGNMENT,
  alignement: ChatChannel.ALIGNMENT,
  r: ChatChannel.RECRUITMENT,
  recrutement: ChatChannel.RECRUITMENT,
  b: ChatChannel.TRADE,
  commerce: ChatChannel.TRADE,
  i: ChatChannel.DATING,
  q: ChatChannel.ADMIN,
};

const WHISPER_COMMANDS = new Set(["w", "msg", "whisper"]);

/** `SYNTAX_ERROR` interpolated with the retail `/w <nom> <msg>` hint. */
const WHISPER_SYNTAX = "Erreur de syntaxe : /w <nom> <message>";

export interface ChatSend {
  kind: "send";
  /** Channel the message is charged and coloured against. */
  channel: ChatChannel;
  /** `ChatSendMessage.destination` — a channel letter, or a player name. */
  destination: string;
  message: string;
}

export interface ChatCommandError {
  kind: "error";
  text: string;
}

/** An empty or whitespace-only line: swallow it, say nothing. */
export interface ChatNoop {
  kind: "noop";
}

export type AdminChatAction =
  | { type: "open" }
  | { type: "help" }
  | { type: "find"; query: string }
  | { type: "execute"; request: AdminCommandRequest };

export interface ChatAdminCommand {
  kind: "admin";
  action: AdminChatAction;
}

export type ChatInput =
  | ChatSend
  | ChatCommandError
  | ChatNoop
  | ChatAdminCommand;

function unknownCommand(name: string): ChatCommandError {
  return { kind: "error", text: `Erreur de syntaxe : /${name} est inconnue.` };
}

/**
 * Turns what the player typed into what goes on the wire.
 *
 * Without a leading slash the message goes to `activeChannel` — whatever the
 * star button currently selects. A slash command overrides it for that one
 * message only, which is the retail behaviour: `/b` does not make trade sticky.
 */
export function parseChatInput(
  raw: string,
  activeChannel: ChatChannel
): ChatInput {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { kind: "noop" };
  }

  if (!trimmed.startsWith("/")) {
    return {
      kind: "send",
      channel: activeChannel,
      destination: styleFor(activeChannel).letter,
      message: trimmed.slice(0, MAX_MESSAGE_LENGTH),
    };
  }

  const spaceAt = trimmed.indexOf(" ");
  const name = (
    spaceAt === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceAt)
  ).toLowerCase();
  const rest = spaceAt === -1 ? "" : trimmed.slice(spaceAt + 1).trim();

  const admin = parseAdminCommand(name, rest);
  if (admin) {
    return admin;
  }

  if (WHISPER_COMMANDS.has(name)) {
    const targetAt = rest.indexOf(" ");

    if (targetAt === -1) {
      return { kind: "error", text: WHISPER_SYNTAX };
    }

    const target = rest.slice(0, targetAt);
    const message = rest.slice(targetAt + 1).trim();

    if (target.length < 2 || message.length === 0) {
      return { kind: "error", text: WHISPER_SYNTAX };
    }

    return {
      kind: "send",
      channel: ChatChannel.WHISPER_TO,
      destination: target,
      message: message.slice(0, MAX_MESSAGE_LENGTH),
    };
  }

  const channel = COMMAND_CHANNELS[name];

  if (channel === undefined) {
    return unknownCommand(name);
  }

  if (rest.length === 0) {
    return { kind: "noop" };
  }

  return {
    kind: "send",
    channel,
    destination: styleFor(channel).letter,
    message: rest.slice(0, MAX_MESSAGE_LENGTH),
  };
}

function parseAdminCommand(
  name: string,
  rest: string
): ChatAdminCommand | ChatCommandError | null {
  if (name === "admin") {
    if (rest.length === 0) {
      return { kind: "admin", action: { type: "open" } };
    }
    const [subcommand, ...tail] = rest.split(/\s+/);
    if (subcommand?.toLowerCase() === "help" && tail.length === 0) {
      return { kind: "admin", action: { type: "help" } };
    }
    if (subcommand?.toLowerCase() === "find" && tail.length > 0) {
      return {
        kind: "admin",
        action: { type: "find", query: tail.join(" ") },
      };
    }
    return adminSyntax("/admin [help|find <nom|#ID>]");
  }

  if (name === "tp") {
    const [mode, target, rawMap, rawCell, ...extra] = rest.split(/\s+/);
    if (!mode || !target || extra.length > 0) {
      return adminSyntax(
        "/tp to <cible> | /tp here <cible> | /tp map <cible> <mapId> <cellId>"
      );
    }
    const normalizedMode = mode.toLowerCase();
    if (normalizedMode === "to" && rawMap === undefined) {
      return execute(target, {
        case: "teleport",
        value: create(AdminTeleportCommandSchema, {
          mode: AdminTeleportMode.SELF_TO_TARGET,
        }),
      });
    }
    if (normalizedMode === "here" && rawMap === undefined) {
      return execute(target, {
        case: "teleport",
        value: create(AdminTeleportCommandSchema, {
          mode: AdminTeleportMode.TARGET_TO_SELF,
        }),
      });
    }
    if (
      normalizedMode === "map" &&
      integer(rawMap) !== null &&
      integer(rawCell) !== null
    ) {
      return execute(target, {
        case: "teleport",
        value: create(AdminTeleportCommandSchema, {
          mode: AdminTeleportMode.TARGET_TO_MAP,
          mapId: integer(rawMap) as number,
          cellId: integer(rawCell) as number,
        }),
      });
    }
    return adminSyntax(
      "/tp to <cible> | /tp here <cible> | /tp map <cible> <mapId> <cellId>"
    );
  }

  if (name === "give") {
    const [target, rawItem, rawQuantity = "1", rawRoll = "normal", ...extra] =
      rest.split(/\s+/);
    const itemId = integer(rawItem);
    const quantity = integer(rawQuantity);
    const roll = {
      normal: AdminItemRoll.NORMAL,
      perfect: AdminItemRoll.PERFECT,
      empty: AdminItemRoll.EMPTY,
    }[rawRoll.toLowerCase()];
    if (
      !target ||
      itemId === null ||
      quantity === null ||
      !roll ||
      extra.length > 0
    ) {
      return adminSyntax(
        "/give <cible> <itemId> [quantité] [normal|perfect|empty]"
      );
    }
    return execute(target, {
      case: "grantItem",
      value: create(AdminGrantItemCommandSchema, { itemId, quantity, roll }),
    });
  }

  const resource = {
    kamas: AdminResourceKind.KAMAS,
    xp: AdminResourceKind.XP,
  }[name];
  if (resource !== undefined) {
    const [target, rawMode, amount, ...extra] = rest.split(/\s+/);
    const mode = resourceMode(rawMode);
    if (!target || !mode || !decimal(amount) || extra.length > 0) {
      return adminSyntax(`/${name} <cible> <add|remove|set> <montant>`);
    }
    return resourceCommand(target, resource, mode, amount as string);
  }

  if (name === "level") {
    const [target, rawLevel, ...extra] = rest.split(/\s+/);
    const level = integer(rawLevel);
    if (!target || level === null || extra.length > 0) {
      return adminSyntax("/level <cible> <niveau>");
    }
    return execute(target, {
      case: "setLevel",
      value: create(AdminSetLevelCommandSchema, { level }),
    });
  }

  if (name === "capital") {
    const [target, rawKind, rawMode, amount, ...extra] = rest.split(/\s+/);
    const kind = {
      stats: AdminResourceKind.STAT_POINTS,
      spells: AdminResourceKind.SPELL_POINTS,
    }[rawKind?.toLowerCase() ?? ""];
    const mode = resourceMode(rawMode);
    if (!target || !kind || !mode || !decimal(amount) || extra.length > 0) {
      return adminSyntax(
        "/capital <cible> <stats|spells> <add|remove|set> <montant>"
      );
    }
    return resourceCommand(target, kind, mode, amount as string);
  }

  if (name === "restore") {
    const [target, rawKind, ...extra] = rest.split(/\s+/);
    const kind = {
      life: AdminRestoreKind.LIFE,
      energy: AdminRestoreKind.ENERGY,
      all: AdminRestoreKind.ALL,
    }[rawKind?.toLowerCase() ?? ""];
    if (!target || !kind || extra.length > 0) {
      return adminSyntax("/restore <cible> <life|energy|all>");
    }
    return restoreCommand(target, kind);
  }

  if (name === "heal") {
    const [target, ...extra] = rest.split(/\s+/);
    return target && extra.length === 0
      ? restoreCommand(target, AdminRestoreKind.LIFE)
      : adminSyntax("/heal <cible>");
  }

  return null;
}

function execute(
  target: string,
  command: AdminCommandRequest["command"]
): ChatAdminCommand {
  return {
    kind: "admin",
    action: {
      type: "execute",
      request: create(AdminCommandRequestSchema, {
        requestId: crypto.randomUUID(),
        source: AdminCommandSource.CHAT,
        confirmed: true,
        target: adminTarget(target),
        command,
      }),
    },
  };
}

function adminTarget(raw: string) {
  if (raw.toLowerCase() === "me") {
    return create(AdminTargetRefSchema, {
      identifier: { case: "self", value: true },
    });
  }
  if (raw.startsWith("#")) {
    return create(AdminTargetRefSchema, {
      identifier: { case: "playerId", value: raw.slice(1) },
    });
  }
  return create(AdminTargetRefSchema, {
    identifier: { case: "playerName", value: raw },
  });
}

function resourceCommand(
  target: string,
  resource: AdminResourceKind,
  mode: AdminResourceMode,
  amount: string
): ChatAdminCommand {
  return execute(target, {
    case: "changeResource",
    value: create(AdminChangeResourceCommandSchema, {
      resource,
      mode,
      amount,
    }),
  });
}

function restoreCommand(
  target: string,
  kind: AdminRestoreKind
): ChatAdminCommand {
  return execute(target, {
    case: "restore",
    value: create(AdminRestoreCommandSchema, { kind }),
  });
}

function resourceMode(raw?: string): AdminResourceMode | null {
  return (
    {
      add: AdminResourceMode.ADD,
      remove: AdminResourceMode.REMOVE,
      set: AdminResourceMode.SET,
    }[raw?.toLowerCase() ?? ""] ?? null
  );
}

function integer(raw?: string): number | null {
  if (!raw || !/^\d+$/.test(raw)) {
    return null;
  }
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

function decimal(raw?: string): boolean {
  return raw !== undefined && /^\d+$/.test(raw);
}

function adminSyntax(syntax: string): ChatCommandError {
  return { kind: "error", text: `Erreur de syntaxe : ${syntax}` };
}
