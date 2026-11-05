import { useSyncExternalStore } from "react";

import { ExternalStore } from "@/game/stores/game-store";

/**
 * Creature mode replaces the animated fighters with simplified markers,
 * to keep a crowded battlefield readable. Like tactical mode it is a
 * pure client render mode and never reaches the server.
 */
export interface CreatureModeState {
  creature: boolean;
}

export const creatureModeStore = new ExternalStore<CreatureModeState>({
  creature: false,
});

export function setCreatureMode(value: boolean): void {
  creatureModeStore.setState({ creature: value });
}

export function toggleCreatureMode(): void {
  setCreatureMode(!creatureModeStore.getSnapshot().creature);
}

export function useCreatureMode() {
  const state = useSyncExternalStore(
    creatureModeStore.subscribe,
    creatureModeStore.getSnapshot
  );
  return { creature: state.creature, toggleCreature: toggleCreatureMode };
}
