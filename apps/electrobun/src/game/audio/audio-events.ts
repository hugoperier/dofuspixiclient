import type { AudioManager } from "./audio-manager";

// AudioEvents.as intentionally maps critical hit to BIP, miss to COUP_CRITIQUE.
const EVENTS = {
  turn: "TURN_START",
  timer: "TAK",
  invitation: "BIP",
  whisper: "BIP",
  criticalHit: "BIP",
  criticalMiss: "COUP_CRITIQUE",
  click: "CLICK",
  click2: "CLICK2",
  click3: "CLICK3",
  mapFlag: "POSE2",
  gameEvent: "GAME_EVENT",
  startHunt: "START_FIGHT",
  taxAttack: "CLANG",
  error: "ERROR",
} as const;
export type AudioEvent = keyof typeof EVENTS;
let active: AudioManager | null = null;
/** UI and notifications are silent outside an owned game session. */
export function bindAudioEvents(audio: AudioManager): () => void {
  active = audio;
  return () => {
    if (active === audio) {
      active = null;
    }
  };
}
export function playAudioEvent(event: AudioEvent): void {
  if (!active) {
    return;
  }
  const settings = active.getSettings();
  if (event === "turn" && !settings.turnAlerts) {
    return;
  }
  if (event === "timer" && !settings.timerAlerts) {
    return;
  }
  if (
    ["invitation", "whisper", "gameEvent", "startHunt", "taxAttack"].includes(
      event
    ) &&
    !settings.notifications
  ) {
    return;
  }
  const bypassFocus = [
    "turn",
    "timer",
    "invitation",
    "whisper",
    "gameEvent",
    "startHunt",
    "taxAttack",
    "error",
  ].includes(event);
  active.playSound(EVENTS[event], "effects", bypassFocus);
}

export function playAnimationSound(name: string): void {
  active?.playSound(name);
}
