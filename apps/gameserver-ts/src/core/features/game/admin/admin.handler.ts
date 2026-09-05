import type { HandlerContext } from "@shared/gateway-adapter/ws-router";
import { create } from "@bufbuild/protobuf";
import {
  type AdminCommandRequest,
  AdminCommandRequestSchema,
  type AdminPlayerSearchRequest,
  AdminPlayerSearchRequestSchema,
} from "@dofus/proto/admin_pb";
import { DofusMessageSchema } from "@dofus/proto/server_messages_pb";
import { Injectable } from "@nestjs/common";
import { GatewayFrameService } from "@shared/gateway-adapter/gateway-frame.service";
import { MessageHandler } from "@shared/gateway-adapter/message-handler.decorator";

import { AdminService } from "./admin.service";

@Injectable()
export class AdminHandler {
  constructor(
    private readonly admin: AdminService,
    private readonly frames: GatewayFrameService
  ) {}

  @MessageHandler(AdminPlayerSearchRequestSchema)
  async search(
    ctx: HandlerContext,
    request: AdminPlayerSearchRequest
  ): Promise<void> {
    const response = await this.admin.searchPlayers(ctx.sessionId, request);
    this.frames.broadcast(
      [ctx.sessionId],
      create(DofusMessageSchema, {
        payload: { case: "adminPlayerSearch", value: response },
      })
    );
  }

  @MessageHandler(AdminCommandRequestSchema)
  async execute(
    ctx: HandlerContext,
    request: AdminCommandRequest
  ): Promise<void> {
    const response = await this.admin.execute(ctx.sessionId, request);
    this.frames.broadcast(
      [ctx.sessionId],
      create(DofusMessageSchema, {
        payload: { case: "adminCommand", value: response },
      })
    );
  }
}
