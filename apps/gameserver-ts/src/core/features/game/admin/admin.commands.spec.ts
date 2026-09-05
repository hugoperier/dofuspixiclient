import { describe, expect, test } from "bun:test";

import { create } from "@bufbuild/protobuf";
import {
  AdminChangeResourceCommandSchema,
  type AdminCommandRequest,
  AdminCommandRequestSchema,
  AdminCommandSource,
  AdminCommandStatus,
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

import { AdminService } from "./admin.service";

const SESSION = "admin-session";
const ACCOUNT = "10";
const ACTOR = "20";

function player(id = ACTOR) {
  return {
    id,
    accountId: id === ACTOR ? ACCOUNT : "11",
    accountPseudo: id === ACTOR ? "admin" : "target-account",
    name: id === ACTOR ? "Admin" : "Elyne",
    class: 1,
    level: 1,
    experience: "0",
    kamas: "100",
    life: 10,
    energy: 100,
    statsPoints: 0,
    spellPoints: 0,
    mapId: 7411,
    cellId: 1,
    direction: 3,
    deletedAt: null,
  };
}

function request(
  command: AdminCommandRequest["command"],
  options: {
    source?: AdminCommandSource;
    confirmed?: boolean;
    targetId?: string;
  } = {}
) {
  return create(AdminCommandRequestSchema, {
    requestId: crypto.randomUUID(),
    source: options.source ?? AdminCommandSource.CHAT,
    confirmed: options.confirmed ?? true,
    target: create(AdminTargetRefSchema, {
      identifier: options.targetId
        ? { case: "playerId", value: options.targetId }
        : { case: "self", value: true },
    }),
    command,
  });
}

function harness(
  options: { online?: boolean; upgradedRemovedSpell?: boolean } = {}
) {
  const actor = player();
  const target = player("30");
  const rows = new Map([
    [actor.id, actor],
    [target.id, target],
  ]);
  const writes: Array<{ id: string; values: Record<string, unknown> }> = [];
  const audits: Array<Record<string, unknown>> = [];
  const granted: Array<Record<string, unknown>> = [];
  const teleports: Array<Record<string, unknown>> = [];
  const statsRefreshes: string[] = [];
  const inventoryRefreshes: string[] = [];
  const mapCells: Array<{ active: boolean; walkable: boolean } | undefined> =
    [];
  mapCells[383] = { active: true, walkable: true };

  const repo = {
    isAdmin: async () => true,
    findAudit: async () => undefined,
    findPlayerById: async (id: string) => rows.get(id),
    writeAudit: async (audit: Record<string, unknown>) => audits.push(audit),
    setPlayerValues: async (id: string, values: Record<string, unknown>) => {
      writes.push({ id, values });
      Object.assign(rows.get(id) as object, values);
    },
    playerStats: async () => ({
      strength: 0,
      vitality: 0,
      wisdom: 0,
      chance: 0,
      agility: 0,
      intelligence: 0,
    }),
    playerSpells: async () => [],
    classSpellsAboveLevel: async () =>
      options.upgradedRemovedSpell
        ? [{ spellId: 101, level: 2, learnLevel: 6 }]
        : [],
    deleteClassSpellsAboveLevel: async () => undefined,
  };
  const presence = {
    getByCharacter: (id: string) =>
      options.online
        ? {
            sessionId: `${id}-session`,
            mapId: rows.get(id)?.mapId ?? 0,
            cellId: rows.get(id)?.cellId ?? 0,
          }
        : undefined,
  };
  const inventory = {
    insertItem: async (grant: Record<string, unknown>) => {
      granted.push(grant);
      return {
        id: "900",
        templateId: grant.templateId,
        quantity: grant.quantity,
        effects: grant.effects,
      };
    },
  };
  const itemTemplates = {
    load: async (id: number) => ({
      id,
      effects: [{ id: 125, param1: 1, param2: 5, param3: "1d5+0" }],
    }),
  };
  const inventoryFrames = {
    sendTemplateFor: async (sessionId: string) =>
      inventoryRefreshes.push(sessionId),
    sendItemAdd: () => undefined,
  };
  const maps = {
    load: async (id: number) => (id === 7411 ? { cells: mapCells } : undefined),
  };
  const transitions = {
    teleport: async (
      sessionId: string,
      id: string,
      mapId: number,
      cellId: number
    ) => teleports.push({ sessionId, id, mapId, cellId }),
  };
  const stats = {
    computeEquipmentStats: async () => ({ vitality: 0 }),
    sendStats: async (sessionId: string) => statsRefreshes.push(sessionId),
  };
  const spells = {
    learnClassSpells: async () => [],
    buildSpellList: async () => [],
  };
  const sessions = {
    get: (sessionId: string) =>
      sessionId === SESSION
        ? { accountId: ACCOUNT, characterId: ACTOR }
        : undefined,
  };
  const frames = { broadcast: () => undefined };
  const txHost = {
    withTransaction: async <T>(callback: () => Promise<T>) => callback(),
  };

  return {
    actor,
    target,
    writes,
    audits,
    granted,
    teleports,
    statsRefreshes,
    inventoryRefreshes,
    service: new AdminService(
      repo as never,
      sessions as never,
      presence as never,
      inventory as never,
      itemTemplates as never,
      inventoryFrames as never,
      maps as never,
      transitions as never,
      stats as never,
      spells as never,
      frames as never,
      txHost as never
    ),
  };
}

describe("AdminService commands", () => {
  test("persists an offline item without trying to refresh a session", async () => {
    const h = harness();
    const response = await h.service.execute(
      SESSION,
      request({
        case: "grantItem",
        value: create(AdminGrantItemCommandSchema, {
          itemId: 1001,
          quantity: 12,
          roll: AdminItemRoll.PERFECT,
        }),
      })
    );

    expect(response.status).toBe(AdminCommandStatus.SUCCESS);
    expect(h.granted).toHaveLength(1);
    expect(h.granted[0]).toMatchObject({
      playerId: ACTOR,
      templateId: 1001,
      quantity: 12,
    });
    expect(h.inventoryRefreshes).toHaveLength(0);
  });

  test("reconciles XP, level and available capitals together", async () => {
    const h = harness();
    const response = await h.service.execute(
      SESSION,
      request({
        case: "changeResource",
        value: create(AdminChangeResourceCommandSchema, {
          resource: AdminResourceKind.XP,
          mode: AdminResourceMode.SET,
          amount: "90",
        }),
      })
    );

    expect(response.status).toBe(AdminCommandStatus.SUCCESS);
    expect(h.actor).toMatchObject({
      experience: "90",
      level: 3,
      statsPoints: 10,
      spellPoints: 2,
    });
  });

  test("refuses an incompatible downgrade without changing the player", async () => {
    const h = harness({ upgradedRemovedSpell: true });
    Object.assign(h.actor, { level: 10, experience: "1000" });
    const response = await h.service.execute(
      SESSION,
      request({
        case: "setLevel",
        value: create(AdminSetLevelCommandSchema, { level: 2 }),
      })
    );

    expect(response.status).toBe(AdminCommandStatus.ERROR);
    expect(response.message).toContain("sort qui serait retiré");
    expect(h.actor).toMatchObject({ level: 10, experience: "1000" });
  });

  test("asks the drawer before teleporting a third party, while chat executes directly", async () => {
    const drawer = harness({ online: true });
    const drawerResponse = await drawer.service.execute(
      SESSION,
      request(
        {
          case: "teleport",
          value: create(AdminTeleportCommandSchema, {
            mode: AdminTeleportMode.TARGET_TO_MAP,
            mapId: 7411,
            cellId: 383,
          }),
        },
        {
          source: AdminCommandSource.DRAWER,
          confirmed: false,
          targetId: drawer.target.id,
        }
      )
    );
    expect(drawerResponse.status).toBe(
      AdminCommandStatus.CONFIRMATION_REQUIRED
    );
    expect(drawer.teleports).toHaveLength(0);

    const chat = harness({ online: true });
    const chatResponse = await chat.service.execute(
      SESSION,
      request(
        {
          case: "teleport",
          value: create(AdminTeleportCommandSchema, {
            mode: AdminTeleportMode.TARGET_TO_MAP,
            mapId: 7411,
            cellId: 383,
          }),
        },
        { targetId: chat.target.id }
      )
    );
    expect(chatResponse.status).toBe(AdminCommandStatus.SUCCESS);
    expect(chat.teleports).toEqual([
      {
        sessionId: "30-session",
        id: "30",
        mapId: 7411,
        cellId: 383,
      },
    ]);
  });

  test("restores and immediately refreshes an online player's statistics", async () => {
    const h = harness({ online: true });
    const response = await h.service.execute(
      SESSION,
      request({
        case: "restore",
        value: create(AdminRestoreCommandSchema, {
          kind: AdminRestoreKind.ALL,
        }),
      })
    );

    expect(response.status).toBe(AdminCommandStatus.SUCCESS);
    expect(h.actor.energy).toBe(10_000);
    expect(h.statsRefreshes).toEqual(["20-session"]);
  });
});
