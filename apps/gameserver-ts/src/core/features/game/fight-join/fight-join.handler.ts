import type { HandlerContext } from "@shared/gateway-adapter/ws-router";
import { create } from "@bufbuild/protobuf";
import { InfoMessageSchema } from "@dofus/proto/chat_pb";
import { type GameActionRequest, GameActionRequestSchema, GameMovementSchema } from "@dofus/proto/game_pb";
import { FightGetListRequestSchema, FightGetDetailsRequestSchema, type FightGetDetailsRequest } from "@dofus/proto/misc_pb";
import { DofusMessageSchema } from "@dofus/proto/server_messages_pb";
import { FightStartService } from "@features/game/fight-start/fight-start.service";
import { fighterEntry } from "@features/game/fight-start/fight-start.shared";
import { FightRegistryService } from "@modules/fight/registry/fight.registry";
import { FightSpectatorService } from "@modules/fight/engine/fight.spectator.service";
import { FightWorldService } from "@modules/fight/engine/fight.world.service";
import { FightType, StateName } from "@modules/fight/fight.types";
import { PlayerPresenceService } from "@modules/player-presence/player-presence.service";
import { PendingMovesService } from "@modules/player-presence/player-presence.pending-moves.service";
import { ExchangeService } from "@modules/exchange/exchange.service";
import { HarvestService } from "@modules/harvest/harvest.service";
import { Injectable } from "@nestjs/common";
import { GatewayFrameService } from "@shared/gateway-adapter/gateway-frame.service";
import { MessageHandler } from "@shared/gateway-adapter/message-handler.decorator";
import { SessionRegistry } from "@shared/gateway-adapter/session-registry";

@Injectable()
export class FightJoinHandler {
  constructor(private readonly sessions: SessionRegistry, private readonly presence: PlayerPresenceService, private readonly frames: GatewayFrameService, private readonly fights: FightRegistryService, private readonly start: FightStartService, private readonly spectators: FightSpectatorService, private readonly world: FightWorldService, private readonly pending: PendingMovesService, private readonly exchange: ExchangeService, private readonly harvest: HarvestService) {}

  @MessageHandler(GameActionRequestSchema)
  async handleJoinFight(ctx: HandlerContext, msg: GameActionRequest): Promise<void> {
    if (msg.actionType !== 903 && msg.actionType !== 976) return;
    const request = parseFightAdmission(msg.params);
    if (!request) return this.reject(ctx, "Demande de combat invalide.");
    const spectator = msg.actionType === 976;
    if (!this.fights.reserveSessions([ctx.sessionId])) return this.reject(ctx, "Vous êtes déjà dans un combat ou en train de le rejoindre.");
    try {
      const player = this.player(ctx.sessionId);
      const fight = this.fights.getById(request.fightId);
      if (!player || !fight || fight.ending || player.mapId !== fight.mapId) return this.reject(ctx, "Ce combat n’est plus disponible sur cette carte.");
      if (this.busy(ctx.sessionId, player.characterId)) return this.reject(ctx, "Terminez votre action avant de rejoindre un combat.");
      // Database I/O precedes the combat queue; all authority is rechecked below.
      const fighter = spectator ? undefined : await this.start.loadPlayerFighter(ctx.sessionId, player);
      if (!spectator && !fighter) return this.reject(ctx, "Impossible de charger votre personnage.");
      await fight.runAction(() => {
        const current = this.player(ctx.sessionId);
        if (!current || current.mapId !== fight.mapId || this.fights.getById(fight.id) !== fight || fight.ending || this.fights.isInFight(ctx.sessionId)) return this.reject(ctx, "Ce combat n’est plus disponible.");
        if (this.busy(ctx.sessionId, current.characterId)) return this.reject(ctx, "Terminez votre action avant de rejoindre un combat.");
        if (spectator) {
          if (fight.state.name !== StateName.Active || fight.lockedSpectators) return this.reject(ctx, "Ce combat n’accepte pas de spectateurs.");
          fight.spectators.push({ sessionId: ctx.sessionId, playerId: Number(current.characterId) });
        } else {
          if (fight.state.name !== StateName.Placement || !fighter) return this.reject(ctx, "Le combat a déjà commencé.");
          const team = request.teamId === undefined ? fight.teams[0] : fight.teams.find((t) => t.leaderId === request.teamId);
          if (!team || (fight.type === FightType.PvM && team.side === 1)) return this.reject(ctx, "Vous ne pouvez pas rejoindre ce camp.");
          if (team.locked || team.partyOnly) return this.reject(ctx, "Cette équipe est verrouillée.");
          const cell = fight.fightMap.teamCells[team.side].find((cell) => fight.fightMap.isFree(cell));
          if (team.fighters().length >= 8 || cell === undefined) return this.reject(ctx, "Cette équipe est complète.");
          const peers = fight.allSessions();
          team.add(fighter);
          fighter.cell = cell;
          fighter.refreshResources();
          fight.fightMap.occupy(cell, fighter.id);
          this.frames.broadcast(peers, create(DofusMessageSchema, { payload: { case: "gameMovement", value: create(GameMovementSchema, { entries: [fighterEntry(fighter, this.presence.onMap(fight.mapId), fighter)] }) } }));
        }
        this.fights.registerSession(ctx.sessionId, fight.id);
        this.spectators.sendInitial(fight, ctx.sessionId, fighter ?? undefined);
        this.fights.changed(fight);
      });
    } finally {
      this.fights.releaseSessions([ctx.sessionId]);
    }
  }

  @MessageHandler(FightGetListRequestSchema)
  handleList(ctx: HandlerContext): void {
    const player = this.player(ctx.sessionId);
    if (player && !this.fights.isInFight(ctx.sessionId)) this.world.sendList([ctx.sessionId], player.mapId);
  }

  @MessageHandler(FightGetDetailsRequestSchema)
  handleDetails(ctx: HandlerContext, msg: FightGetDetailsRequest): void {
    const player = this.player(ctx.sessionId);
    const fight = this.fights.getById(msg.fightId);
    if (player && fight && !fight.ending && player.mapId === fight.mapId && !this.fights.isInFight(ctx.sessionId)) this.world.sendDetails(ctx.sessionId, fight);
    else { this.reject(ctx, "Ce combat n’est plus disponible."); this.handleList(ctx); }
  }

  private player(sessionId: string) {
    const characterId = this.sessions.get(sessionId)?.characterId;
    const player = characterId ? this.presence.getByCharacter(characterId) : undefined;
    return player?.sessionId === sessionId ? player : undefined;
  }
  private busy(sessionId: string, characterId: string): boolean {
    return !!this.pending.peek(sessionId) || this.exchange.blocksMovement(sessionId) || this.harvest.isRunning(characterId);
  }
  private reject(ctx: HandlerContext, message: string): void {
    this.frames.broadcast([ctx.sessionId], create(DofusMessageSchema, { payload: { case: "infoMessage", value: create(InfoMessageSchema, { message }) } }));
  }
}

export function parseFightAdmission(params: string): { fightId: number; teamId?: number } | null {
  if (!/^\d+(;-?\d+)?$/.test(params)) return null;
  const [fightId, teamId] = params.split(";").map(Number);
  if (!Number.isSafeInteger(fightId) || fightId! <= 0 || (teamId !== undefined && !Number.isSafeInteger(teamId))) return null;
  return { fightId: fightId!, ...(teamId !== undefined ? { teamId } : {}) };
}
