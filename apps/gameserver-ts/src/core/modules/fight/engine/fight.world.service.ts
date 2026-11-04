import { create } from "@bufbuild/protobuf";
import { fightDistance, totalCells } from "@dofus/grid";
import { GameChallengeSchema, GameChallenge_Operation, FightMapTeamSchema, GameTeamSchema, TeamMemberSchema, TeamMember_Operation, GameMovementSchema, SpriteMovementEntrySchema, SpriteMovementEntry_Operation } from "@dofus/proto/game_pb";
import { FightsCountSchema, FightsListSchema, FightListEntrySchema, FightTeamSummarySchema, FightsDetailsSchema, FightDetailMemberSchema } from "@dofus/proto/misc_pb";
import { DofusMessageSchema } from "@dofus/proto/server_messages_pb";
import { Injectable } from "@nestjs/common";
import { PlayerPresenceService } from "@modules/player-presence/player-presence.service";
import { GatewayFrameService } from "@shared/gateway-adapter/gateway-frame.service";
import { FightRegistryService } from "../registry/fight.registry";
import type { Fight } from "../core/fight.entity";
import type { FightTeam } from "../core/fight.team";
import { FightType, StateName } from "../fight.types";

/** One authoritative directory for the map markers and the fight browser. */
@Injectable()
export class FightWorldService {
  constructor(private readonly registry: FightRegistryService, private readonly presence: PlayerPresenceService, private readonly frames: GatewayFrameService) {
    presence.setWorldFilter((session) => !registry.isInFight(session));
    registry.subscribe((fight, removed) => this.publish(fight, removed));
  }

  publish(fight: Fight, removed = false): void {
    const targets = this.presence.sessionsOnMap(fight.mapId);
    if (!removed) {
      const ids = new Set([...fight.teams.map((t) => String(t.leaderId)), ...fight.fighters().map((f) => String(f.id)), ...fight.spectators.map((s) => String(s.playerId))]);
      this.frames.broadcast(targets, create(DofusMessageSchema, { payload: { case: "gameMovement", value: create(GameMovementSchema, { entries: [...ids].map((spriteId) => create(SpriteMovementEntrySchema, { spriteId, operation: SpriteMovementEntry_Operation.REMOVE })) }) } }));
    }
    this.markers(targets, fight, removed);
    this.sendList(targets, fight.mapId);
  }

  sendMap(sessionId: string, mapId: number): void {
    for (const fight of this.registry.onMap(mapId)) this.markers([sessionId], fight);
    this.sendList([sessionId], mapId);
  }

  sendList(targets: string[], mapId: number): void {
    const fights = this.registry.onMap(mapId);
    this.frames.broadcast(targets, create(DofusMessageSchema, { payload: { case: "fightsCount", value: create(FightsCountSchema, { count: fights.length }) } }));
    this.frames.broadcast(targets, create(DofusMessageSchema, { payload: { case: "fightsList", value: create(FightsListSchema, { fights: fights.map((fight) => create(FightListEntrySchema, {
      fightId: fight.id, timestamp: BigInt(fight.combatStartedAt || -1), phase: fight.state.name === StateName.Placement ? 2 : 3,
      spectatorsAllowed: fight.state.name === StateName.Active && !fight.lockedSpectators,
      team1: teamSummary(fight.teams[0]), team2: teamSummary(fight.teams[1]),
    })) }) } }));
  }

  sendDetails(sessionId: string, fight: Fight): void {
    const members = (team: FightTeam) => team.fighters().filter((f) => !f.isInvocation()).map((f) => create(FightDetailMemberSchema, { characterData: f.name, uniqueId: String(f.id), level: f.level }));
    this.frames.broadcast([sessionId], create(DofusMessageSchema, { payload: { case: "fightsDetails", value: create(FightsDetailsSchema, { fightId: fight.id, team1Members: members(fight.teams[0]), team2Members: members(fight.teams[1]) }) } }));
  }

  private markers(targets: string[], fight: Fight, removed = false): void {
    const placement = !removed && !fight.ending && fight.state.name === StateName.Placement;
    this.frames.broadcast(targets, create(DofusMessageSchema, { payload: { case: "gameChallenge", value: create(GameChallengeSchema, {
      operation: placement ? GameChallenge_Operation.ADD : GameChallenge_Operation.REMOVE,
      fightId: fight.id, fightType: fight.type,
      teams: placement ? fight.teams.map((team) => create(FightMapTeamSchema, {
        teamId: team.leaderId, side: team.side, isMonster: fight.type === FightType.PvM && team.side === 1,
        cellId: team.markerCell, locked: team.locked || team.partyOnly, needHelp: team.needHelp,
        capacity: Math.min(8, fight.fightMap.teamCells[team.side].length),
      })) : [],
    }) } }));
    if (!placement) return;
    for (const team of fight.teams) {
      this.frames.broadcast(targets, create(DofusMessageSchema, { payload: { case: "gameTeam", value: create(GameTeamSchema, {
        fightId: fight.id, teamId: team.leaderId,
        members: team.fighters().map((f) => create(TeamMemberSchema, { operation: TeamMember_Operation.ADD, spriteId: f.id, name: f.name, level: f.level })),
      }) } }));
    }
  }
}

function teamSummary(team: FightTeam) {
  const fighters = team.fighters().filter((f) => !f.isInvocation());
  const totalLevel = fighters.reduce((sum, f) => sum + f.level, 0);
  return create(FightTeamSummarySchema, { playerCount: fighters.length, totalLevel, avgLevel: fighters.length ? Math.floor(totalLevel / fighters.length) : 0 });
}

export function placeFightMarkers(fight: Fight, cell0: number, cell1: number): void {
  fight.teams[1].markerCell = cell1;
  if (cell0 === cell1) {
    const cells = Array.from({ length: totalCells(fight.fightMap.width, fight.fightMap.height) }, (_, id) => id)
      .filter((cell) => cell !== cell1 && fight.fightMap.isWalkable(cell));
    cells.sort((a, b) => fightDistance(fight.fightMap, a, cell1) - fightDistance(fight.fightMap, b, cell1) || a - b);
    cell0 = cells[0] ?? cell0;
  }
  fight.teams[0].markerCell = cell0;
}
