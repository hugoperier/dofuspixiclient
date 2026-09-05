import { describe, expect, test } from "bun:test";

import { create } from "@bufbuild/protobuf";
import {
  AdminCommandRequestSchema,
  AdminCommandSource,
  AdminCommandStatus,
  AdminPlayerSearchRequestSchema,
  AdminRestoreCommandSchema,
  AdminRestoreKind,
  AdminTargetRefSchema,
} from "@dofus/proto/admin_pb";

import { AdminService } from "./admin.service";

const SESSION = "session-admin";
const ACCOUNT = "10";
const PLAYER = "20";

function serviceWith(repo: Record<string, unknown>) {
  const sessions = {
    get: (sessionId: string) =>
      sessionId === SESSION
        ? { sessionId, accountId: ACCOUNT, characterId: PLAYER }
        : undefined,
  };
  return new AdminService(
    repo as never,
    sessions as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );
}

describe("AdminService authorization", () => {
  test("denies and audits a non-admin player search", async () => {
    const audits: unknown[] = [];
    const service = serviceWith({
      isAdmin: async () => false,
      writeAudit: async (audit: unknown) => audits.push(audit),
    });

    const response = await service.searchPlayers(
      SESSION,
      create(AdminPlayerSearchRequestSchema, {
        requestId: crypto.randomUUID(),
        source: AdminCommandSource.DRAWER,
        query: "Ely",
        limit: 20,
      })
    );

    expect(response.status).toBe(AdminCommandStatus.FORBIDDEN);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorAccountId: ACCOUNT,
      result: "forbidden",
      command: "search_players",
    });
  });

  test("denies and audits a forged command without touching gameplay adapters", async () => {
    const audits: unknown[] = [];
    let gameplayTouched = false;
    const service = serviceWith({
      findAudit: async () => undefined,
      isAdmin: async () => false,
      findPlayerById: async () => {
        gameplayTouched = true;
        return undefined;
      },
      writeAudit: async (audit: unknown) => audits.push(audit),
    });
    const response = await service.execute(
      SESSION,
      create(AdminCommandRequestSchema, {
        requestId: crypto.randomUUID(),
        source: AdminCommandSource.CHAT,
        confirmed: true,
        target: create(AdminTargetRefSchema, {
          identifier: { case: "playerId", value: "999" },
        }),
        command: {
          case: "restore",
          value: create(AdminRestoreCommandSchema, {
            kind: AdminRestoreKind.ALL,
          }),
        },
      })
    );

    expect(response.status).toBe(AdminCommandStatus.FORBIDDEN);
    expect(gameplayTouched).toBe(false);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorAccountId: ACCOUNT,
      actorPlayerId: PLAYER,
      result: "forbidden",
    });
  });

  test("rechecks authorization then replays a completed request without mutating", async () => {
    let authorizationChecks = 0;
    const requestId = "e01da349-2b42-4f2f-b22d-6dd465ad39b6";
    const service = serviceWith({
      findAudit: async () => ({
        requestId,
        actorAccountId: ACCOUNT,
        actorPlayerId: PLAYER,
        targetPlayerId: null,
        source: "chat",
        command: "restore",
        parameters: {},
        beforeState: { life: 1 },
        afterState: { life: 100 },
        result: "success",
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      isAdmin: async () => {
        authorizationChecks++;
        return true;
      },
    });
    const response = await service.execute(
      SESSION,
      create(AdminCommandRequestSchema, {
        requestId,
        source: AdminCommandSource.CHAT,
        confirmed: true,
        target: create(AdminTargetRefSchema, {
          identifier: { case: "self", value: true },
        }),
        command: {
          case: "restore",
          value: create(AdminRestoreCommandSchema, {
            kind: AdminRestoreKind.ALL,
          }),
        },
      })
    );

    expect(response.status).toBe(AdminCommandStatus.SUCCESS);
    expect(response.after).toContain('"life":100');
    expect(authorizationChecks).toBe(1);
  });

  test("refuses to confirm a different command under the same UUID", async () => {
    const requestId = "cf2bfc1e-8552-4e63-8e6b-f95c53b63322";
    const original = create(AdminCommandRequestSchema, {
      requestId,
      source: AdminCommandSource.DRAWER,
      target: create(AdminTargetRefSchema, {
        identifier: { case: "self", value: true },
      }),
      command: {
        case: "restore",
        value: create(AdminRestoreCommandSchema, {
          kind: AdminRestoreKind.ALL,
        }),
      },
    });
    const service = serviceWith({
      isAdmin: async () => true,
      findAudit: async () => ({
        requestId,
        actorAccountId: ACCOUNT,
        actorPlayerId: PLAYER,
        targetPlayerId: PLAYER,
        source: "drawer",
        command: "restore",
        parameters: {
          target: original.target?.identifier,
          command: original.command,
          confirmed: false,
        },
        beforeState: { life: 1 },
        afterState: null,
        result: "confirmation_required",
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    });

    const response = await service.execute(
      SESSION,
      create(AdminCommandRequestSchema, {
        ...original,
        confirmed: true,
        command: {
          case: "restore",
          value: create(AdminRestoreCommandSchema, {
            kind: AdminRestoreKind.LIFE,
          }),
        },
      })
    );

    expect(response.status).toBe(AdminCommandStatus.FORBIDDEN);
    expect(response.message).toContain("ne correspond pas");
  });
});
