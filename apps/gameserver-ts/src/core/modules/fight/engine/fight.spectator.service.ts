import { create } from "@bufbuild/protobuf";
import { GameLeaveSchema, GameMovementSchema, GameTurnMiddleSchema, GameTurnListSchema, GameTurnStartSchema, GameStartToPlaySchema, GameZoneDataSchema, GameZoneData_Operation, SpriteMovementEntrySchema, SpriteMovementEntry_Operation } from "@dofus/proto/game_pb";
import { DofusMessageSchema } from "@dofus/proto/server_messages_pb";
import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { emitJoinFrames } from "@features/game/fight-start/fight-start.shared";
import { MapMonsterService } from "@modules/monsters/map-monster.service";
import { PlayerPresenceService } from "@modules/player-presence/player-presence.service";
import { GatewayFrameService } from "@shared/gateway-adapter/gateway-frame.service";
import type { Fight } from "../core/fight.entity";
import type { Fighter } from "../core/fight.fighter";
import { ActiveState } from "../core/fight.active-state";
import { FightObjectKind } from "../fight.types";
import { FightRegistryService } from "../registry/fight.registry";
import { FightFrameEmitter } from "./fight.frame-emitter";
import { fightTurnEntries } from "./fight.snapshot";

@Injectable()
export class FightSpectatorService {
  constructor(private readonly registry: FightRegistryService, private readonly frames: GatewayFrameService, private readonly presence: PlayerPresenceService, private readonly emitter: FightFrameEmitter, private readonly mapMonsters: MapMonsterService) {}

  /** Caller holds fight.runAction: no action may split this initial state. */
  sendInitial(fight: Fight, sessionId: string, fighter?: Fighter): void {
    this.hideWorld(fight, sessionId);
    emitJoinFrames(this.frames, sessionId, fight, fighter, [], this.presence.onMap(fight.mapId));
    this.frames.broadcast([sessionId], create(DofusMessageSchema, { payload: { case: "gameTurnMiddle", value: create(GameTurnMiddleSchema, { entries: fightTurnEntries(fight, fighter) }) } }));
    if (fighter) return;
    this.frames.broadcast([sessionId], create(DofusMessageSchema, { payload: { case: "gameStartToPlay", value: create(GameStartToPlaySchema) } }));
    if (fight.state instanceof ActiveState) {
      this.frames.broadcast([sessionId], create(DofusMessageSchema, { payload: { case: "gameTurnList", value: create(GameTurnListSchema, { spriteIds: fight.state.turnList.fighters().map((f) => String(f.id)) }) } }));
    }
    const turn = this.registry.getRunner(fight.id)?.currentTurn();
    if (turn && !turn.ended) this.frames.broadcast([sessionId], create(DofusMessageSchema, { payload: { case: "gameTurnStart", value: create(GameTurnStartSchema, turn) } }));
    for (const f of fight.fighters()) for (const buff of f.buffs.all()) this.emitter.emitBuff(fight, buff.casterId, f.id, buff, [sessionId]);
    for (const object of fight.fightMap.objects.snapshot()) {
      if (object.kind !== FightObjectKind.Glyph) continue;
      this.frames.broadcast([sessionId], create(DofusMessageSchema, { payload: { case: "gameZoneData", value: create(GameZoneDataSchema, { operation: GameZoneData_Operation.ADD, cellId: object.cell, size: object.size, color: object.color, areaKind: object.areaKind ?? 0 }) } }));
    }
  }

  /**
   * Clears the exploration sprites the viewer still has on screen: every
   * monster group (the engaged one included — it is the monster team's
   * leader) and every other player on the map. 1.29 wipes the map on GJK
   * (`Game.onJoin` → `gfx.cleanMap(1)`); our client reuses the world-actor
   * layer for fighters instead, so a leftover sprite stays put and gets a
   * team-0 ring — the "allied" mob standing where the group was. Fighters
   * among them come straight back with the join frames. The viewer's own
   * sprite is kept: as a fighter it is the same actor. The world filter
   * keeps every later map broadcast away from this session until it leaves.
   */
  private hideWorld(fight: Fight, sessionId: string): void {
    const players = this.presence.onMap(fight.mapId);
    const self = players.find((p) => p.sessionId === sessionId);
    const ids = new Set([
      ...this.mapMonsters.groupsOnMap(fight.mapId).map((g) => String(g.id)),
      ...fight.teams.map((team) => String(team.leaderId)),
      ...players.map((p) => String(Number(p.characterId))),
    ]);
    if (self) {
      ids.delete(String(Number(self.characterId)));
    }
    if (ids.size === 0) {
      return;
    }
    const entries = [...ids].map((spriteId) =>
      create(SpriteMovementEntrySchema, {
        spriteId,
        operation: SpriteMovementEntry_Operation.REMOVE,
      })
    );
    this.frames.broadcast(
      [sessionId],
      create(DofusMessageSchema, {
        payload: {
          case: "gameMovement",
          value: create(GameMovementSchema, { entries }),
        },
      })
    );
  }

  leave(fight: Fight, sessionId: string, notify = true): void {
    if (!fight.spectators.some((s) => s.sessionId === sessionId)) return;
    fight.spectators = fight.spectators.filter((s) => s.sessionId !== sessionId);
    this.registry.unregisterSession(sessionId);
    // GV makes the client reload exploration through the normal enter-game path.
    if (notify) this.frames.broadcast([sessionId], create(DofusMessageSchema, { payload: { case: "gameLeave", value: create(GameLeaveSchema) } }));
  }

  expel(fight: Fight): void {
    for (const spectator of [...fight.spectators]) this.leave(fight, spectator.sessionId);
  }

  @OnEvent("session.closed")
  async onSessionClosed({ session }: { session: { sessionId: string } }): Promise<void> {
    const fight = this.registry.getBySession(session.sessionId);
    if (fight) await fight.runAction(() => this.leave(fight, session.sessionId, false));
  }
}
