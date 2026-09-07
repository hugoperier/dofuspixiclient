import type { HandlerContext } from "@shared/gateway-adapter/ws-router";
import {
  type GameLeaveRequest,
  GameLeaveRequestSchema,
} from "@dofus/proto/game_pb";
import { FightActionsService } from "@modules/fight/engine/fight.actions.service";
import { FightRegistryService } from "@modules/fight/registry/fight.registry";
import { Injectable } from "@nestjs/common";
import { MessageHandler } from "@shared/gateway-adapter/message-handler.decorator";

@Injectable()
export class FightLeaveHandler {
  constructor(
    private readonly fights: FightRegistryService,
    private readonly actions: FightActionsService
  ) {}

  @MessageHandler(GameLeaveRequestSchema)
  async handleLeave(
    ctx: HandlerContext,
    _msg: GameLeaveRequest
  ): Promise<void> {
    const fight = this.fights.getBySession(ctx.sessionId);
    const fighter = fight
      ?.fighters()
      .find((entry) => entry.sessionId === ctx.sessionId);
    if (fight && fighter) {
      await this.actions.abandon(fight, fighter);
    }
  }
}
