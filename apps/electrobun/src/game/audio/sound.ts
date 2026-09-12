/** The only adapter that touches HTMLAudioElement. */
export interface Sound {
  play(): void;
  stop(): void;
  setVolume(volume: number): void;
  volume(): number;
  setMuted(muted: boolean): void;
  position(): number;
}
export type SoundFactory = (
  url: string,
  options: { loop: boolean; startAt: number; onEnded?: () => void }
) => Sound;

export const createHtmlSound: SoundFactory = (
  url,
  { loop, startAt, onEnded }
) => {
  const audio = new Audio(url);
  audio.loop = loop;
  audio.volume = 0;
  audio.preload = "auto";
  let started = false;
  let disposed = false;
  const removeGestureListeners = () => {
    document.removeEventListener("click", resume);
    document.removeEventListener("keydown", resume);
  };
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    removeGestureListeners();
    audio.removeEventListener("canplay", start);
    audio.removeEventListener("ended", finish);
    audio.removeEventListener("error", fail);
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  };
  const finish = () => {
    dispose();
    onEnded?.();
  };
  const fail = () => {
    console.warn(`[Audio] Could not load ${url}`);
    finish();
  };
  const attempt = () => {
    if (disposed) {
      return;
    }
    void audio.play().catch((error: unknown) => {
      if (disposed) {
        return;
      }
      if (
        loop &&
        error instanceof DOMException &&
        error.name === "NotAllowedError"
      ) {
        // Only ongoing beds/music are deferred. Old one-shots must not burst
        // out together on the first gesture minutes after their event.
        document.addEventListener("click", resume, { once: true });
        document.addEventListener("keydown", resume, { once: true });
      } else {
        finish();
      }
    });
  };
  const resume = () => {
    removeGestureListeners();
    attempt();
  };
  const start = () => {
    if (disposed) {
      return;
    }
    if (startAt > 0) {
      audio.currentTime = startAt;
    }
    attempt();
  };
  audio.addEventListener("ended", finish);
  audio.addEventListener("error", fail);
  return {
    play() {
      if (started || disposed) {
        return;
      }
      started = true;
      if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        start();
      } else {
        audio.addEventListener("canplay", start, { once: true });
      }
    },
    stop: dispose,
    setVolume: (v) => {
      audio.volume = Math.max(0, Math.min(1, v));
    },
    volume: () => audio.volume,
    setMuted: (muted) => {
      audio.muted = muted;
    },
    position: () => audio.currentTime,
  };
};
