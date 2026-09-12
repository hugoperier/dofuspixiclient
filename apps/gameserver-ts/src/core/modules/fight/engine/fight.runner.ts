import type { ActiveState } from "@modules/fight/core/fight.active-state";
import type { Fight } from "@modules/fight/core/fight.entity";
import type { Fighter } from "@modules/fight/core/fight.fighter";
import type {
  FrameSink,
  TurnFinishPayload,
  TurnListFrame,
  TurnMiddlePayload,
  TurnObserver,
  TurnStartPayload,
  ZoneRemovePayload,
} from "@modules/fight/engine/fight.runner.types";
import { Turn } from "@modules/fight/core/fight.turn";
import { FighterKind, FightObjectKind } from "@modules/fight/fight.types";

import type { Emitter } from "../effects/fight.effect-registry.types";

export type {
  FrameSink,
  TurnFinishPayload,
  TurnListFrame,
  TurnMiddleEntry,
  TurnMiddlePayload,
  TurnObserver,
  TurnStartPayload,
} from "@modules/fight/engine/fight.runner.types";

export class Runner {
  private fight: Fight;
  private active: ActiveState;
  private sink: FrameSink;
  private turnDurationMs: number;
  private observer: TurnObserver | null = null;
  private turn: Turn | null = null;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private presentationWait: {
    epoch: number;
    participants: Set<number>;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private readonly disconnected = new Set<string>();

  constructor(
    fight: Fight,
    active: ActiveState,
    sink: FrameSink,
    turnDurationMs = 30_000,
    private readonly emitter?: Emitter
  ) {
    this.fight = fight;
    this.active = active;
    this.sink = sink;
    this.turnDurationMs = turnDurationMs;
  }

  setObserver(o: TurnObserver): void {
    this.observer = o;
  }

  start(): void {
    this.sink.broadcast(this.fight, "GTL", this.encodeTurnList());
    this.advanceTurn();
  }

  stop(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    this.fight.turnOpen = false;
    if (this.presentationWait) {
      clearTimeout(this.presentationWait.timer);
    }
    this.presentationWait = null;
    this.fight.turnEpoch++;
    if (this.turnTimer !== null) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  notifyReady(fighterId: number, epoch?: number): void {
    const wait = this.presentationWait;
    if (!wait || wait.epoch !== epoch || !wait.participants.delete(fighterId)) {
      return;
    }
    if (!wait.participants.size) {
      this.releasePresentation(wait.epoch);
    }
  }

  notifyDisconnected(sessionId: string): void {
    this.disconnected.add(sessionId);
    const wait = this.presentationWait;
    if (!wait) {
      return;
    }
    for (const fighter of this.fight.fighters()) {
      if (fighter.sessionId === sessionId) {
        wait.participants.delete(fighter.id);
      }
    }
    if (!wait.participants.size) {
      this.releasePresentation(wait.epoch);
    }
  }

  private releasePresentation(epoch: number): void {
    if (this.presentationWait?.epoch !== epoch) {
      return;
    }
    clearTimeout(this.presentationWait.timer);
    this.presentationWait = null;
    // Acknowledgements never acquire the action queue while waiting on it.
    void this.fight.runAction(() => {
      if (!this.stopped && this.fight.turnEpoch === epoch) {
        this.advanceTurn();
      }
    });
  }

  requestEnd(fighterId: number): void {
    if (this.stopped) {
      return;
    }
    if (!this.turn || this.turn.ended || this.turn.fighter.id !== fighterId) {
      return;
    }
    this.endTurn(this.turn);
  }

  notifyDeath(fighterId: number): void {
    this.active.turnList.remove(fighterId);
    if (this.turn && this.turn.fighter.id === fighterId) {
      this.requestEnd(fighterId);
    }
  }

  private advanceTurn(): void {
    if (this.stopped || this.fight.ending) {
      return;
    }
    const endCheck = this.fight.checkFightEnd();
    if (endCheck.ended) {
      this.sink.broadcast(this.fight, "GE", null);
      this.stop();
      return;
    }
    const { next: fighter } = this.active.turnList.advance();
    if (!fighter) {
      this.sink.broadcast(this.fight, "GE", null);
      return;
    }

    // Ground objects expire at their caster's turn, before triggering.
    this.expireObjects(fighter.id);

    this.fight.turnEpoch++;
    fighter.turnCount++;
    fighter.apUsedThisTurn = 0;
    fighter.punishmentGains.clear();
    const turn = new Turn(
      fighter,
      this.active.turnList.round + 1,
      this.turnDurationMs
    );
    this.turn = turn;

    if (this.turnTimer !== null) {
      clearTimeout(this.turnTimer);
    }
    this.turnTimer = setTimeout(() => {
      if (this.stopped) {
        return;
      }
      void this.fight.runAction(() => {
        if (this.turn === turn && !turn.ended) {
          this.requestEnd(fighter.id);
        }
      });
    }, this.turnDurationMs);

    const expiredBuffs = fighter.buffs.tickDown();
    for (const b of expiredBuffs) {
      b.onRemove?.(this.fight, fighter);
    }
    if (expiredBuffs.length) {
      this.emitter?.emitDispel?.(this.fight, fighter.id);
    }
    for (const buff of fighter.buffs.all()) {
      this.emitter?.emitBuff(this.fight, buff.casterId, fighter.id, buff);
    }
    fighter.states.tickDown();
    this.refreshFighter(fighter);
    this.fight.modules.fireTurnStart(this.fight, fighter);
    fighter.buffs.each((buff) => {
      if (!fighter.dead) {
        buff.onTurnStart?.(this.fight, fighter);
      }
    });
    this.fight.fightMap.fireTurnStartTriggers(this.fight, fighter);

    // After expired buffs + states tickdown, check for fight end
    const postBuffEnd = this.fight.checkFightEnd();
    if (postBuffEnd.ended) {
      this.sink.broadcast(this.fight, "GE", null);
      this.stop();
      return;
    }
    if (fighter.dead) {
      this.endTurn(turn);
      return;
    }

    this.fight.turnOpen = true;
    this.sink.broadcast(this.fight, "GTS", {
      spriteId: String(fighter.id),
      timeMs: this.turnDurationMs,
      tableTurnNum: this.active.turnList.round + 1,
    } satisfies TurnStartPayload);

    this.sink.broadcast(this.fight, "GTM", this.encodeTurnMiddle());

    if (fighter.skipTurns > 0) {
      fighter.skipTurns--;
      this.endTurn(turn);
      return;
    }

    if (this.observer && fighter.kind !== FighterKind.Player) {
      try {
        this.observer.onTurnStart(this.fight, fighter);
      } catch {
        this.requestEnd(fighter.id);
      }
    }
  }

  private endTurn(turn: Turn): void {
    if (turn.ended || this.stopped || this.fight.ending) {
      return;
    }
    turn.end();
    this.fight.turnOpen = false;
    if (this.turnTimer !== null) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }

    turn.fighter.buffs.each((buff) => {
      if (!turn.fighter.dead) {
        buff.onTurnEnd?.(this.fight, turn.fighter);
      }
    });
    this.fight.modules.fireTurnEnd(this.fight, turn.fighter);

    this.sink.broadcast(this.fight, "GTF", {
      spriteId: String(turn.fighter.id),
    } satisfies TurnFinishPayload);

    const participants = new Set(
      this.fight
        .fighters()
        .filter(
          (fighter) =>
            fighter.sessionId &&
            !fighter.hasLeftFight &&
            !this.disconnected.has(fighter.sessionId)
        )
        .map((fighter) => fighter.id)
    );
    if (!participants.size) {
      this.advanceTurn();
      return;
    }
    const epoch = ++this.fight.turnEpoch;
    this.presentationWait = {
      epoch,
      participants,
      timer: setTimeout(() => this.releasePresentation(epoch), 15_000),
    };
    this.sink.broadcast(this.fight, "GTR", {
      spriteId: String(turn.fighter.id),
      fightId: this.fight.id,
      turnEpoch: epoch,
    });
  }

  /**
   * Age deployed objects one round and tell the clients about the ones
   * that died.
   *
   * The expired list used to be discarded, so an expired glyph stayed
   * drawn on the battlefield for the rest of the fight — a zone the
   * player could see and reason about that no longer did anything.
   */
  private expireObjects(casterId: number): void {
    for (const expired of this.fight.fightMap.objects.tickDown(casterId)) {
      if (expired.kind === FightObjectKind.Trap) {
        this.emitter?.emitTrapRemove(this.fight, expired.cell);
        continue;
      }
      this.sink.broadcast(this.fight, "GDZ", {
        cellId: expired.cell,
      } satisfies ZoneRemovePayload);
    }
  }

  private refreshFighter(f: Fighter): void {
    f.refreshResources();
    this.fight.spellUsage.resetTurn(f.id);
  }

  private encodeTurnList(): TurnListFrame {
    return {
      spriteIds: this.active.turnList.fighters().map((f) => String(f.id)),
    };
  }

  private encodeTurnMiddle(): TurnMiddlePayload {
    return {
      entries: this.fight.fighters().map((f) => ({
        spriteId: String(f.id),
        cell: f.cell,
        // Clamp lp at 0 — Fighter.setLp doesn't clamp negative values
        // (it just sets dead=true), so a freshly-killed fighter would
        // serialize as lp=-50 here. Client treats -50 as the new HP
        // and the bar collapses below empty.
        lp: Math.max(0, f.lp),
        lpMax: f.lpMax,
        ap: f.ap,
        mp: f.mp,
        isDead: f.dead,
      })),
    };
  }
}
