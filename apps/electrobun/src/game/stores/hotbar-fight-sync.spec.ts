import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { fightStore } from "@/game/stores/fight-store";
import { startHotbarFightSync } from "@/game/stores/hotbar-fight-sync";
import { shortcutsStore } from "@/game/stores/shortcuts-store";

let stop: (() => void) | null = null;

beforeEach(() => {
  fightStore.setState({ mode: "none" });
  shortcutsStore.setState({ tab: "items" });
  stop = startHotbarFightSync();
});

afterEach(() => {
  stop?.();
  stop = null;
  fightStore.setState({ mode: "none" });
});

describe("hotbar fight sync", () => {
  it("shows the spells when a fight starts and the items when it ends", () => {
    fightStore.setState({ mode: "placement" });
    expect(shortcutsStore.getSnapshot().tab).toBe("spells");

    fightStore.setState({ mode: "ended" });
    expect(shortcutsStore.getSnapshot().tab).toBe("items");
  });

  it("treats placement, combat and spectating as one fight", () => {
    fightStore.setState({ mode: "placement" });
    shortcutsStore.setState({ tab: "items" });

    // Still inside the fight: no transition, so the tab the player
    // chose has to survive. Re-asserting "spells" here is what would
    // make SWAP look broken mid-turn.
    fightStore.setState({ mode: "fighting" });
    expect(shortcutsStore.getSnapshot().tab).toBe("items");

    fightStore.setState({ mode: "spectating" });
    expect(shortcutsStore.getSnapshot().tab).toBe("items");
  });

  it("stops flipping once unsubscribed", () => {
    stop?.();
    stop = null;

    fightStore.setState({ mode: "fighting" });
    expect(shortcutsStore.getSnapshot().tab).toBe("items");
  });
});
