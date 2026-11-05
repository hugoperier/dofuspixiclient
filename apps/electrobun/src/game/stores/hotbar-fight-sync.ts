import { fightStore } from "@/game/stores/fight-store";
import { setHotbarTab } from "@/game/stores/shortcuts-store";

/**
 * Flips the hotbar onto its spell tab for the duration of a fight.
 *
 * 1.29 does this from `Banner.setFightMode()`, which calls
 * `MouseShortcuts.setCurrentTab(TAB_SPELLS)` on the way into combat and
 * restores the roleplay tab on the way out.
 *
 * Only *transitions* switch the tab. Reacting to every store emission
 * would re-assert "spells" on the next damage frame and make the SWAP
 * shortcut look broken mid-fight — the player has to be able to reach
 * their potions during a turn.
 */
export function startHotbarFightSync(): () => void {
  let wasFighting = isFighting();

  return fightStore.subscribe(() => {
    const fighting = isFighting();

    if (fighting === wasFighting) {
      return;
    }

    wasFighting = fighting;
    setHotbarTab(fighting ? "spells" : "items");
  });
}

/** Placement and spectating count: all three want the spell bar. */
function isFighting(): boolean {
  const { mode } = fightStore.getSnapshot();
  return mode === "placement" || mode === "fighting" || mode === "spectating";
}
