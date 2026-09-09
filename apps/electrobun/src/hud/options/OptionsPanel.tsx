import { useCallback, useEffect, useState } from "react";

import {
  type ChordKey,
  formatChord,
  keybindings,
  SHORTCUT_GROUPS,
  type Shortcut,
} from "@/hud/core/keybindings";

import { Panel } from "../components/Panel";

interface OptionsPanelProps {
  onClose: () => void;
  zoom?: number;
}

/**
 * Options — the shortcut editor.
 *
 * 1.29 keeps its bindings in a `SharedObject` and edits them in the
 * options window's `Raccourcis` tab; `Keybindings` keeps ours in
 * localStorage, so this panel only has to read and rewrite that one
 * instance. Every row edits the *primary* chord: `SH0` keeps its `0`
 * alternative, which the row shows but does not let you rebind, because
 * the retail window has no vocabulary for a second key either.
 */
export function OptionsPanel({ onClose, zoom = 1 }: OptionsPanelProps) {
  const [capturing, setCapturing] = useState<Shortcut | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  // Bumped after every write: `keybindings` is a plain object, not a
  // store, so nothing else would tell React the rows changed.
  const [revision, setRevision] = useState(0);

  const p = (n: number) => Math.round(n * zoom);

  const stopCapture = useCallback(() => {
    setCapturing(null);
    setConflict(null);
  }, []);

  useEffect(() => {
    if (!capturing) {
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        stopCapture();
        return;
      }

      // A bare modifier is the player still reaching for the real key.
      if (e.key === "Control" || e.key === "Shift" || e.key === "Meta") {
        return;
      }

      const chord: ChordKey = {
        key: e.key.toLowerCase(),
        ctrl: e.ctrlKey || e.metaKey,
        shift: e.shiftKey,
      };

      const taken = keybindings.findConflict(chord, capturing);

      if (taken) {
        setConflict(
          `${formatChord(chord)} est déjà pris par ${labelOf(taken)}.`
        );
        return;
      }

      // Keep any alternatives the shortcut already had; only the
      // primary chord is being replaced.
      const rest = keybindings.getChords(capturing).slice(1);
      keybindings.rebind(capturing, [chord, ...rest]);
      setRevision((n) => n + 1);
      stopCapture();
    };

    // Capture phase, so the row wins over the global dispatcher — the
    // player is binding `i`, not opening their inventory.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [capturing, stopCapture]);

  return (
    <Panel
      title="Options"
      width={340}
      height={420}
      onClose={onClose}
      zoom={zoom}
      floating
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          fontSize: p(11),
          fontFamily: "Verdana, sans-serif",
          color: "#514a3c",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: `${p(6)}px ${p(8)}px`,
            borderBottom: `${p(1)}px solid #514a3c`,
            fontWeight: "bold",
          }}
        >
          Raccourcis
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: `0 ${p(8)}px` }}>
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <div
                style={{
                  marginTop: p(8),
                  marginBottom: p(3),
                  fontWeight: "bold",
                  color: "#7a7060",
                }}
              >
                {group.title}
              </div>
              {group.entries.map(({ shortcut, label }) => (
                <ShortcutRow
                  key={shortcut}
                  label={label}
                  chords={[...keybindings.getChords(shortcut)]}
                  capturing={capturing === shortcut}
                  revision={revision}
                  zoom={zoom}
                  onEdit={() => {
                    setConflict(null);
                    setCapturing(shortcut);
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        <div
          style={{
            borderTop: `${p(1)}px solid #514a3c`,
            padding: `${p(6)}px ${p(8)}px`,
            display: "flex",
            alignItems: "center",
            gap: p(8),
            minHeight: p(28),
          }}
        >
          <button
            type="button"
            onClick={() => {
              keybindings.resetDefaults();
              setRevision((n) => n + 1);
              stopCapture();
            }}
            style={buttonStyle(zoom)}
          >
            Valeurs par défaut
          </button>
          <span style={{ color: conflict ? "#a33723" : "#7a7060" }}>
            {conflict ??
              (capturing
                ? "Appuyez sur une touche. Échap. annule."
                : "Cliquez sur un raccourci pour le modifier.")}
          </span>
        </div>
      </div>
    </Panel>
  );
}

interface ShortcutRowProps {
  label: string;
  chords: ChordKey[];
  capturing: boolean;
  /** Only here to re-render the row after a rebind. */
  revision: number;
  zoom: number;
  onEdit: () => void;
}

function ShortcutRow({
  label,
  chords,
  capturing,
  zoom,
  onEdit,
}: ShortcutRowProps) {
  const p = (n: number) => Math.round(n * zoom);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: p(8),
        padding: `${p(2)}px 0`,
      }}
    >
      <span>{label}</span>
      <button
        type="button"
        onClick={onEdit}
        style={buttonStyle(zoom, capturing)}
      >
        {capturing ? "…" : chords.map(formatChord).join(" / ")}
      </button>
    </div>
  );
}

function buttonStyle(zoom: number, active = false) {
  const p = (n: number) => Math.round(n * zoom);

  return {
    cursor: "pointer",
    border: "none",
    padding: `${p(2)}px ${p(6)}px`,
    minWidth: p(70),
    whiteSpace: "nowrap",
    fontFamily: "Verdana, sans-serif",
    fontSize: p(11),
    color: "#514a3c",
    background: active ? "#d9d2b4" : "#b4ac8d",
    boxShadow: active
      ? `inset ${p(1)}px ${p(1)}px 0 0 #877b63, inset ${p(-1)}px ${p(-1)}px 0 0 #d1ccb6`
      : `inset ${p(1)}px ${p(1)}px 0 0 #d1ccb6, inset ${p(-1)}px ${p(-1)}px 0 0 #877b63`,
  } as const;
}

/** The row label a conflict message names. */
function labelOf(shortcut: Shortcut): string {
  for (const group of SHORTCUT_GROUPS) {
    for (const entry of group.entries) {
      if (entry.shortcut === shortcut) {
        return entry.label;
      }
    }
  }

  return shortcut;
}
