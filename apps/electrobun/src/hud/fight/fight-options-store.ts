import { useSyncExternalStore } from "react";

import { ExternalStore } from "@/game/stores/game-store";
import { fightStore } from "@/game/stores/fight-store";

/**
 * The four leader-only fight options, mirrored from the server's
 * `GameFightOption` (`Go`) frames. Tactical and creature mode are not
 * here: they never leave the client — see `tactical-mode-store` and
 * `creature-mode-store`.
 *
 * `leaderId` arrives on the very same frames, which is the only place
 * the client learns who leads: `GameJoin` carries no leader id.
 */
export interface FightOptionsState {
  needHelp: boolean;
  blockJoin: boolean;
  partyOnly: boolean;
  blockSpectators: boolean;
  leaderId: string | null;
}

/** The single char each option travels as, per 1.29's `Go<s><option>`. */
export const FightOptionCode = {
  NeedHelp: "H",
  BlockSpectators: "A",
  PartyOnly: "P",
  BlockJoin: "N",
} as const;

export type FightOptionCode =
  (typeof FightOptionCode)[keyof typeof FightOptionCode];

const initialState: FightOptionsState = {
  needHelp: false,
  blockJoin: false,
  partyOnly: false,
  blockSpectators: false,
  leaderId: null,
};

export const fightOptionsStore = new ExternalStore<FightOptionsState>(
  initialState
);

const FIELD_BY_CODE: Record<FightOptionCode, keyof FightOptionsState> = {
  [FightOptionCode.NeedHelp]: "needHelp",
  [FightOptionCode.BlockSpectators]: "blockSpectators",
  [FightOptionCode.PartyOnly]: "partyOnly",
  [FightOptionCode.BlockJoin]: "blockJoin",
};

export function applyFightOption(
  option: string,
  enabled: boolean,
  leaderId: number
): void {
  const field = FIELD_BY_CODE[option as FightOptionCode];
  if (!field) {
    return;
  }
  fightOptionsStore.setState({
    ...fightOptionsStore.getSnapshot(),
    [field]: enabled,
    leaderId: String(leaderId),
  });
}

export function resetFightOptions(): void {
  fightOptionsStore.setState(initialState);
}

export function useFightOptions() {
  const state = useSyncExternalStore(
    fightOptionsStore.subscribe,
    fightOptionsStore.getSnapshot
  );
  const mySpriteId = useSyncExternalStore(
    fightStore.subscribe,
    fightStore.getSnapshot
  ).mySpriteId;
  return {
    ...state,
    isLeader: state.leaderId !== null && state.leaderId === mySpriteId,
  };
}
