import type {
  FightState,
  Spectator,
} from "@modules/fight/core/fight.entity.types";
import type { Fighter } from "@modules/fight/core/fight.fighter";
import { SpellUsageTracker } from "@modules/fight/cast/fight.spell-usage";
import { FightOptionCode } from "@modules/fight/core/fight.entity.types";
import { NullState } from "@modules/fight/core/fight.states";
import { FightTeam, type TeamOptions } from "@modules/fight/core/fight.team";
import { ModuleList } from "@modules/fight/engine/fight.module-hooks";
import { type FightType } from "@modules/fight/fight.types";
import { FightMap } from "@modules/fight/map/fight.map";

export type {
  FightState,
  Spectator,
} from "@modules/fight/core/fight.entity.types";

let fightIdCounter = 0;

interface TetherLink {
  partnerId: number;
  share: number;
}

export class Fight {
  readonly id: number;
  readonly type: FightType;
  readonly mapId: number;
  readonly fightMap: FightMap;
  readonly teams: [FightTeam, FightTeam];
  spectators: Spectator[] = [];
  modules: ModuleList;
  readonly startedAt: number;
  combatStartedAt = 0;
  placementEndsAt = 0;
  readonly spellUsage = new SpellUsageTracker();
  ending = false;
  turnEpoch = 0;
  turnOpen = false;
  actionSequence = 0;
  activeActionId: number | null = null;
  deathSequence = 0;
  private nextSummonId = -10000;

  allocateSummonId(): number {
    while (this.fighters().some((f) => f.id === this.nextSummonId)) {
      this.nextSummonId--;
    }
    return this.nextSummonId--;
  }
  private actionTail: Promise<void> = Promise.resolve();
  placementTimer: ReturnType<typeof setTimeout> | null = null;

  /** All network actions, AI actions and deadlines share this queue. */
  runAction<T>(action: () => T | Promise<T>): Promise<T> {
    const result = this.actionTail.then(action);
    this.actionTail = result.then(
      () => {},
      () => {}
    );
    return result;
  }

  cancelPlacementTimer(): void {
    if (this.placementTimer !== null) {
      clearTimeout(this.placementTimer);
    }
    this.placementTimer = null;
  }

  // Fight options, toggled by a team leader during placement and
  // mirrored to every client as `GameFightOption` (`Go` in 1.29). The
  // wire carries a single char per option; `enabled` always means "the
  // button is lit", i.e. help requested / fight locked / party only /
  // spectators blocked.
  get lockedTeam(): boolean { return this.teams[0].locked; }
  set lockedTeam(value: boolean) { this.teams[0].locked = value; }
  lockedSpectators = false;
  get partyOnly(): boolean { return this.teams[0].partyOnly; }
  set partyOnly(value: boolean) { this.teams[0].partyOnly = value; }
  get helpAllowed(): boolean { return this.teams[0].needHelp; }
  set helpAllowed(value: boolean) { this.teams[0].needHelp = value; }

  /** True when `fighterId` leads either team. */
  isLeader(fighterId: number): boolean {
    return this.teams.some((t) => t.leaderId === fighterId);
  }

  optionEnabled(code: FightOptionCode, side = 0): boolean {
    const team = this.teams[side === 1 ? 1 : 0];
    switch (code) {
      case FightOptionCode.NeedHelp:
        return team.needHelp;
      case FightOptionCode.BlockJoin:
        return team.locked;
      case FightOptionCode.PartyOnly:
        return team.partyOnly;
      case FightOptionCode.BlockSpectators:
        return this.lockedSpectators;
    }
  }

  /** Flip one option and return its new value. */
  toggleOption(code: FightOptionCode, side = 0): boolean {
    const next = !this.optionEnabled(code, side);
    const team = this.teams[side === 1 ? 1 : 0];
    switch (code) {
      case FightOptionCode.NeedHelp:
        team.needHelp = next;
        break;
      case FightOptionCode.BlockJoin:
        team.locked = next;
        break;
      case FightOptionCode.PartyOnly:
        team.partyOnly = next;
        break;
      case FightOptionCode.BlockSpectators:
        this.lockedSpectators = next;
        break;
    }
    return next;
  }

  private currentState: FightState;
  private spellBonus = new Map<number, Map<number, number>>();
  private tether = new Map<number, TetherLink>();

  constructor(
    type: FightType,
    mapId: number,
    fightMap: FightMap,
    teamOpts: [TeamOptions, TeamOptions],
    readonly random: () => number = Math.random
  ) {
    fightIdCounter++;
    this.id = fightIdCounter;
    this.type = type;
    this.mapId = mapId;
    this.fightMap = fightMap;
    this.teams = [
      new FightTeam(teamOpts[0].side, teamOpts[0].leaderId),
      new FightTeam(teamOpts[1].side, teamOpts[1].leaderId),
    ];
    this.modules = new ModuleList();
    this.startedAt = Date.now();
    this.currentState = new NullState();
  }

  get state(): FightState {
    return this.currentState;
  }

  transition(next: FightState): void {
    const current = this.currentState;
    this.currentState = next;
    current.leave(this);
    next.enter(this);
  }

  fighters(): Fighter[] {
    return [...this.teams[0].fighters(), ...this.teams[1].fighters()];
  }

  allSessions(): string[] {
    const sessions: string[] = [];
    for (const f of this.fighters()) {
      if (f.sessionId) {
        sessions.push(f.sessionId);
      }
    }
    for (const s of this.spectators) {
      sessions.push(s.sessionId);
    }
    return sessions;
  }

  allReady(): boolean {
    return this.fighters().every((f) => f.ready);
  }

  addSpellBonus(casterId: number, spellId: number, bonus: number): void {
    let byCaster = this.spellBonus.get(casterId);
    if (!byCaster) {
      byCaster = new Map();
      this.spellBonus.set(casterId, byCaster);
    }
    byCaster.set(spellId, (byCaster.get(spellId) ?? 0) + bonus);
  }

  getSpellBonus(casterId: number, spellId: number): number {
    return this.spellBonus.get(casterId)?.get(spellId) ?? 0;
  }

  clearSpellBonus(casterId: number, spellId: number): void {
    this.spellBonus.get(casterId)?.delete(spellId);
  }

  addTether(aId: number, bId: number, share: number): void {
    if (aId === bId || share <= 0) {
      return;
    }
    const clamped = Math.min(share, 100);
    this.tether.set(aId, { partnerId: bId, share: clamped });
    this.tether.set(bId, { partnerId: aId, share: clamped });
  }

  getTether(
    fighterId: number
  ): { partnerId: number; share: number } | undefined {
    return this.tether.get(fighterId);
  }

  removeTether(fighterId: number): void {
    const link = this.tether.get(fighterId);
    if (link) {
      this.tether.delete(link.partnerId);
      this.tether.delete(fighterId);
    }
  }

  checkFightEnd(): { ended: boolean; winner: number } {
    const alive0 = this.teams[0].fighters().filter((f) => !f.dead).length;
    const alive1 = this.teams[1].fighters().filter((f) => !f.dead).length;
    if (alive0 === 0) {
      return { ended: true, winner: 1 };
    }
    if (alive1 === 0) {
      return { ended: true, winner: 0 };
    }
    return { ended: false, winner: 0 };
  }
}

export {
  InitialiseState,
  NullState,
  PlacementState,
} from "@modules/fight/core/fight.states";
