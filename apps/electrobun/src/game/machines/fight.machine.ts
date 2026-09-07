import { assign, setup } from "xstate";

import type {
  GameCreate,
  GameEnd,
  GameJoin,
  GameReady,
  GameTurnFinish,
  GameTurnStart,
} from "@/game/network/protocol";

/**
 * Per-fighter snapshot projected from the various gameAction /
 * gameMovement / gameTurnMiddle frames. Held here (not in a separate
 * store) so the HUD has a single source of truth for the whole
 * roster — the turn timeline, damage overlays, fighter info panels,
 * and the reachable-cells preview all read from this map.
 */
export interface FighterSnapshot {
  spriteId: string;
  name: string;
  level: number;
  team: 0 | 1;
  cell: number;
  hp: number;
  maxHp: number;
  ap: number;
  maxAp: number;
  mp: number;
  maxMp: number;
  gfxId: number;
  dead: boolean;
  /**
   * RGB color zones from the SpriteMovementEntry (-1 = default for the
   * gfx). Carried through so the StringCourse turn-change banner can
   * tint the fighter's portrait per zone — same as canonical 1.29's
   * `stringCourseColor(mc, zone)` callback in
   * `dofus.graphics.gapi.ui.StringCourse`.
   */
  color1: number;
  color2: number;
  color3: number;
  summonedBy?: string;
  ready?: boolean;
  rangeBonus?: number;
  states?: number[];
}

export interface FightContext {
  result: GameEnd | null;
  deadline: number;
  /** Original duration from the server, used to scale both turn gauges. */
  turnDurationMs: number;
  actionPending: boolean;
  finishing: boolean;
  fightId: number | null;
  mySpriteId: string | null;
  ap: number;
  mp: number;
  maxAp: number;
  maxMp: number;
  turnIndex: number;
  timeline: string[];
  currentTurnSpriteId: string | null;
  isSpectator: boolean;
  winnerTeam: number | null;
  fighters: Map<string, FighterSnapshot>;
}

export type FightMachineEvent =
  | { type: "ACTION_PENDING"; pending: boolean }
  | { type: "FINISHING" }
  | {
      type: "FIGHT_INIT";
      payload: GameCreate | GameJoin;
      fightId?: number;
      mySpriteId?: string;
    }
  | {
      type: "FIGHT_SPECTATE_INIT";
      payload: GameJoin;
      fightId?: number;
    }
  | { type: "PLACEMENT_READY"; payload: GameReady }
  | { type: "FIGHT_START" }
  | { type: "TURN_START"; payload: GameTurnStart }
  | { type: "TURN_END"; payload: GameTurnFinish }
  | {
      type: "STATS_UPDATE";
      ap?: number;
      mp?: number;
      maxAp?: number;
      maxMp?: number;
    }
  | { type: "TIMELINE_UPDATE"; timeline: string[] }
  | {
      type: "FIGHTER_UPSERT";
      fighter: FighterSnapshot;
    }
  | {
      type: "FIGHTER_UPDATE";
      spriteId: string;
      patch: Partial<
        Pick<
          FighterSnapshot,
          | "hp"
          | "maxHp"
          | "ap"
          | "maxAp"
          | "mp"
          | "maxMp"
          | "cell"
          | "dead"
          | "ready"
          | "rangeBonus"
          | "states"
        >
      >;
    }
  | { type: "FIGHTER_REMOVE"; spriteId: string }
  | { type: "FIGHT_END"; payload: GameEnd }
  | { type: "LEAVE" };

const initialContext: FightContext = {
  result: null,
  deadline: 0,
  turnDurationMs: 0,
  actionPending: false,
  finishing: false,
  fightId: null,
  mySpriteId: null,
  ap: 0,
  mp: 0,
  maxAp: 0,
  maxMp: 0,
  turnIndex: 0,
  timeline: [],
  currentTurnSpriteId: null,
  isSpectator: false,
  winnerTeam: null,
  fighters: new Map(),
};

/**
 * Fight lifecycle over the new protobuf protocol:
 *
 *   none ──FIGHT_INIT──> placement ──FIGHT_START──> fighting ──FIGHT_END──> ended
 *    │                                                  │
 *    │ FIGHT_SPECTATE_INIT                              │
 *    ▼                                                  │
 *   spectating <────────────────────────────────────────┘
 *
 * Sprite ids are now strings (proto field). myTurn is determined by
 * string equality of current-turn sprite id vs our own.
 */
export const fightMachine = setup({
  types: {
    context: {} as FightContext,
    events: {} as FightMachineEvent,
  },
  guards: {
    isMyTurn: ({ context, event }) =>
      event.type === "TURN_START" &&
      context.mySpriteId !== null &&
      event.payload.spriteId === context.mySpriteId,
  },
  actions: {
    applyInit: assign(({ event }) => {
      if (event.type !== "FIGHT_INIT" && event.type !== "FIGHT_SPECTATE_INIT") {
        return {};
      }
      return {
        ...initialContext,
        fighters: new Map(),
        deadline:
          "timerMs" in event.payload ? Date.now() + event.payload.timerMs : 0,
        fightId: event.fightId ?? null,
        mySpriteId:
          event.type === "FIGHT_INIT" ? (event.mySpriteId ?? null) : null,
        isSpectator: event.type === "FIGHT_SPECTATE_INIT",
        winnerTeam: null,
      };
    }),
    applyTurnStart: assign(({ context, event }) => {
      if (event.type !== "TURN_START") {
        return {};
      }
      // Dofus 1.29 semantics: "Tour N" = round N (a full cycle of
      // every fighter acting). Server ships that value as
      // GameTurnStart.tableTurnNum; use it verbatim instead of
      // incrementing per-fighter or we'd display "Tour 8" after one
      // round of 8 fighters.
      const round = event.payload.tableTurnNum;
      const duration = Math.max(0, event.payload.timeMs);
      return {
        deadline: Date.now() + duration,
        turnDurationMs: duration,
        actionPending: false,
        turnIndex: round > 0 ? round - 1 : context.turnIndex,
        currentTurnSpriteId: event.payload.spriteId,
      };
    }),
    clearTurnClock: assign(() => ({
      deadline: 0,
      turnDurationMs: 0,
    })),
    applyStats: assign(({ context, event }) => {
      if (event.type !== "STATS_UPDATE") {
        return {};
      }
      return {
        ap: event.ap ?? context.ap,
        mp: event.mp ?? context.mp,
        maxAp: event.maxAp ?? context.maxAp,
        maxMp: event.maxMp ?? context.maxMp,
      };
    }),
    upsertFighter: assign(({ context, event }) => {
      if (event.type !== "FIGHTER_UPSERT") {
        return {};
      }
      const next = new Map(context.fighters);
      const existing = next.get(event.fighter.spriteId);
      // GM can omit resource maxima; retain the baseline until GTM supplies them.
      const merged: FighterSnapshot = existing
        ? {
            ...existing,
            ...event.fighter,
            maxAp: existing.maxAp > 0 ? existing.maxAp : event.fighter.maxAp,
            maxMp: existing.maxMp > 0 ? existing.maxMp : event.fighter.maxMp,
          }
        : event.fighter;
      next.set(merged.spriteId, merged);
      return {
        fighters: next,
        ...(merged.spriteId === context.mySpriteId
          ? {
              ap: merged.ap,
              mp: merged.mp,
              maxAp: merged.maxAp,
              maxMp: merged.maxMp,
            }
          : {}),
      };
    }),
    updateFighter: assign(({ context, event }) => {
      if (event.type !== "FIGHTER_UPDATE") {
        return {};
      }
      const existing = context.fighters.get(event.spriteId);
      if (!existing) {
        return {};
      }
      const next = new Map(context.fighters);
      const patched: FighterSnapshot = { ...existing, ...event.patch };
      // Same baseline-anchor logic for maxAp/maxMp — if the patch
      // only carries `ap` but the fighter's maxAp is still zero
      // (hasn't been seen in gameTurnMiddle yet), adopt it.
      if (patched.maxAp === 0 && patched.ap > 0) {
        patched.maxAp = patched.ap;
      }
      if (patched.maxMp === 0 && patched.mp > 0) {
        patched.maxMp = patched.mp;
      }
      next.set(event.spriteId, patched);
      return { fighters: next };
    }),
    removeFighter: assign(({ context, event }) => {
      if (event.type !== "FIGHTER_REMOVE") {
        return {};
      }
      if (!context.fighters.has(event.spriteId)) {
        return {};
      }
      const next = new Map(context.fighters);
      next.delete(event.spriteId);
      return { fighters: next };
    }),
    applyTimeline: assign(({ event }) =>
      event.type === "TIMELINE_UPDATE" ? { timeline: event.timeline } : {}
    ),
    applyEnd: assign(({ event }) =>
      event.type === "FIGHT_END"
        ? {
            winnerTeam: event.payload.winnerTeam,
            result: event.payload,
            finishing: false,
            deadline: 0,
            turnDurationMs: 0,
            actionPending: false,
          }
        : {}
    ),
    resetContext: assign(() => ({ ...initialContext })),
  },
}).createMachine({
  id: "fight",
  initial: "none",
  context: initialContext,
  on: {
    ACTION_PENDING: {
      actions: assign(({ event }) => ({ actionPending: event.pending })),
    },
    FINISHING: {
      actions: assign(() => ({
        finishing: true,
        actionPending: true,
        deadline: 0,
        turnDurationMs: 0,
      })),
    },
  },
  states: {
    none: {
      on: {
        FIGHT_INIT: { target: "placement", actions: "applyInit" },
        FIGHT_SPECTATE_INIT: { target: "spectating", actions: "applyInit" },
      },
    },
    placement: {
      on: {
        STATS_UPDATE: { actions: "applyStats" },
        FIGHT_START: { target: "fighting", actions: "clearTurnClock" },
        FIGHT_END: { target: "ended", actions: "applyEnd" },
        TIMELINE_UPDATE: { actions: "applyTimeline" },
        PLACEMENT_READY: {},
        FIGHTER_UPSERT: { actions: "upsertFighter" },
        FIGHTER_UPDATE: { actions: "updateFighter" },
        FIGHTER_REMOVE: { actions: "removeFighter" },
        LEAVE: { target: "none", actions: "resetContext" },
      },
    },
    fighting: {
      initial: "waitingForTurn",
      states: {
        waitingForTurn: {
          on: {
            TURN_START: [
              {
                guard: "isMyTurn",
                target: "myTurn",
                actions: "applyTurnStart",
              },
              { target: "opponentTurn", actions: "applyTurnStart" },
            ],
          },
        },
        myTurn: {
          on: {
            TURN_END: { target: "waitingForTurn", actions: "clearTurnClock" },
          },
        },
        opponentTurn: {
          on: {
            TURN_END: { target: "waitingForTurn", actions: "clearTurnClock" },
          },
        },
      },
      on: {
        STATS_UPDATE: { actions: "applyStats" },
        TIMELINE_UPDATE: { actions: "applyTimeline" },
        FIGHTER_UPSERT: { actions: "upsertFighter" },
        FIGHTER_UPDATE: { actions: "updateFighter" },
        FIGHTER_REMOVE: { actions: "removeFighter" },
        FIGHT_END: { target: "ended", actions: "applyEnd" },
        LEAVE: { target: "none", actions: "resetContext" },
      },
    },
    spectating: {
      on: {
        TURN_START: { actions: "applyTurnStart" },
        TURN_END: { actions: "clearTurnClock" },
        TIMELINE_UPDATE: { actions: "applyTimeline" },
        STATS_UPDATE: { actions: "applyStats" },
        FIGHTER_UPSERT: { actions: "upsertFighter" },
        FIGHTER_UPDATE: { actions: "updateFighter" },
        FIGHTER_REMOVE: { actions: "removeFighter" },
        FIGHT_END: { target: "ended", actions: "applyEnd" },
        LEAVE: { target: "none", actions: "resetContext" },
      },
    },
    ended: {
      on: {
        LEAVE: { target: "none", actions: "resetContext" },
        FIGHT_INIT: { target: "placement", actions: "applyInit" },
      },
    },
  },
});

export type FightMachine = typeof fightMachine;
