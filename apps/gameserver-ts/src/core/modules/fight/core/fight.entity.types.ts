import type { StateName } from "@modules/fight/fight.types";

export interface Spectator {
  sessionId: string;
  playerId: number;
}

export interface FightState {
  name: StateName;
  enter(f: unknown): void;
  leave(f: unknown): void;
}

/**
 * 1.29 fight-option codes, the single char `Go<s><option><guid>` carries
 * (StarLoco `SocketManager.java:540`). `enabled` on the wire always means
 * "the leader lit this button".
 */
export const FightOptionCode = {
  NeedHelp: "H",
  BlockSpectators: "A",
  PartyOnly: "P",
  BlockJoin: "N",
} as const;

export type FightOptionCode =
  (typeof FightOptionCode)[keyof typeof FightOptionCode];

/** Every option a leader can toggle, in the order the HUD renders them. */
export const ALL_FIGHT_OPTIONS: readonly FightOptionCode[] = [
  FightOptionCode.NeedHelp,
  FightOptionCode.BlockJoin,
  FightOptionCode.PartyOnly,
  FightOptionCode.BlockSpectators,
];
