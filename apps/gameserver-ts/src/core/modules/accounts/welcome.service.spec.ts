import "reflect-metadata";

import { beforeEach, expect, test } from "bun:test";

import type { DofusMessage } from "@dofus/proto/server_messages_pb";
import type { GatewayFrameService } from "@shared/gateway-adapter/gateway-frame.service";
import type { Session } from "@shared/gateway-adapter/session-registry";

import type { AccountsRepository, PreviousLogin } from "./accounts.repository";
import { WelcomeService } from "./welcome.service";

let sent: string[] = [];

const frames = {
  broadcast: (_targets: string[], message: DofusMessage) => {
    if (message.payload.case === "infoMessage") {
      sent.push(message.payload.value.message);
    }
  },
} as unknown as GatewayFrameService;

function service(previous?: PreviousLogin): WelcomeService {
  const accounts = {
    findPreviousLogin: async () => previous,
  } as unknown as AccountsRepository;

  return new WelcomeService(accounts, frames);
}

beforeEach(() => {
  sent = [];
});

test("greets the character and names the previous connection", async () => {
  const welcome = service({
    at: new Date(2026, 8, 9, 21, 14),
    ip: "82.64.12.7",
  });

  await welcome.sendWelcome("session-1", "1", "Mikos");

  expect(sent).toEqual([
    "Bienvenue dans le Monde des Douze, Mikos !",
    "Dernière connexion : le 09/09/2026 à 21:14, depuis l'adresse IP 82.64.12.7.",
  ]);
});

test("says so when there is no previous connection", async () => {
  await service().sendWelcome("session-1", "1", "Mikos");

  expect(sent[1]).toBe("Ceci est votre première connexion.");
});

test("omits the address when the previous login has none", async () => {
  const welcome = service({ at: new Date(2026, 8, 9, 21, 14), ip: null });

  await welcome.sendWelcome("session-1", "1", "Mikos");

  expect(sent[1]).toBe("Dernière connexion : le 09/09/2026 à 21:14.");
});

test("greets once per session, however many times the player re-enters", async () => {
  const welcome = service();

  // Every map change re-enters the game through the same handler.
  await welcome.sendWelcome("session-1", "1", "Mikos");
  await welcome.sendWelcome("session-1", "1", "Mikos");

  expect(sent).toHaveLength(2);
});

test("a reconnecting session is greeted again", async () => {
  const welcome = service();

  await welcome.sendWelcome("session-1", "1", "Mikos");
  welcome.onSessionClosed({ session: { sessionId: "session-1" } as Session });
  await welcome.sendWelcome("session-1", "1", "Mikos");

  expect(sent).toHaveLength(4);
});

test("a failed history lookup still lets the player in", async () => {
  const accounts = {
    findPreviousLogin: async () => {
      throw new Error("db down");
    },
  } as unknown as AccountsRepository;

  await new WelcomeService(accounts, frames).sendWelcome("s", "1", "Mikos");

  expect(sent).toEqual(["Bienvenue dans le Monde des Douze, Mikos !"]);
});
