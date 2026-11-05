import { useSyncExternalStore } from "react";

import { ExternalStore } from "@/game/stores/game-store";

/**
 * The red arrow a fighter drops on a cell to tell their team "go there"
 * / "hit that one" (`Gf` in 1.29). One marker per sender, replaced on
 * each new one, and only ever shown to the sender's own team — the
 * server decides who receives the frame.
 *
 * `armed` is local: while it is on, the next click on the battlefield
 * places a marker instead of moving or casting.
 */
export interface FightFlagState {
  markers: Map<string, number>;
  armed: boolean;
}

export const fightFlagStore = new ExternalStore<FightFlagState>({
  markers: new Map(),
  armed: false,
});

export function setFightFlag(spriteId: string, cellId: number): void {
  const current = fightFlagStore.getSnapshot();
  const markers = new Map(current.markers);
  markers.set(spriteId, cellId);
  fightFlagStore.setState({ markers, armed: false });
}

export function setFlagArmed(armed: boolean): void {
  fightFlagStore.setState({ ...fightFlagStore.getSnapshot(), armed });
}

export function toggleFlagArmed(): void {
  setFlagArmed(!fightFlagStore.getSnapshot().armed);
}

/** True when the click was consumed as a marker placement. */
export function isFlagArmed(): boolean {
  return fightFlagStore.getSnapshot().armed;
}

export function clearFightFlags(): void {
  fightFlagStore.setState({ markers: new Map(), armed: false });
}

export function useFightFlags() {
  return useSyncExternalStore(
    fightFlagStore.subscribe,
    fightFlagStore.getSnapshot
  );
}
