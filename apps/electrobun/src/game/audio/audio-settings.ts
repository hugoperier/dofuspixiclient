export type AudioChannel = "music" | "environment" | "effects";
export interface AudioSettings {
  volumes: Record<AudioChannel, number>;
  mutes: Record<AudioChannel, boolean>;
  turnAlerts: boolean;
  timerAlerts: boolean;
  notifications: boolean;
}
export const AUDIO_SETTINGS_KEY = "dofus.audio.v1";
export function readAudioSettings(): AudioSettings {
  const settings: AudioSettings = {
    volumes: { music: 0.3, environment: 0.3, effects: 0.5 },
    mutes: { music: false, environment: false, effects: false },
    turnAlerts: true,
    timerAlerts: true,
    notifications: true,
  };
  try {
    const saved = JSON.parse(
      localStorage.getItem(AUDIO_SETTINGS_KEY) ?? "null"
    );
    for (const channel of ["music", "environment", "effects"] as const) {
      const v = saved?.volumes?.[channel];
      if (typeof v === "number" && Number.isFinite(v)) {
        settings.volumes[channel] = Math.max(0, Math.min(1, v));
      }
      const m = saved?.mutes?.[channel];
      if (typeof m === "boolean") {
        settings.mutes[channel] = m;
      }
    }
    for (const key of ["turnAlerts", "timerAlerts", "notifications"] as const) {
      if (typeof saved?.[key] === "boolean") {
        settings[key] = saved[key];
      }
    }
  } catch {
    /* Storage can be unavailable in a webview or private browsing. */
  }
  return settings;
}
export function saveAudioSettings(settings: AudioSettings): void {
  try {
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* Session settings still apply. */
  }
}
