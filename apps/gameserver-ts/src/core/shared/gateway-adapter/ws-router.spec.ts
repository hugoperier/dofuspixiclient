import "reflect-metadata";

import { describe, expect, mock, test } from "bun:test";

import { create } from "@bufbuild/protobuf";
import {
  AccountGetServersListSchema,
  AccountSelectCharacterSchema,
  AccountSendIdentitySchema,
} from "@dofus/proto/account_pb";
import { Injectable } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { MessageHandler } from "@shared/gateway-adapter/message-handler.decorator";
import { SessionRegistry } from "@shared/gateway-adapter/session-registry";
import { WsRouter } from "@shared/gateway-adapter/ws-router";
import { ClsModule } from "nestjs-cls";

const identityHandler = mock(() => {});
const serversHandler = mock(() => {});

@Injectable()
class TestHandlers {
  @MessageHandler(AccountSendIdentitySchema)
  onIdentity() {
    identityHandler();
  }

  @MessageHandler(AccountGetServersListSchema)
  onServers() {
    serversHandler();
  }
}

// The router opens a CLS context per frame so that every line logged
// underneath carries the session; the registry is how it learns the character
// on that session. Neither changes dispatch, so the double is the empty
// answer.
const noSessions = { get: () => undefined };

function buildModuleWith(providers: unknown[]) {
  return Test.createTestingModule({
    imports: [DiscoveryModule, ClsModule.forRoot()],
    providers: [
      WsRouter,
      { provide: SessionRegistry, useValue: noSessions },
      ...(providers as never[]),
    ],
  }).compile();
}

async function buildModule() {
  return buildModuleWith([TestHandlers]);
}

describe("WsRouter", () => {
  test("registers one handler per @MessageHandler-annotated method", async () => {
    const mod = await buildModule();
    await mod.init();

    const router = mod.get(WsRouter);
    const handlers = (router as unknown as { handlers: Map<string, unknown[]> })
      .handlers;

    expect(handlers.size).toBe(2);
    expect(handlers.get(AccountSendIdentitySchema.typeName)).toHaveLength(1);
    expect(handlers.get(AccountGetServersListSchema.typeName)).toHaveLength(1);

    await mod.close();
  });

  test("dispatches by proto typeName", async () => {
    identityHandler.mockClear();
    serversHandler.mockClear();

    const mod = await buildModule();
    await mod.init();
    const router = mod.get(WsRouter);

    await router.dispatch(
      { sessionId: "s-1" },
      create(AccountSendIdentitySchema, {
        username: "alice",
        encryptedPassword: "ciphertext",
      })
    );

    expect(identityHandler).toHaveBeenCalledTimes(1);
    expect(serversHandler).toHaveBeenCalledTimes(0);

    await mod.close();
  });

  test("silently drops unknown message types", async () => {
    const mod = await buildModule();
    await mod.init();
    const router = mod.get(WsRouter);

    const unknown = create(AccountSelectCharacterSchema, { characterId: 7 });

    await expect(
      router.dispatch({ sessionId: "s-1" }, unknown)
    ).resolves.toBeUndefined();

    await mod.close();
  });

  test("fans out to every handler registered for a typeName", async () => {
    const secondIdentity = mock(() => {});

    @Injectable()
    class SecondIdentityHandlers {
      @MessageHandler(AccountSendIdentitySchema)
      onIdentity() {
        secondIdentity();
      }
    }

    identityHandler.mockClear();

    const mod = await buildModuleWith([TestHandlers, SecondIdentityHandlers]);
    await mod.init();

    const router = mod.get(WsRouter);

    await router.dispatch(
      { sessionId: "s-1" },
      create(AccountSendIdentitySchema, {
        username: "alice",
        encryptedPassword: "ciphertext",
      })
    );

    expect(identityHandler).toHaveBeenCalledTimes(1);
    expect(secondIdentity).toHaveBeenCalledTimes(1);

    await mod.close();
  });
});
