import type { Fight } from "@modules/fight/core/fight.entity";
import type { Fighter } from "@modules/fight/core/fight.fighter";
import type { HandlerContext } from "@shared/gateway-adapter/ws-router";
import { create } from "@bufbuild/protobuf";
import {
  GameFightOptionSchema,
  GameFlagSchema,
  type GameSetFlag,
  GameSetFlagSchema,
} from "@dofus/proto/game_pb";
import {
  type FightBlockJoinExceptPartyRequest,
  FightBlockJoinExceptPartyRequestSchema,
  type FightBlockJoinRequest,
  FightBlockJoinRequestSchema,
  type FightBlockSpectatorsRequest,
  FightBlockSpectatorsRequestSchema,
  type FightNeedHelpRequest,
  FightNeedHelpRequestSchema,
} from "@dofus/proto/misc_pb";
import { DofusMessageSchema } from "@dofus/proto/server_messages_pb";
import { FightOptionCode } from "@modules/fight/core/fight.entity.types";
import { StateName } from "@modules/fight/fight.types";
import { FightRegistryService } from "@modules/fight/registry/fight.registry";
import { Injectable } from "@nestjs/common";
import { GatewayFrameService } from "@shared/gateway-adapter/gateway-frame.service";
import { MessageHandler } from "@shared/gateway-adapter/message-handler.decorator";

/**
 * The six preparation-phase controls DOFUS Retro shows above "Prêt".
 * Two of them — tactical mode and creature mode — are pure client render
 * modes and never reach this handler. The other four are leader-only
 * toggles mirrored to every participant as `GameFightOption` (`Go`), and
 * the "show a cell" arrow travels as `GameSetFlag` / `GameFlag` (`Gf`).
 */
@Injectable()
export class FightOptionsHandler {
  constructor(
    private readonly frames: GatewayFrameService,
    private readonly fights: FightRegistryService
  ) {}

  @MessageHandler(FightNeedHelpRequestSchema)
  handleNeedHelp(ctx: HandlerContext, _msg: FightNeedHelpRequest): void {
    this.toggle(ctx, FightOptionCode.NeedHelp);
  }

  @MessageHandler(FightBlockJoinRequestSchema)
  handleBlockJoin(ctx: HandlerContext, _msg: FightBlockJoinRequest): void {
    this.toggle(ctx, FightOptionCode.BlockJoin);
  }

  @MessageHandler(FightBlockJoinExceptPartyRequestSchema)
  handlePartyOnly(
    ctx: HandlerContext,
    _msg: FightBlockJoinExceptPartyRequest
  ): void {
    this.toggle(ctx, FightOptionCode.PartyOnly);
  }

  @MessageHandler(FightBlockSpectatorsRequestSchema)
  handleBlockSpectators(
    ctx: HandlerContext,
    _msg: FightBlockSpectatorsRequest
  ): void {
    this.toggle(ctx, FightOptionCode.BlockSpectators);
  }

  /**
   * The red arrow a fighter drops on a cell to say "go there" / "hit
   * that one". Any fighter may place one, in placement and in combat,
   * and only their own team sees it.
   */
  @MessageHandler(GameSetFlagSchema)
  handleSetFlag(ctx: HandlerContext, msg: GameSetFlag): void {
    const found = this.resolve(ctx);
    if (!found) {
      return;
    }
    const { fight, fighter } = found;
    if (!fight.fightMap.isWalkable(msg.cellId)) {
      return;
    }

    this.frames.broadcast(
      this.teamSessions(fight, fighter),
      create(DofusMessageSchema, {
        payload: {
          case: "gameFlag",
          value: create(GameFlagSchema, {
            spriteId: String(fighter.id),
            cellId: msg.cellId,
          }),
        },
      })
    );
  }

  /**
   * Placement-only for help / lock / party, because nobody can join a
   * fight once it is running. Blocking spectators stays togglable mid
   * fight, as in 1.29.
   */
  private toggle(ctx: HandlerContext, code: FightOptionCode): void {
    const found = this.resolve(ctx);
    if (!found) {
      return;
    }
    const { fight, fighter } = found;
    if (!fight.isLeader(fighter.id)) {
      return;
    }
    if (
      code !== FightOptionCode.BlockSpectators &&
      fight.state.name !== StateName.Placement
    ) {
      return;
    }

    const enabled = fight.toggleOption(code);
    this.broadcastOption(fight, fighter.id, code, enabled);
  }

  private broadcastOption(
    fight: Fight,
    leaderId: number,
    code: FightOptionCode,
    enabled: boolean
  ): void {
    this.frames.broadcast(
      fight.allSessions(),
      create(DofusMessageSchema, {
        payload: {
          case: "gameFightOption",
          value: create(GameFightOptionSchema, {
            enabled,
            option: code,
            leaderId,
          }),
        },
      })
    );
  }

  private resolve(
    ctx: HandlerContext
  ): { fight: Fight; fighter: Fighter } | null {
    const fight = this.fights.getBySession(ctx.sessionId);
    if (!fight) {
      return null;
    }
    const fighter = fight
      .fighters()
      .find((entry) => entry.sessionId === ctx.sessionId);
    return fighter ? { fight, fighter } : null;
  }

  private teamSessions(fight: Fight, fighter: Fighter): string[] {
    const side = fighter.team?.side;
    if (side === undefined) {
      return [];
    }
    const sessions: string[] = [];
    for (const entry of fight.fighters()) {
      if (entry.team?.side === side && entry.sessionId) {
        sessions.push(entry.sessionId);
      }
    }
    return sessions;
  }
}
