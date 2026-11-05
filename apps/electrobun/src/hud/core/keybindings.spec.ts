import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { type ChordKey, formatChord, Keybindings } from "./keybindings";

/**
 * `Keybindings` is the only place a printable key becomes a game action,
 * so these cases stand in for the whole combat keyboard. The suite runs
 * without a DOM: a minimal `window` and `HTMLElement` are enough, and
 * pulling in a full DOM shim to press four keys would cost more than it
 * proves.
 */

type Listener = (e: KeyboardEvent) => void;

let listeners: Listener[] = [];

class FakeElement {
  tagName: string;
  isContentEditable = false;

  constructor(tagName: string) {
    this.tagName = tagName;
  }
}

function press(chord: ChordKey & { target?: unknown }): void {
  const event = {
    key: chord.key,
    ctrlKey: chord.ctrl ?? false,
    metaKey: false,
    shiftKey: chord.shift ?? false,
    target: chord.target ?? null,
    preventDefault: () => {},
  } as unknown as KeyboardEvent;

  for (const listener of listeners) {
    listener(event);
  }
}

beforeEach(() => {
  listeners = [];
  const g = globalThis as unknown as Record<string, unknown>;
  g.HTMLElement = FakeElement;
  g.window = {
    addEventListener: (_: string, fn: Listener) => listeners.push(fn),
    removeEventListener: (_: string, fn: Listener) => {
      listeners = listeners.filter((entry) => entry !== fn);
    },
  };
});

afterEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = undefined;
  g.HTMLElement = undefined;
});

describe("keybindings", () => {
  it("binds the fight keys the options screen advertises", () => {
    const keys = new Keybindings();

    expect(keys.getChord("NEXTTURN")).toEqual({ key: "end", ctrl: true });
    expect(keys.getChord("SWAP")).toEqual({ key: "<", shift: true });
    expect(keys.getChord("SH1")).toEqual({ key: "1" });
    expect(keys.getChord("SH8")).toEqual({ key: "1", ctrl: true });
  });

  it("answers to either chord of the melee slot", () => {
    const keys = new Keybindings();
    let fired = 0;
    keys.on("SH0", () => {
      fired++;
    });
    keys.attach();

    press({ key: "²" });
    press({ key: "0" });

    expect(fired).toBe(2);
    keys.destroy();
  });

  it("tells Ctrl+1 from a bare 1", () => {
    const keys = new Keybindings();
    const fired: string[] = [];
    keys.on("SH1", () => fired.push("SH1"));
    keys.on("SH8", () => fired.push("SH8"));
    keys.attach();

    press({ key: "1" });
    press({ key: "1", ctrl: true });

    expect(fired).toEqual(["SH1", "SH8"]);
    keys.destroy();
  });

  // Every fight key is a printable character, so without this guard
  // typing "1234" in the chat would select four spells.
  it("stays out of the way while the player is typing", () => {
    const keys = new Keybindings();
    let fired = 0;
    keys.on("SH1", () => {
      fired++;
    });
    keys.on("SH0", () => {
      fired++;
    });
    keys.attach();

    const input = new FakeElement("INPUT");
    press({ key: "1", target: input });
    press({ key: "²", target: input });
    press({ key: "0", target: input });

    const editable = new FakeElement("DIV");
    editable.isContentEditable = true;
    press({ key: "1", target: editable });

    expect(fired).toBe(0);

    press({ key: "1" });
    expect(fired).toBe(1);
    keys.destroy();
  });

  it("refuses to shadow another action", () => {
    const keys = new Keybindings();

    expect(keys.findConflict({ key: "1" })).toBe("SH1");
    expect(keys.findConflict({ key: "1" }, "SH1")).toBeUndefined();
    expect(keys.findConflict({ key: "f4" })).toBeUndefined();
  });

  it("keeps the alternative chords a rebind did not touch", () => {
    const keys = new Keybindings();
    const rest = keys.getChords("SH0").slice(1);
    keys.rebind("SH0", [{ key: "w" }, ...rest]);

    expect(keys.getChords("SH0")).toEqual([{ key: "w" }, { key: "0" }]);

    keys.resetDefaults();
    expect(keys.getChord("SH0")).toEqual({ key: "²" });
  });

  it("renders chords the way the retail bundle spells them", () => {
    expect(formatChord({ key: "end", ctrl: true })).toBe("Ctrl+Fin");
    expect(formatChord({ key: "<", shift: true })).toBe("Maj+<");
    expect(formatChord({ key: "²" })).toBe("²");
    expect(formatChord({ key: "escape" })).toBe("Échap.");
  });
});
