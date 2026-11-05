import type { Session } from "@shared/gateway-adapter/session-registry";
import { create } from "@bufbuild/protobuf";
import { InfoMessageSchema } from "@dofus/proto/chat_pb";
import { DofusMessageSchema } from "@dofus/proto/server_messages_pb";
import { AccountsRepository } from "@modules/accounts/accounts.repository";
import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { GatewayFrameService } from "@shared/gateway-adapter/gateway-frame.service";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** `09/09/2026 à 21:14`, in the server's own timezone. */
function formatWhen(at: Date): string {
  const date = `${pad(at.getDate())}/${pad(at.getMonth() + 1)}/${at.getFullYear()}`;

  return `${date} à ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/**
 * The two lines the player reads on arrival: who they are and when the
 * account was last used.
 *
 * The second line is the point. An account whose previous connection the
 * owner does not recognise is the only signal they get that somebody else
 * has the password, and nothing in the client ever showed it.
 */
@Injectable()
export class WelcomeService {
  private readonly logger = new Logger(WelcomeService.name);
  // Sessions already greeted. `GameCreateRequest` is re-sent on *every*
  // map change (the client re-enters the game to be repopulated), so
  // without this the welcome would repeat on every screen transition.
  private readonly greeted = new Set<string>();

  constructor(
    private readonly accounts: AccountsRepository,
    private readonly frames: GatewayFrameService
  ) {}

  async sendWelcome(
    sessionId: string,
    accountId: string,
    characterName: string
  ): Promise<void> {
    if (this.greeted.has(sessionId)) {
      return;
    }

    this.greeted.add(sessionId);

    this.send(
      sessionId,
      `Bienvenue dans le Monde des Douze, ${characterName} !`
    );

    try {
      const previous = await this.accounts.findPreviousLogin(accountId);

      this.send(sessionId, this.lastConnectionLine(previous));
    } catch (err) {
      // A missing history line must never cost the player their entry
      // into the world — everything else on this path has already run.
      this.logger.error(
        `welcome: previous login lookup failed for account=${accountId}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  private lastConnectionLine(
    previous: { at: Date; ip: string | null } | undefined
  ): string {
    if (!previous) {
      return "Ceci est votre première connexion.";
    }

    const when = `Dernière connexion : le ${formatWhen(previous.at)}`;

    return previous.ip
      ? `${when}, depuis l'adresse IP ${previous.ip}.`
      : `${when}.`;
  }

  private send(sessionId: string, message: string): void {
    this.frames.broadcast(
      [sessionId],
      create(DofusMessageSchema, {
        payload: {
          case: "infoMessage",
          value: create(InfoMessageSchema, { message }),
        },
      })
    );
  }

  @OnEvent("session.closed")
  onSessionClosed({ session }: { session: Session }): void {
    this.greeted.delete(session.sessionId);
  }
}
