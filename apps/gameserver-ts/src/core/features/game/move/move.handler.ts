import type { HandlerContext } from "@shared/gateway-adapter/ws-router";
import { create } from "@bufbuild/protobuf";
import {
  ActionMovementSchema,
  type GameActionRequest,
  GameActionRequestSchema,
  GameActionSchema,
  GameActionsStartSchema,
  GameActionType,
} from "@dofus/proto/game_pb";
import { DofusMessageSchema } from "@dofus/proto/server_messages_pb";
import { ExchangeService } from "@modules/exchange/exchange.service";
import { FightRegistryService } from "@modules/fight/registry/fight.registry";
import { HarvestService } from "@modules/harvest/harvest.service";
import {
  type CachedMap,
  MapCacheService,
} from "@modules/maps/maps.cache.service";
import {
  decodePathParams,
  MalformedPathError,
} from "@modules/maps/maps.path-codec";
import {
  InvalidPathError,
  type ValidatedPath,
  validatePath,
} from "@modules/maps/maps.validate-path";
import { PendingMovesService } from "@modules/player-presence/player-presence.pending-moves.service";
import { PlayerPresenceService } from "@modules/player-presence/player-presence.service";
import { Injectable, Logger } from "@nestjs/common";
import { GatewayFrameService } from "@shared/gateway-adapter/gateway-frame.service";
import { MessageHandler } from "@shared/gateway-adapter/message-handler.decorator";
import { SessionRegistry } from "@shared/gateway-adapter/session-registry";

// Validates the client's path (adjacency + walkability) and opens an
// in-flight entry keyed by session. The committed cell isn't touched until
// GameActionAck arrives — see MoveAckHandler.

@Injectable()
export class MoveHandler {
  private readonly logger = new Logger(MoveHandler.name);

  constructor(
    private readonly mapCache: MapCacheService,
    private readonly presence: PlayerPresenceService,
    private readonly pending: PendingMovesService,
    private readonly exchange: ExchangeService,
    private readonly harvest: HarvestService,
    private readonly sessions: SessionRegistry,
    private readonly frames: GatewayFrameService,
    private readonly fights: FightRegistryService
  ) {}

  @MessageHandler(GameActionRequestSchema)
  async handle(ctx: HandlerContext, msg: GameActionRequest): Promise<void> {
    if (this.fights.isInFight(ctx.sessionId)) {
      return;
    }
    if (msg.actionType !== GameActionType.ACTION_MOVEMENT) {
      return;
    }

    const session = this.sessions.get(ctx.sessionId);

    if (!session?.characterId) {
      this.logger.debug("move dropped: session has no character yet");
      return;
    }

    // A trade pins both players where they stand until it ends. The
    // canonical client will not even send this while the Exchange
    // window is up, but ours has to be told, and the same-map rule the
    // trade enforces would be meaningless if either side could walk
    // off mid-deal. A bank or a chest does not block — see
    // `ExchangeService.blocksMovement`.
    if (this.exchange.blocksMovement(ctx.sessionId)) {
      this.logger.debug("move dropped: an exchange pins the character");
      return;
    }

    // Harvest owns the character until the server's deadline. The client
    // suppresses the click too, but this is the authority: a modified or
    // lagging client still cannot move or cancel the action.
    if (this.harvest.isRunning(session.characterId)) {
      this.logger.debug("move dropped: a harvest owns the character");
      return;
    }

    const placed = this.presence.getByCharacter(session.characterId);

    if (!placed) {
      this.logger.warn(`move: no presence session=${ctx.sessionId}`);
      return;
    }

    const map = await this.mapCache.load(placed.mapId);
    if (this.fights.isInFight(ctx.sessionId)) {
      return;
    }

    if (!map) {
      this.logger.warn(`move: map not cached id=${placed.mapId}`);
      return;
    }

    const rawParams = firstField(msg.params);
    const validated = this.tryValidate(rawParams, placed.cellId, map, ctx);

    if (!validated) {
      return;
    }

    const actionId = this.pending.allocateActionId();

    this.pending.set({
      sessionId: ctx.sessionId,
      characterId: session.characterId,
      actionId,
      mapId: placed.mapId,
      endCell: validated.endCell,
      endDirection: validated.endDirection,
      // Kept so an interruption can be checked against the path that
      // was actually authorised — see `MoveAckHandler`.
      steps: validated.steps,
    });

    const targets = this.presence.sessionsOnMap(placed.mapId);

    // The counterpart of the client's `move sent=…` line. Between the two,
    // a walk that visibly crossed half the map can be pinned on whichever
    // side actually produced the long path.
    //
    // `truncated` is the one field here that was never surfaced anywhere: it
    // says an unwalkable step cut the walk short, so the client is animating
    // to one cell while the server has committed to another.
    this.logger.debug(
      `move ok action=${actionId} ${placed.cellId} → ${validated.endCell} ` +
        `${validated.steps.length} step(s) truncated=${validated.truncated} ` +
        `map=${placed.mapId} witnesses=${targets.length} ` +
        `path=${formatCells(validated.cells)}`
    );

    this.frames.broadcast(
      targets,
      create(DofusMessageSchema, {
        payload: {
          case: "gameActionsStart",
          value: create(GameActionsStartSchema, {
            spriteId: session.characterId,
          }),
        },
      })
    );

    this.frames.broadcast(
      targets,
      create(DofusMessageSchema, {
        payload: {
          case: "gameAction",
          value: create(GameActionSchema, {
            sequenceId: actionId,
            actionType: GameActionType.ACTION_MOVEMENT,
            spriteId: session.characterId,
            rawParams,
            actionData: {
              case: "movement",
              value: create(ActionMovementSchema, {
                pathCells: [placed.cellId, ...validated.cells],
              }),
            },
          }),
        },
      })
    );
  }

  private tryValidate(
    rawParams: string,
    startCell: number,
    map: CachedMap,
    ctx: HandlerContext
  ): ValidatedPath | undefined {
    try {
      return validatePath(
        startCell,
        decodePathParams(rawParams, map.width),
        map
      );
    } catch (err) {
      if (
        err instanceof MalformedPathError ||
        err instanceof InvalidPathError
      ) {
        this.logger.warn(`move: ${err.message} session=${ctx.sessionId}`);
        return undefined;
      }
      throw err;
    }
  }
}

/**
 * Renders a path for a log line: whole when short, head and tail when not.
 * `MAX_PATH_LENGTH` is 64, and 64 cell ids would drown the line.
 */
function formatCells(cells: readonly number[]): string {
  if (cells.length <= 20) {
    return `[${cells.join(",")}]`;
  }

  const head = cells.slice(0, 12).join(",");
  const tail = cells.slice(-8).join(",");

  return `[${head},…${cells.length - 20} more…,${tail}]`;
}

function firstField(params: string): string {
  const idx = params.indexOf(";");

  return idx < 0 ? params : params.slice(0, idx);
}
