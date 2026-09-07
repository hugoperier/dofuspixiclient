import type { Fighter } from "@modules/fight/core/fight.fighter";
import { Characteristic } from "@modules/fight/fight.types";

export function initiativeOf(f: Fighter): number {
  const total = [
    Characteristic.Strength,
    Characteristic.Intelligence,
    Characteristic.Chance,
    Characteristic.Agility,
    Characteristic.Initiative,
  ].reduce((sum, stat) => sum + f.stats.get(stat), 0);
  return Math.max(0, Math.floor((total * f.lp) / Math.max(1, f.lpMax)));
}

export class TurnList {
  private entries: Fighter[];
  private currentIdx = -1;
  private roundNum = 0;

  constructor(fighters: Fighter[]) {
    this.entries = [...fighters].sort((a, b) => {
      const ia = initiativeOf(a);
      const ib = initiativeOf(b);
      if (ia !== ib) {
        return ib - ia;
      }
      return a.id - b.id;
    });
    if (fighters.every((fighter) => fighter.team !== null)) {
      const teams: [Fighter[], Fighter[]] = [
        this.entries.filter((fighter) => fighter.team?.side === 0),
        this.entries.filter((fighter) => fighter.team?.side === 1),
      ];
      const average = (team: Fighter[]) =>
        team.reduce((sum, fighter) => sum + initiativeOf(fighter), 0) /
        Math.max(1, team.length);
      const first = average(teams[0]) >= average(teams[1]) ? 0 : 1;
      this.entries = [];
      for (
        let index = 0;
        index < Math.max(teams[0]?.length, teams[1]?.length);
        index++
      ) {
        for (const side of [first, 1 - first]) {
          const fighter = teams[side]?.[index];
          if (fighter) {
            this.entries.push(fighter);
          }
        }
      }
    }
  }

  get round(): number {
    return this.roundNum;
  }

  fighters(): Fighter[] {
    return [...this.entries];
  }

  current(): Fighter | null {
    if (this.currentIdx < 0 || this.currentIdx >= this.entries.length) {
      return null;
    }
    return this.entries[this.currentIdx] ?? null;
  }

  advance(): { next: Fighter | null; rounded: boolean } {
    if (this.entries.length === 0) {
      return { next: null, rounded: false };
    }
    const start = this.currentIdx;
    let rounded = false;
    for (let attempt = 0; attempt <= this.entries.length; attempt++) {
      this.currentIdx = (this.currentIdx + 1) % this.entries.length;
      if (this.currentIdx === 0 && start >= 0) {
        this.roundNum++;
        rounded = true;
      }
      const f = this.entries[this.currentIdx];
      if (!f) {
        return { next: null, rounded };
      }
      if (!f.dead) {
        return { next: f, rounded };
      }
      if (this.currentIdx === start) {
        return { next: null, rounded };
      }
    }
    return { next: null, rounded: false };
  }

  remove(fighterId: number): void {
    const idx = this.entries.findIndex((f) => f.id === fighterId);
    if (idx === -1) {
      return;
    }
    this.entries.splice(idx, 1);
    if (idx <= this.currentIdx) {
      this.currentIdx--;
    }
  }
}

export class Turn {
  readonly fighter: Fighter;
  readonly number: number;
  readonly startedAt: number;
  readonly durationMs: number;
  ended = false;

  constructor(fighter: Fighter, number: number, durationMs: number) {
    this.fighter = fighter;
    this.number = number;
    this.startedAt = Date.now();
    this.durationMs = durationMs;
  }

  end(): void {
    this.ended = true;
  }
}
