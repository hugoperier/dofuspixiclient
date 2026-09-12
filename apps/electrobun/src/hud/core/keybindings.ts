/**
 * Keybindings — modeled on Dofus 1.29 `dofus.managers.KeyManager`.
 *
 * Action names mirror the `sShortcut` vocabulary used by the legacy client
 * (extracted from `assets/sources/client-code/dofus/graphics/gapi/ui/Banner.as`
 * and `dofus/managers/KeyManager.as`). Default key bindings approximate
 * the legacy layout; the real engine persisted user overrides through
 * `SharedObject` — we store overrides in localStorage instead.
 */

/**
 * Canonical Dofus shortcut names. Subset we actually use in the re-write;
 * others (chat history, whisper navigation, conquest, etc.) can be added
 * as they get wired up.
 */
export type Shortcut =
  // ── Flow control ─────────────────────────────────────────
  | "ESCAPE"
  | "ACCEPT_CURRENT_DIALOG"
  | "NEXTTURN"
  // ── Main banner panels ───────────────────────────────────
  | "CHARAC"
  | "SPELLS"
  | "INVENTORY"
  | "QUESTS"
  | "MAP"
  | "FRIENDS"
  | "GUILD"
  | "MOUNT"
  | "JOBS"
  | "OPTIONS"
  // ── Hotbar ───────────────────────────────────────────────
  | "SWAP"
  | "SH0"
  | HotbarShortcut
  // ── Debug tooling (not in legacy) ────────────────────────
  | "DEBUG_TOGGLE"
  | "DEBUG_GRID"
  | "DEBUG_TRANSPARENCY"
  // ── Administration (server capability-gated) ──────────────
  | "ADMIN";

/**
 * `SH1`..`SH14` — one per cell of the shortcut bar. The legacy client
 * names them the same way (`MouseShortcuts.onShortcut` switches on
 * `"SH" + n`). `SH0` is the melee-attack container and is declared
 * separately, because it is not a cell of the 14-slot grid: it holds
 * the equipped weapon and never takes a drop.
 */
export type HotbarShortcut =
  `SH${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14}`;

/** The 14 hotbar shortcuts in cell order, for registration loops. */
export const HOTBAR_SHORTCUTS: readonly HotbarShortcut[] = [
  "SH1",
  "SH2",
  "SH3",
  "SH4",
  "SH5",
  "SH6",
  "SH7",
  "SH8",
  "SH9",
  "SH10",
  "SH11",
  "SH12",
  "SH13",
  "SH14",
];

/** Modifier flags, matching KeyManager.as _bCtrlDown / _bShiftDown. */
export interface ChordKey {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
}

/**
 * Default bindings.
 *
 * Most are read out of the retail lang bundle rather than guessed:
 * `assets/dist/langs/fr/shortcuts.json`, table `SSK`, default set 1
 * (`Clavier français - France`). A shortcut may carry more than one
 * chord — the retail table has the same notion, as the `k2`/`c2`
 * columns on `CODE_CLEAR` show, and the melee slot needs it.
 *
 * Three entries deliberately diverge from that bundle:
 *
 *   - `SWAP` is `Maj+<` where retail binds a bare `<`. A bare `<` is a
 *     printable character and swallowing it costs a key that chat and
 *     future text fields want.
 *   - `NEXTTURN` is `Ctrl+Fin` where retail binds `F1`. `F1` is the
 *     browser's help key and cannot be reliably intercepted here.
 *   - `SH0` adds `0` alongside retail's `²`, which does not exist on
 *     every keyboard this client runs on.
 *
 * All three are rebindable from the options panel; retail's values are
 * legal targets there.
 */
const DEFAULT_BINDINGS: Record<Shortcut, ChordKey[]> = {
  ESCAPE: [{ key: "escape" }],
  ACCEPT_CURRENT_DIALOG: [{ key: "enter" }],
  NEXTTURN: [{ key: "end", ctrl: true }],

  CHARAC: [{ key: "c" }],
  SPELLS: [{ key: "s" }],
  INVENTORY: [{ key: "i" }],
  QUESTS: [{ key: "q" }],
  MAP: [{ key: "m" }],
  FRIENDS: [{ key: "f" }],
  GUILD: [{ key: "g" }],
  MOUNT: [{ key: "u" }],
  JOBS: [{ key: "j" }],
  OPTIONS: [{ key: "o" }],

  // Top row 1..7 are the bare digits, bottom row the same digits with
  // Ctrl, and SH0 — the weapon / close-combat container — is `²`.
  SWAP: [{ key: "<", shift: true }],
  SH0: [{ key: "²" }, { key: "0" }],
  SH1: [{ key: "1" }],
  SH2: [{ key: "2" }],
  SH3: [{ key: "3" }],
  SH4: [{ key: "4" }],
  SH5: [{ key: "5" }],
  SH6: [{ key: "6" }],
  SH7: [{ key: "7" }],
  SH8: [{ key: "1", ctrl: true }],
  SH9: [{ key: "2", ctrl: true }],
  SH10: [{ key: "3", ctrl: true }],
  SH11: [{ key: "4", ctrl: true }],
  SH12: [{ key: "5", ctrl: true }],
  SH13: [{ key: "6", ctrl: true }],
  SH14: [{ key: "7", ctrl: true }],

  DEBUG_TOGGLE: [{ key: "d" }],
  DEBUG_GRID: [{ key: "g", shift: true }],
  DEBUG_TRANSPARENCY: [{ key: "v" }],
  ADMIN: [{ key: "a", ctrl: true, shift: true }],
};

const STORAGE_KEY = "dofus.keybindings.v1";

type ShortcutHandler = () => void;

/** Persisted overrides, before normalisation. */
type StoredChords = ChordKey | ChordKey[];

function chordKey(e: KeyboardEvent): string {
  return e.key.toLowerCase();
}

function chordsEqual(a: ChordKey, b: ChordKey): boolean {
  return (
    a.key.toLowerCase() === b.key.toLowerCase() &&
    !!a.ctrl === !!b.ctrl &&
    !!a.shift === !!b.shift
  );
}

/**
 * Render a chord the way the retail options window does — `Ctrl+Fin`,
 * `Maj+<`, `²`. `shortcuts.json` ships the same strings in its `s`
 * column, so the options panel reads like the one players know.
 */
export function formatChord(chord: ChordKey): string {
  const parts: string[] = [];

  if (chord.ctrl) {
    parts.push("Ctrl");
  }

  if (chord.shift) {
    parts.push("Maj");
  }

  parts.push(KEY_LABELS[chord.key.toLowerCase()] ?? chord.key.toUpperCase());
  return parts.join("+");
}

/** Keys whose `KeyboardEvent.key` is not what a player would recognise. */
const KEY_LABELS: Record<string, string> = {
  " ": "Espace",
  arrowdown: "Bas",
  arrowleft: "Gauche",
  arrowright: "Droite",
  arrowup: "Haut",
  delete: "Suppr",
  end: "Fin",
  enter: "Entrée",
  escape: "Échap.",
  home: "Origine",
  pagedown: "Page bas",
  pageup: "Page haut",
  tab: "Tab",
};

/**
 * Normalise one persisted entry. v1 of the storage format held a single
 * chord per shortcut; reading it as a list keeps a profile written
 * before the melee slot existed instead of silently resetting it.
 */
function toChordList(stored: StoredChords): ChordKey[] {
  return Array.isArray(stored) ? stored : [stored];
}

/**
 * Load overrides persisted in localStorage (mirrors KeyManager's SharedObject).
 * Never throws — malformed data resets to defaults.
 */
function loadOverrides(): Partial<Record<Shortcut, ChordKey[]>> {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Partial<Record<Shortcut, StoredChords>>;

    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }

    const out: Partial<Record<Shortcut, ChordKey[]>> = {};

    for (const [shortcut, stored] of Object.entries(parsed)) {
      if (stored) {
        out[shortcut as Shortcut] = toChordList(stored);
      }
    }

    return out;
  } catch {
    return {};
  }
}

function saveOverrides(overrides: Partial<Record<Shortcut, ChordKey[]>>): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // ignore — in-memory binding still works.
  }
}

/**
 * Keyboard shortcut dispatcher. Attach once, register handlers per shortcut,
 * rebind at runtime. Mirrors the `dispatchShortcut(sShortcut)` API on the
 * legacy KeyManager.
 */
export class Keybindings {
  private bindings: Record<Shortcut, ChordKey[]>;
  private readonly handlers = new Map<Shortcut, ShortcutHandler>();
  private onKeyDown: ((e: KeyboardEvent) => void) | null = null;

  constructor(overrides?: Partial<Record<Shortcut, ChordKey[]>>) {
    const persisted = loadOverrides();
    this.bindings = {
      ...DEFAULT_BINDINGS,
      ...persisted,
      ...(overrides ?? {}),
    };
  }

  /** Register a handler for a shortcut. Replaces any previous handler. */
  on(shortcut: Shortcut, handler: ShortcutHandler): void {
    this.handlers.set(shortcut, handler);
  }

  /** Drop a handler. */
  off(shortcut: Shortcut): void {
    this.handlers.delete(shortcut);
  }

  /** Rebind and persist. Accepts one chord or a list of alternatives. */
  rebind(shortcut: Shortcut, chords: ChordKey | ChordKey[]): void {
    const list = toChordList(chords);
    this.bindings[shortcut] = list;
    const overrides = loadOverrides();
    overrides[shortcut] = list;
    saveOverrides(overrides);
  }

  /** Primary chord for a shortcut — the one an options row edits. */
  getChord(shortcut: Shortcut): ChordKey | undefined {
    return this.bindings[shortcut][0];
  }

  /** Every chord bound to a shortcut, primary first. */
  getChords(shortcut: Shortcut): readonly ChordKey[] {
    return this.bindings[shortcut];
  }

  /** All current bindings — read-only snapshot. */
  getAll(): Readonly<Record<Shortcut, ChordKey[]>> {
    return { ...this.bindings };
  }

  /**
   * The shortcut already answering to `chord`, if any. The options panel
   * asks before it writes, so a rebind cannot quietly shadow another
   * action.
   */
  findConflict(chord: ChordKey, except?: Shortcut): Shortcut | undefined {
    for (const [shortcut, bound] of Object.entries(this.bindings)) {
      if (shortcut === except) {
        continue;
      }

      if (bound.some((candidate) => chordsEqual(chord, candidate))) {
        return shortcut as Shortcut;
      }
    }

    return undefined;
  }

  /** Reset to defaults, clearing persisted overrides. */
  resetDefaults(): void {
    this.bindings = { ...DEFAULT_BINDINGS };
    saveOverrides({});
  }

  /**
   * Start listening to keyboard events. KeyManager.as skips dispatch when
   * input controls are focused; we do the same.
   */
  attach(): void {
    if (this.onKeyDown) {
      return;
    }

    this.onKeyDown = (e: KeyboardEvent) => {
      if (this.isTypingInInput(e.target)) {
        return;
      }

      const chord: ChordKey = {
        key: chordKey(e),
        ctrl: e.ctrlKey || e.metaKey,
        shift: e.shiftKey,
      };

      for (const [shortcut, bound] of Object.entries(this.bindings)) {
        if (!bound.some((candidate) => chordsEqual(chord, candidate))) {
          continue;
        }

        const handler = this.handlers.get(shortcut as Shortcut);

        if (!handler) {
          continue;
        }

        e.preventDefault();
        handler();
        return;
      }
    };

    window.addEventListener("keydown", this.onKeyDown);
  }

  /** Stop listening and drop the handler. */
  destroy(): void {
    if (!this.onKeyDown) {
      return;
    }

    window.removeEventListener("keydown", this.onKeyDown);
    this.onKeyDown = null;
    this.handlers.clear();
  }

  /**
   * The one guard that keeps combat keys out of the chat.
   *
   * Every fight shortcut is a printable character — the bare digits, `²`,
   * `<` — so without this, typing "1234" in the chat would select four
   * spells. `KeyManager.as` gates on `Selection.getFocus()` the same way.
   */
  private isTypingInInput(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    const tag = target.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      target.isContentEditable
    );
  }
}

/**
 * The process-wide dispatcher.
 *
 * `MapRenderer` registers the handlers and owns `attach()` / `destroy()`;
 * the options panel reads and rewrites the bindings. Both need the same
 * instance, and a second one would answer the same keys twice.
 */
export const keybindings = new Keybindings();

/**
 * The rows of the options panel, grouped and ordered the way the retail
 * shortcut window lists them. Debug bindings are deliberately absent:
 * they have no 1.29 counterpart and rebinding them is not a player
 * concern.
 */
export const SHORTCUT_GROUPS: readonly {
  title: string;
  entries: readonly { shortcut: Shortcut; label: string }[];
}[] = [
  {
    title: "Combat",
    entries: [
      { shortcut: "NEXTTURN", label: "Terminer le tour" },
      { shortcut: "SH0", label: "Attaque avec l'arme / CàC" },
      { shortcut: "SWAP", label: "Basculer Sorts / Objets" },
    ],
  },
  {
    title: "Barre de raccourcis — première ligne",
    entries: HOTBAR_SHORTCUTS.slice(0, 7).map((shortcut, i) => ({
      shortcut,
      label: `Raccourci ${i + 1}`,
    })),
  },
  {
    title: "Barre de raccourcis — deuxième ligne",
    entries: HOTBAR_SHORTCUTS.slice(7).map((shortcut, i) => ({
      shortcut,
      label: `Raccourci ${i + 8}`,
    })),
  },
  {
    title: "Fenêtres",
    entries: [
      { shortcut: "CHARAC", label: "Caractéristiques" },
      { shortcut: "SPELLS", label: "Sorts" },
      { shortcut: "INVENTORY", label: "Inventaire" },
      { shortcut: "QUESTS", label: "Quêtes" },
      { shortcut: "MAP", label: "Carte du monde" },
      { shortcut: "FRIENDS", label: "Amis" },
      { shortcut: "GUILD", label: "Guilde" },
      { shortcut: "MOUNT", label: "Monture" },
      { shortcut: "JOBS", label: "Métiers" },
      { shortcut: "OPTIONS", label: "Options" },
    ],
  },
];
