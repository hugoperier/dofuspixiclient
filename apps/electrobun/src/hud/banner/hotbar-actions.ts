import type { GameClient } from "@/game/game-client";
import type { HotbarDragPayload } from "@/hud/banner/hotbar-dnd";
import { fightStore } from "@/game/stores/fight-store";
import { inventoryStore } from "@/game/stores/inventory-store";
import {
  resolveShortcut,
  shortcutsStore,
  slotAt,
} from "@/game/stores/shortcuts-store";
import {
  CLOSE_COMBAT_SPELL_ID,
  spellAtSlot,
  spellsStore,
  UNSLOTTED_POSITION,
} from "@/game/stores/spells-store";

/**
 * What a hotbar cell *does* — the one implementation the cells, the
 * keyboard shortcuts and the context menu all go through, so a slot can
 * never behave one way under the mouse and another under its key.
 *
 * Modelled on `MouseShortcuts.click` / `.dblClick` / `.drop`.
 */

/**
 * Activate the slot at `index` (0..13) of the current page.
 *
 * In "items" mode the slot is used or equipped. In "spells" mode it
 * *selects* the spell rather than casting it — 1.29 arms the cursor and
 * waits for a target cell, and so does `fightSelectSpell`. Selecting is
 * inert outside a fight: `checkCanLaunchSpellReturnObject` returns
 * `NOT_IN_FIGHT` and the retail client refuses to cast from the map.
 */
export function activateSlot(client: GameClient | null, index: number): void {
  const { tab, page, items } = shortcutsStore.getSnapshot();
  const slot = slotAt(page, index);

  if (tab === "spells") {
    if (fightStore.getSnapshot().mode !== "fighting") {
      return;
    }

    const spell = spellAtSlot(spellsStore.getSnapshot(), slot);

    if (spell) {
      client?.fightSelectSpell(spell.spellId);
    }

    return;
  }

  if (!items.has(slot)) {
    return;
  }

  triggerSlot(client, slot);
}

/**
 * `SH0` — the weapon container left of the grid.
 *
 * It is not a cell of the bar and it ignores the current tab: 1.29's
 * `onShortcut("SH0")` clicks `_ctrCC` directly, which only ever holds
 * the close-combat spell.
 */
export function activateCloseCombat(client: GameClient | null): void {
  if (fightStore.getSnapshot().mode !== "fighting") {
    return;
  }

  client?.fightSelectSpell(CLOSE_COMBAT_SPELL_ID);
}

/**
 * Use (or equip) whatever the slot resolves to.
 *
 * A usable item is consumed; anything else is treated as gear and sent
 * to its equipment slot, which is what `MouseShortcuts.dblClick` does
 * with `equipItem` when `canUse` is false. An already-equipped item is
 * taken off — the same double-click toggles it back.
 */
export function triggerSlot(client: GameClient | null, slot: number): void {
  if (!client) {
    return;
  }

  const resolved = resolveShortcut(
    shortcutsStore.getSnapshot(),
    inventoryStore.getSnapshot(),
    slot
  );

  if (!resolved?.item) {
    return;
  }

  const { item, template } = resolved;

  if (item.position >= 0) {
    client.moveItem(item.unicId, -1);
    return;
  }

  if (template?.usable) {
    // biome-ignore lint/correctness/useHookAtTopLevel: GameClient.useItem is a plain method, not a hook — biome pattern-matches the name.
    client.useItem(item.unicId);
    return;
  }

  const position = template?.positions[0];

  if (position !== undefined) {
    client.moveItem(item.unicId, position);
  }
}

/**
 * Apply a drop onto `slot`. Every branch is a *request* — the bar only
 * redraws once the server's OrA/OrM/SM frame comes back, so a refused
 * drag leaves no phantom icon behind.
 */
export function dropOnSlot(
  client: GameClient | null,
  slot: number,
  payload: HotbarDragPayload
): void {
  if (!client) {
    return;
  }

  switch (payload.kind) {
    case "spell":
      if (payload.fromSlot === slot) {
        return;
      }
      client.moveSpellToSlot(payload.spellId, slot);
      return;

    case "item":
      client.addItemShortcut(slot, payload.unicId);
      return;

    case "shortcut":
      if (payload.fromSlot === slot) {
        return;
      }
      client.moveItemShortcut(payload.fromSlot, slot);
      return;

    default:
      return;
  }
}

/** A cell dragged off the bar and released over nothing — remove it. */
export function removeFromSlot(
  client: GameClient | null,
  payload: HotbarDragPayload
): void {
  if (!client) {
    return;
  }

  if (payload.kind === "spell" && payload.fromSlot !== undefined) {
    client.moveSpellToSlot(payload.spellId, UNSLOTTED_POSITION);
    return;
  }

  if (payload.kind === "shortcut") {
    client.removeItemShortcut(payload.fromSlot);
  }
}
