import { useSyncExternalStore } from "react";

import { inventoryStore } from "@/game/stores/inventory-store";
import { useFightMode } from "@/hud/fight/useFightMode";

import {
  FightResultWindow,
  type FightResultWindowProps,
} from "./FightResultWindow";

export function FightEndDialog({ onClose, playArea }: FightResultWindowProps) {
  const fight = useFightMode();
  const inventory = useSyncExternalStore(
    inventoryStore.subscribe,
    inventoryStore.getSnapshot
  );
  if (!fight.isEnded || !fight.result) {
    return null;
  }
  return (
    <FightResultWindow
      result={fight.result}
      templates={inventory.templates}
      onClose={onClose}
      playArea={playArea}
    />
  );
}
