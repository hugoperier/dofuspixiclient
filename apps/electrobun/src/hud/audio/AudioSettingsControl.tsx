import { Volume2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import type { AudioManager } from "@/game/audio/audio-manager";
import { Panel } from "@/hud/components/Panel";

export function AudioSettingsControl({
  audio,
  zoom,
}: {
  audio: AudioManager;
  zoom: number;
}) {
  const [open, setOpen] = useState(false);
  const settings = useSyncExternalStore(audio.subscribe, audio.getSettings);
  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  return (
    <div
      className="absolute right-16 top-2 pointer-events-auto z-40"
      data-audio="off"
    >
      <button
        type="button"
        title="Réglages audio"
        aria-label="Réglages audio"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="ml-auto flex h-8 w-8 items-center justify-center rounded border border-[#514a3c] bg-[#d5cfaa] text-[#514a3c]"
      >
        <Volume2 size={18} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-10"
          role="dialog"
          aria-label="Réglages audio"
        >
          <Panel
            title="Musiques et sons"
            width={275}
            height={285}
            zoom={zoom}
            floating
            onClose={() => setOpen(false)}
          >
            <div
              style={{ padding: 12 * zoom, display: "grid", gap: 12 * zoom }}
            >
              {(
                [
                  ["music", "Musique"],
                  ["environment", "Ambiance"],
                  ["effects", "Effets sonores"],
                ] as const
              ).map(([channel, label]) => (
                <div key={channel}>
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor={`audio-${channel}`}>
                      {label} · {Math.round(settings.volumes[channel] * 100)} %
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={settings.mutes[channel]}
                        onChange={(e) =>
                          audio.setMuted(channel, e.target.checked)
                        }
                        aria-label={`Couper ${label.toLowerCase()}`}
                      />{" "}
                      Muet
                    </label>
                  </div>
                  <input
                    className="w-full accent-[#746b49]"
                    id={`audio-${channel}`}
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(settings.volumes[channel] * 100)}
                    onChange={(e) =>
                      audio.setVolume(channel, Number(e.target.value) / 100)
                    }
                  />
                </div>
              ))}
              <div className="grid gap-2 border-t border-[#a39a78] pt-2">
                {(
                  [
                    ["turnAlerts", "Début de mon tour"],
                    ["timerAlerts", "Dernières secondes du tour"],
                    ["notifications", "Messages privés et invitations"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings[key]}
                      onChange={(e) => audio.setAlert(key, e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
