import type { HandlerContext } from "@shared/gateway-adapter/ws-router";
import {
  type GameActionRequest,
  GameActionRequestSchema,
  GameActionType,
  type GameTurnEnd,
  GameTurnEndSchema,
  type GameTurnOk,
  GameTurnOkSchema,
} from "@dofus/proto/game_pb";
import { CastError } from "@modules/fight/cast/fight.cast";
import { FightActionsService } from "@modules/fight/engine/fight.actions.service";
import { FightRegistryService } from "@modules/fight/registry/fight.registry";
import { decodePath } from "@modules/maps/maps.path-codec";
import { Injectable } from "@nestjs/common";
import { MessageHandler } from "@shared/gateway-adapter/message-handler.decorator";

@Injectable()
export class FightTurnHandler {
  constructor(
    private readonly fights: FightRegistryService,
    private readonly actions: FightActionsService
  ) {}

  @MessageHandler(GameTurnOkSchema)
  handleTurnOk(ctx: HandlerContext, msg: GameTurnOk): void {
    const fight = this.fights.getBySession(ctx.sessionId);
    if (!fight || fight.id !== msg.fightId) return;
    const fighter = fight.fighters().find((entry) => entry.sessionId === ctx.sessionId);
    if (!fighter || String(fighter.id) !== msg.spriteId) return;
    this.fights.getRunner(fight.id)?.notifyReady(fighter.id, msg.turnEpoch);
  }

  @MessageHandler(GameTurnEndSchema)
  async handleTurnEnd(ctx: HandlerContext, _msg: GameTurnEnd): Promise<void> {
    const fight = this.fights.getBySession(ctx.sessionId);
    const fighter = fight
      ?.fighters()
      .find((entry) => entry.sessionId === ctx.sessionId);
    if (!fight || !fighter) {
      return;
    }
    const epoch = fight.turnEpoch;
    await fight.runAction(() => {
      if (fight.turnEpoch === epoch && !fight.ending) {
        this.fights.getRunner(fight.id)?.requestEnd(fighter.id);
      }
    });
  }

  @MessageHandler(GameActionRequestSchema)
  async handleAction(
    ctx: HandlerContext,
    msg: GameActionRequest
  ): Promise<void> {
    if (
      msg.actionType !== GameActionType.ACTION_MOVEMENT &&
      msg.actionType !== GameActionType.ACTION_SPELL_LAUNCH
    ) {
      return;
    }
    const fight = this.fights.getBySession(ctx.sessionId);
    const fighter = fight
      ?.fighters()
      .find((entry) => entry.sessionId === ctx.sessionId);
    if (!fight || !fighter) {
      return;
    }
    try {
      if (msg.actionType === GameActionType.ACTION_MOVEMENT) {
        let cells: number[];
        try {
          cells = decodePath(msg.params).map((step) => step.cell);
        } catch {
          throw new CastError("bad_path", "Chemin invalide.");
        }
        await this.actions.move(fight, fighter, cells);
      } else {
        await this.actions.cast(fight, fighter, msg.params);
      }
    } catch (error) {
      this.actions.reject(ctx.sessionId, fighter.id, error);
    }
  }
}
