import type { Fight } from "@modules/fight/core/fight.entity";
import type { Runner } from "@modules/fight/engine/fight.runner";
import { Injectable } from "@nestjs/common";

@Injectable()
export class FightRegistryService {
  private byId = new Map<number, Fight>();
  private bySession = new Map<string, number>();
  private runners = new Map<number, Runner>();
  private byMap = new Map<number, Set<number>>();
  private admissions = new Set<string>();
  private listeners = new Set<(fight: Fight, removed: boolean) => void>();

  reserveSessions(sessions: string[]): boolean {
    if (sessions.some((id) => this.isInFight(id) || this.admissions.has(id))) return false;
    for (const id of sessions) this.admissions.add(id);
    return true;
  }

  releaseSessions(sessions: string[]): void {
    for (const id of sessions) this.admissions.delete(id);
  }

  isEntering(sessionId: string): boolean { return this.admissions.has(sessionId); }

  onMap(mapId: number): Fight[] {
    return [...(this.byMap.get(mapId) ?? [])].flatMap((id) => {
      const fight = this.byId.get(id);
      return fight && !fight.ending ? [fight] : [];
    });
  }

  subscribe(listener: (fight: Fight, removed: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  changed(fight: Fight, removed = false): void {
    for (const listener of this.listeners) listener(fight, removed);
  }

  add(fight: Fight): void {
    this.byId.set(fight.id, fight);
    const bucket = this.byMap.get(fight.mapId) ?? new Set<number>();
    bucket.add(fight.id);
    this.byMap.set(fight.mapId, bucket);
    for (const fighter of fight.fighters()) {
      if (fighter.sessionId) {
        this.bySession.set(fighter.sessionId, fight.id);
      }
    }
  }

  registerSession(sessionId: string, fightId: number): void {
    this.bySession.set(sessionId, fightId);
  }

  unregisterSession(sessionId: string): void {
    this.bySession.delete(sessionId);
  }

  getBySession(sessionId: string): Fight | undefined {
    const fightId = this.bySession.get(sessionId);
    if (fightId === undefined) {
      return undefined;
    }
    return this.byId.get(fightId);
  }

  getById(fightId: number): Fight | undefined {
    return this.byId.get(fightId);
  }

  isInFight(sessionId: string): boolean {
    return this.bySession.has(sessionId);
  }

  addRunner(fightId: number, runner: Runner): void {
    this.runners.set(fightId, runner);
  }

  getRunner(fightId: number): Runner | undefined {
    return this.runners.get(fightId);
  }

  remove(fightId: number): void {
    const fight = this.byId.get(fightId);
    if (fight) {
      fight.cancelPlacementTimer();
      for (const spectator of fight.spectators) this.bySession.delete(spectator.sessionId);
      fight.spectators = [];
      for (const fighter of fight.fighters()) {
        if (fighter.sessionId) {
          this.bySession.delete(fighter.sessionId);
        }
      }
    }
    const runner = this.runners.get(fightId);
    if (runner) {
      runner.stop();
      this.runners.delete(fightId);
    }
    this.byId.delete(fightId);
    if (fight) {
      const bucket = this.byMap.get(fight.mapId);
      bucket?.delete(fight.id);
      if (!bucket?.size) this.byMap.delete(fight.mapId);
      this.changed(fight, true);
    }
  }
}
