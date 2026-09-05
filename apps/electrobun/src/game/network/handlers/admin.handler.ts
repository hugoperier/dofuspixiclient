import { create } from "@bufbuild/protobuf";
import {
  type AdminCommandRequest,
  AdminCommandSource,
  AdminCommandStatus,
  AdminPlayerSearchRequestSchema,
} from "@dofus/proto/admin_pb";

import type { Connection } from "@/game/network/connection";
import type { MessageHandler } from "@/game/network/message-handler";
import { encodeClient } from "@/game/network/protocol";
import {
  addAdminActivity,
  setAdminCapabilities,
  setAdminPending,
  setAdminSearching,
  setAdminSearchResults,
} from "@/game/stores/admin-store";
import {
  appendChatMessage,
  appendErrorMessage,
} from "@/game/stores/chat-store";

const ADMIN_COLOR = "#b7e45d";

export class AdminHandler {
  private readonly pendingCommands = new Map<string, AdminCommandRequest>();
  private readonly searchSources = new Map<string, AdminCommandSource>();

  constructor(
    private readonly messageHandler: MessageHandler,
    private readonly connection: Connection
  ) {
    this.messageHandler.on("adminCapabilities", (message) =>
      setAdminCapabilities(message.enabled, message.selfPlayerId)
    );
    this.messageHandler.on("adminPlayerSearch", (message) => {
      const source = this.searchSources.get(message.requestId);
      this.searchSources.delete(message.requestId);
      setAdminSearchResults(message.players);
      if (source !== AdminCommandSource.CHAT) {
        return;
      }
      if (message.status !== AdminCommandStatus.SUCCESS) {
        appendErrorMessage(`[Admin] ${message.message}`);
        return;
      }
      appendChatMessage({
        color: ADMIN_COLOR,
        text:
          message.players.length === 0
            ? "[Admin] Aucun personnage trouvé."
            : `[Admin] ${message.players
                .map(
                  (player) =>
                    `${player.playerName} (#${player.playerId}, ${player.online ? "connecté" : "hors ligne"}, ${player.mapId}/${player.cellId})`
                )
                .join(" · ")}`,
      });
    });
    this.messageHandler.on("adminCommand", (message) => {
      const request = this.pendingCommands.get(message.requestId);
      if (message.status !== AdminCommandStatus.CONFIRMATION_REQUIRED) {
        this.pendingCommands.delete(message.requestId);
      }
      addAdminActivity(message);
      if (
        message.status === AdminCommandStatus.CONFIRMATION_REQUIRED &&
        request
      ) {
        setAdminPending({ request, message: message.message });
      } else {
        setAdminPending(null);
      }
      if (message.source !== AdminCommandSource.CHAT) {
        return;
      }
      if (message.status === AdminCommandStatus.SUCCESS) {
        appendChatMessage({
          color: ADMIN_COLOR,
          text: `[Admin] ${message.message}`,
        });
      } else {
        appendErrorMessage(`[Admin] ${message.message}`);
      }
    });
  }

  search(query: string, source: AdminCommandSource): void {
    const requestId = crypto.randomUUID();
    this.searchSources.set(requestId, source);
    setAdminSearching(true);
    this.connection.send(
      encodeClient(
        "adminPlayerSearch",
        create(AdminPlayerSearchRequestSchema, {
          requestId,
          query,
          limit: 20,
          source,
        })
      )
    );
  }

  execute(request: AdminCommandRequest): void {
    this.pendingCommands.set(request.requestId, request);
    this.connection.send(encodeClient("adminCommand", request));
  }
}
