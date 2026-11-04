import { placeFightMarkers } from "@modules/fight/engine/fight.world.service";
import { FightSpectatorService } from "@modules/fight/engine/fight.spectator.service";
import type { MonsterSpell } from "@modules/fight/cast/fight.spell.types";
import type { PlayerPresenceEntry } from "@modules/player-presence/player-presence.service";
import { create } from "@bufbuild/protobuf";
import {
  GameMovementSchema,
  type SpriteMovementEntry,
  SpriteMovementEntrySchema,
} from "@dofus/proto/game_pb";
import { DofusMessageSchema } from "@dofus/proto/server_messages_pb";
import { FightChallengeService } from "@modules/fight/challenges/fight.challenge.service";
import { Fight } from "@modules/fight/core/fight.entity";
import { Fighter } from "@modules/fight/core/fight.fighter";
import {
  InitialiseState,
  PlacementState,
} from "@modules/fight/core/fight.states";
import { FightLifecycleService } from "@modules/fight/engine/fight.lifecycle.service";
import {
  Characteristic,
  FighterKind,
  FightType,
  TeamSide,
} from "@modules/fight/fight.types";
import { FightRegistryService } from "@modules/fight/registry/fight.registry";
import { LifeRegenService } from "@modules/life-regen/life-regen.service";
import { MapMonsterService } from "@modules/monsters/map-monster.service";
import { PlayerPresenceService } from "@modules/player-presence/player-presence.service";
import { PlayersRepository } from "@modules/players/players.repository";
import { SpellsRepository } from "@modules/spells/spells.repository";
import { maxLifePoints } from "@modules/stats/stats.constants";
import { StatsService } from "@modules/stats/stats.service";
import { Injectable, Logger } from "@nestjs/common";
import { GatewayFrameService } from "@shared/gateway-adapter/gateway-frame.service";

import {
  applyEquipmentStats,
  createFightMap,
  emitJoinFrames,
  removeSpritesFromMap,
} from "./fight-start.shared";

export interface MonsterGroupInfo {
  groupId: number;
  mapId: number;
  cellId: number;
  members: Array<{
    initiative?: number;
    stats?: unknown;
    resistances?: unknown;
    templateId: number;
    name: string;
    gfx: number;
    level: number;
    life: number;
    ap: number;
    mp: number;
    color1: number;
    color2: number;
    color3: number;
    spells?: Array<{ id?: number; spellId?: number; level?: number }>;
    // Rewards, forwarded verbatim from `LiveMonsterMember`. Optional so
    // the fight-start test fixtures, which build groups by hand, do not
    // all have to be rewritten; missing means "pays nothing".
    xp?: number;
    kamasMin?: number;
    kamasMax?: number;
  }>;
}

@Injectable()
export class FightStartService {
  private readonly logger = new Logger(FightStartService.name);

  // Monotonically-decrementing counter for monster fighter IDs. Starts far
  // below the small negative range used by `MapMonsterService.nextGroupId`
  // (which begins at -1) so a monster fighter id can never collide with a
  // live monster group's world-actor id. Sequential allocation also
  // eliminates the birthday-paradox collisions the previous
  // `groupId * 1000 + Math.random() * 1000` scheme produced (~3% per fight
  // for 8-mob groups), which surfaced as two fighters sharing one spriteId
  // and the client's `Map<spriteId, fighter>` collapsing to a single slot.
  private readonly pendingGroups = new Set<number>();

  private nextMonsterFighterId = -1_000_000;

  constructor(
    private readonly registry: FightRegistryService,
    private readonly frames: GatewayFrameService,
    private readonly players: PlayersRepository,
    private readonly spells: SpellsRepository,
    private readonly challenges: FightChallengeService,
    private readonly presence: PlayerPresenceService,
    private readonly stats: StatsService,
    private readonly mapMonsters: MapMonsterService,
    private readonly lifeRegen: LifeRegenService,
    private readonly lifecycle: FightLifecycleService,
    private readonly spectators: FightSpectatorService
  ) {}

  async startPvM(
    sessionId: string,
    player: PlayerPresenceEntry,
    mapWidth: number,
    mapHeight: number,
    places0: string,
    places1: string,
    group: MonsterGroupInfo,
    walkableCells?: number[],
    sightBlockedCells: number[] = []
  ): Promise<Fight | null> {
    if (
      this.pendingGroups.has(group.groupId) ||
      !this.registry.reserveSessions([sessionId])
    ) {
      return null;
    }
    this.pendingGroups.add(group.groupId);
    try {
      if (this.registry.isInFight(sessionId)) {
        this.logger.warn(`Player already in fight sessionId=${sessionId}`);
        return null;
      }

      const fightMap = createFightMap(
        mapWidth,
        mapHeight,
        places0,
        places1,
        walkableCells,
        sightBlockedCells
      );
      if (
        !fightMap ||
        group.members.length === 0 ||
        fightMap.teamCells[1].length < group.members.length
      ) {
        this.logger.warn(`Invalid placement cells mapId=${group.mapId}`);
        return null;
      }

      const fight = new Fight(FightType.PvM, group.mapId, fightMap, [
        { side: TeamSide.Side0, leaderId: Number(player.characterId) },
        { side: TeamSide.Side1, leaderId: group.groupId },
      ]);

      const playerFighter = await this.loadPlayerFighter(sessionId, player);
      if (!playerFighter) {
        this.logger.warn(
          `Player data not found characterId=${player.characterId}`
        );
        return null;
      }

      fight.teams[0].add(playerFighter);
      this.addMonsters(fight, group);

      await this.challenges.assignChallenges(fight);
      if (this.presence.getByCharacter(player.characterId)?.sessionId !== sessionId) return null;
      placeFightMarkers(fight, player.cellId, group.cellId);
      fight.placementEndsAt = Date.now() + 45_000;
      this.registry.add(fight);
      fight.transition(new InitialiseState(() => this.onFightReady(fight)));
      fight.transition(new PlacementState());

      for (const fighter of fight.teams[1].fighters()) {
        fighter.ready = true;
      }

      this.spectators.sendInitial(fight, sessionId, playerFighter);
      this.registry.changed(fight);

      this.armPlacement(fight);
      return fight;
    } finally {
      this.pendingGroups.delete(group.groupId);
      this.registry.releaseSessions([sessionId]);
    }
  }

  private armPlacement(fight: Fight): void {
    fight.placementTimer = setTimeout(() => {
      void fight.runAction(() => this.lifecycle.startFight(fight));
    }, 45_000);
  }

  async startChallenge(
    sessionIdA: string,
    sessionIdB: string,
    playerA: PlayerPresenceEntry,
    playerB: PlayerPresenceEntry,
    mapWidth: number,
    mapHeight: number,
    places0: string,
    places1: string
  ): Promise<Fight | null> {
    if (!this.registry.reserveSessions([sessionIdA, sessionIdB])) return null;
    try {

    const fightMap = createFightMap(mapWidth, mapHeight, places0, places1);
    if (!fightMap) {
      this.logger.warn(
        `Invalid placement cells for challenge mapId=${playerA.mapId}`
      );
      return null;
    }

    const fight = new Fight(FightType.Challenge, playerA.mapId, fightMap, [
      { side: TeamSide.Side0, leaderId: Number(playerA.characterId) },
      { side: TeamSide.Side1, leaderId: Number(playerB.characterId) },
    ]);

    const fighterA = await this.loadPlayerFighter(sessionIdA, playerA);
    const fighterB = await this.loadPlayerFighter(sessionIdB, playerB);

    if (!fighterA || !fighterB ||
      this.presence.getByCharacter(playerA.characterId)?.sessionId !== sessionIdA ||
      this.presence.getByCharacter(playerB.characterId)?.sessionId !== sessionIdB) {
      this.logger.warn(`Challenge: player data not found`);
      return null;
    }

    fight.teams[0].add(fighterA);
    fight.teams[1].add(fighterB);

    this.registry.add(fight);
    fight.transition(new InitialiseState());
    fight.transition(new PlacementState());

    placeFightMarkers(fight, playerA.cellId, playerB.cellId);
    this.spectators.sendInitial(fight, sessionIdA, fighterA);
    this.spectators.sendInitial(fight, sessionIdB, fighterB);
    this.registry.changed(fight);
    return fight;
    } finally { this.registry.releaseSessions([sessionIdA, sessionIdB]); }
  }

  async loadPlayerFighter(
    sessionId: string,
    player: PlayerPresenceEntry
  ): Promise<Fighter | null> {
    const playerData = await this.players.findById(player.characterId);
    if (!playerData) {
      return null;
    }

    const equipStats = await this.stats.computeEquipmentStats(
      player.characterId
    );
    const playerStats = await this.players.findStats(player.characterId);
    await this.players.loadPresence(player.characterId);

    // Derive the cap rather than reading `playerData.life`: that column
    // stores CURRENT life, so a player walking into the fight at
    // 200/1050 would spawn as 200/200 and cap at the wrong ceiling for
    // the rest of the fight.
    const totalVit = (playerStats?.vitality ?? 0) + (equipStats.vitality ?? 0);
    const lifeMax = maxLifePoints(playerData.level, totalVit);

    // Settle out-of-combat regeneration before the fight freezes the
    // value. `playerData.life` is exact only as of `life_updated_at`;
    // entering a fight on the raw column would silently discard every
    // point regained since the last time the stats frame was sent.
    const life = await this.lifeRegen.resolve(playerData, lifeMax);

    const fighter = Fighter.fromPlayer(sessionId, {
      id: Number(player.characterId),
      name: player.name,
      level: playerData.level,
      life,
      lifeMax,
      direction: player.direction,
      sex: playerData.sex,
      gfx: playerData.gfx,
      color1: player.color1,
      color2: player.color2,
      color3: player.color3,
      stats: {
        strength: playerStats?.strength ?? 0,
        vitality: playerStats?.vitality ?? 0,
        wisdom: playerStats?.wisdom ?? 0,
        intelligence: playerStats?.intelligence ?? 0,
        chance: playerStats?.chance ?? 0,
        agility: playerStats?.agility ?? 0,
      },
    });

    applyEquipmentStats(fighter, equipStats);
    fighter.refreshResources();
    return fighter;
  }

  private addMonsters(fight: Fight, group: MonsterGroupInfo): void {
    for (const member of group.members) {
      const monsterId = this.nextMonsterFighterId--;
      const monsterFighter = new Fighter(
        monsterId,
        FighterKind.Monster,
        member.name,
        member.life,
        member.ap,
        member.mp,
        0
      );

      const read = (source: unknown, key: string): number => {
        if (!source || typeof source !== "object" || !(key in source)) {
          return 0;
        }
        const value = Reflect.get(source, key);
        return typeof value === "number" && Number.isFinite(value) ? value : 0;
      };
      const stats: [string, Characteristic][] = [
        ["strength", Characteristic.Strength],
        ["wisdom", Characteristic.Wisdom],
        ["intelligence", Characteristic.Intelligence],
        ["chance", Characteristic.Chance],
        ["agility", Characteristic.Agility],
        ["damageBonus", Characteristic.DamageBonus],
        ["damagePercent", Characteristic.DamagePercent],
        ["healBonus", Characteristic.HealBonus],
      ];
      for (const [key, stat] of stats) {
        monsterFighter.stats.setBase(stat, read(member.stats, key));
      }
      const resists: [string, Characteristic][] = [
        ["neutral", Characteristic.ResistNeutralPct],
        ["earth", Characteristic.ResistEarthPct],
        ["fire", Characteristic.ResistFirePct],
        ["water", Characteristic.ResistWaterPct],
        ["air", Characteristic.ResistAirPct],
      ];
      for (const [key, stat] of resists) {
        monsterFighter.stats.setBase(stat, read(member.resistances, key));
      }
      monsterFighter.stats.setBase(
        Characteristic.Initiative,
        (member.initiative ?? 0) -
          stats
            .slice(0, 5)
            .filter(([, stat]) => stat !== Characteristic.Wisdom)
            .reduce((sum, [key]) => sum + read(member.stats, key), 0)
      );
      monsterFighter.monsterTemplateId = member.templateId;
      monsterFighter.monsterGfx = member.gfx;
      monsterFighter.monsterLevel = member.level;
      monsterFighter.monsterColor1 = member.color1;
      monsterFighter.monsterColor2 = member.color2;
      monsterFighter.monsterColor3 = member.color3;
      monsterFighter.monsterXp = member.xp ?? 0;
      monsterFighter.monsterKamasMin = member.kamasMin ?? 0;
      monsterFighter.monsterKamasMax = member.kamasMax ?? 0;

      if (member.spells) {
        const loadedSpells: MonsterSpell[] = [];
        for (const spellRef of member.spells) {
          const spellId = spellRef.spellId ?? spellRef.id;
          const spellLevel = spellRef.level ?? 1;
          if (spellId) {
            loadedSpells.push({
              spellId,
              level: spellLevel,
            });
          }
        }
        monsterFighter.monsterSpells = loadedSpells;
      }

      fight.teams[1].add(monsterFighter);
    }
  }

  private onFightReady(fight: Fight): void {
    this.logger.debug(`Fight ${fight.id} ready, type=${fight.type}`);
  }
}
