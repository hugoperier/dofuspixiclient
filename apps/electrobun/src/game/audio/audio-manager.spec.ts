import { beforeEach, describe, expect, it } from "bun:test";

import type { Timers } from "./audio-manager";
import type { Sound, SoundFactory } from "./sound";
import { AudioManager } from "./audio-manager";

interface PendingTimer {
  fn: () => void;
  every: number;
  at: number;
  repeat: boolean;
}

/** Deterministic stand-in for `setTimeout` / `setInterval`. */
class Clock implements Timers {
  private seq = 0;
  private readonly pending = new Map<number, PendingTimer>();
  private now = 0;

  setTimeout(fn: () => void, ms: number): number {
    return this.schedule(fn, ms, false);
  }

  setInterval(fn: () => void, ms: number): number {
    return this.schedule(fn, ms, true);
  }

  clearTimeout(handle: number): void {
    this.pending.delete(handle);
  }

  clearInterval(handle: number): void {
    this.pending.delete(handle);
  }

  /** Run every timer that comes due within `ms`, in chronological order. */
  advance(ms: number): void {
    const until = this.now + ms;

    for (;;) {
      let next: [number, PendingTimer] | null = null;

      for (const entry of this.pending) {
        if (entry[1].at <= until && (!next || entry[1].at < next[1].at)) {
          next = entry;
        }
      }

      if (!next) {
        break;
      }

      const [handle, timer] = next;
      this.now = timer.at;

      if (timer.repeat) {
        timer.at += timer.every;
      } else {
        this.pending.delete(handle);
      }

      timer.fn();
    }

    this.now = until;
  }

  get count(): number {
    return this.pending.size;
  }

  private schedule(fn: () => void, ms: number, repeat: boolean): number {
    const handle = ++this.seq;
    this.pending.set(handle, { fn, every: ms, at: this.now + ms, repeat });
    return handle;
  }
}

interface FakeSound extends Sound {
  url: string;
  loop: boolean;
  startAt: number;
  playing: boolean;
  stopped: boolean;
  level: number;
  muted: boolean;
}

function fakeSounds() {
  const created: FakeSound[] = [];

  const factory: SoundFactory = (url, { loop, startAt }) => {
    const sound: FakeSound = {
      url,
      loop,
      startAt,
      playing: false,
      stopped: false,
      level: 0,
      muted: false,
      play() {
        sound.playing = true;
      },
      stop() {
        sound.stopped = true;
        sound.playing = false;
      },
      setVolume(volume) {
        sound.level = volume;
      },
      setMuted(muted) {
        sound.muted = muted;
      },
      volume() {
        return sound.level;
      },
      // `position` is what save/restore across a fight reads back.
      position() {
        return 42;
      },
    };
    created.push(sound);
    return sound;
  };

  return { created, factory };
}

// A miniature `audio` lang bundle with the shape the real one has.
const LANG = {
  AUM: {
    "115": { f: "loc_amakna.mp3", v: 100, l: true, o: 0 },
    "32": { f: "fig_amakna.mp3", v: 100, l: true, o: 0 },
  },
  AUE: {
    "515": { f: "fx_515.mp3", v: 40, l: false, o: 0 },
    "510": { f: "fx_510.mp3", v: 20, l: false, o: 0 },
    "511": { f: "fx_511.mp3", v: 20, l: false, o: 0 },
  },
  AUA: {
    "1": { bg: [515], n: [510, 511], mind: 15, maxd: 30 },
    "2": { bg: [515], n: [], mind: 15, maxd: 30 },
  },
  AUEC: { CASSAGE_BOIS: 510 },
};

const FADE_MS = 4000;

describe("AudioManager", () => {
  let clock: Clock;
  let sounds: ReturnType<typeof fakeSounds>;
  let audio: AudioManager;
  let random: number;

  beforeEach(async () => {
    clock = new Clock();
    sounds = fakeSounds();
    random = 0;
    audio = new AudioManager({
      createSound: sounds.factory,
      timers: clock,
      random: () => random,
      loadLang: async () => LANG,
    });
    await audio.init();
  });

  describe("music", () => {
    it("resolves the id through the lang table and loops the mp3", async () => {
      await audio.playMusic(115);

      const [track] = sounds.created;
      expect(track).toMatchObject({
        url: "/assets/sound/musics/loc_amakna.mp3",
        loop: true,
        playing: true,
      });
      expect(audio.getMusicId()).toBe(115);
    });

    it("fades in to the channel volume scaled by the lang base volume", async () => {
      audio.setVolume("music", 0.5);
      await audio.playMusic(115);

      expect(sounds.created[0]?.level).toBe(0);
      clock.advance(FADE_MS);
      // base volume 100/100 × channel 0.5
      expect(sounds.created[0]?.level).toBeCloseTo(0.5, 5);
    });

    // `DofusBattlefield.as:134` only calls playMusic when musicID > 0 — maps
    // without one inherit whatever is already playing, so walking into a
    // house does not cut the area's theme.
    it("leaves the current track alone for id 0", async () => {
      await audio.playMusic(115);
      await audio.playMusic(0);

      expect(sounds.created).toHaveLength(1);
      expect(audio.getMusicId()).toBe(115);
    });

    it("ignores a repeat of the id already playing", async () => {
      await audio.playMusic(115);
      await audio.playMusic(115);

      expect(sounds.created).toHaveLength(1);
    });

    it("cross-fades the old track out and disposes it", async () => {
      await audio.playMusic(115);
      clock.advance(FADE_MS);
      await audio.playMusic(32);

      const [previous, next] = sounds.created;
      expect(previous?.stopped).toBe(false);

      clock.advance(FADE_MS);
      expect(previous?.stopped).toBe(true);
      expect(next?.stopped).toBe(false);
      expect(next?.url).toBe("/assets/sound/musics/fig_amakna.mp3");
    });

    it("ignores an id the lang bundle does not know", async () => {
      await audio.playMusic(9999);

      expect(sounds.created).toHaveLength(0);
      expect(audio.getMusicId()).toBe(0);
    });

    // What a fight does: stash the map theme, play the battle theme, then
    // resume the map theme where it left off.
    it("restores the saved track at its previous position", async () => {
      await audio.playMusic(115);
      await audio.playMusic(32, true);
      await audio.backToOldMusic();

      const resumed = sounds.created[sounds.created.length - 1]!;
      expect(resumed.url).toBe("/assets/sound/musics/loc_amakna.mp3");
      expect(resumed.startAt).toBe(42);
      expect(audio.getMusicId()).toBe(115);
    });

    it("does nothing on backToOldMusic when nothing was saved", async () => {
      await audio.playMusic(115);
      await audio.backToOldMusic();

      expect(sounds.created).toHaveLength(1);
    });
  });

  describe("ambiance", () => {
    it("loops every background effect of the environment", async () => {
      await audio.playEnvironment(1);

      const [bed] = sounds.created;
      expect(bed).toMatchObject({
        url: "/assets/sound/effects/fx_515.mp3",
        loop: true,
        playing: true,
      });
      expect(bed?.level).toBeCloseTo((0.3 * 40) / 100, 5);
      expect(audio.getAmbianceId()).toBe(1);
    });

    // `nextEnvironmentNoise`: mind + round(rand × maxd) seconds.
    it("fires a random noise on the lang-driven timer and reschedules", async () => {
      await audio.playEnvironment(1);

      clock.advance(15_000 - 1);
      expect(sounds.created).toHaveLength(1);

      clock.advance(1);
      expect(sounds.created).toHaveLength(2);
      expect(sounds.created[1]).toMatchObject({
        url: "/assets/sound/effects/fx_510.mp3",
        loop: false,
        playing: true,
      });

      clock.advance(15_000);
      expect(sounds.created).toHaveLength(3);
    });

    it("scales the random delay by maxd", async () => {
      random = 0.99;
      await audio.playEnvironment(1);

      clock.advance(45_000 - 1);
      expect(sounds.created).toHaveLength(1);

      clock.advance(1);
      expect(sounds.created).toHaveLength(2);
    });

    // The bed starts at full volume rather than fading in, as the retail
    // client does, so an environment with no noises schedules nothing at all.
    it("schedules no timer for an environment without noises", async () => {
      await audio.playEnvironment(2);

      expect(clock.count).toBe(0);
      clock.advance(120_000);
      expect(sounds.created).toHaveLength(1);
    });

    it("leaves the current environment alone for id 0", async () => {
      await audio.playEnvironment(1);
      await audio.playEnvironment(0);

      expect(audio.getAmbianceId()).toBe(1);
    });

    it("tears the old bed and its noise timer down when switching", async () => {
      await audio.playEnvironment(1);
      const bed = sounds.created[0]!;

      await audio.playEnvironment(2);
      clock.advance(FADE_MS);
      expect(bed.stopped).toBe(true);

      // The old environment's noise timer must not outlive it.
      const before = sounds.created.length;
      clock.advance(120_000);
      expect(sounds.created).toHaveLength(before);
    });
  });

  // `AudioManager.playSound` — the name an animation triggers itself by.
  describe("effects by linkage name", () => {
    it("folds the linkname into the keyname AUEC is keyed by", () => {
      audio.playSound("cassage-bois");

      const [effect] = sounds.created;
      expect(effect).toMatchObject({
        url: "/assets/sound/effects/fx_510.mp3",
        loop: false,
        playing: true,
      });
      expect(effect?.level).toBeCloseTo((0.5 * 20) / 100, 5);
    });

    it("drops a name the bundle does not know", () => {
      audio.playSound("scie_a_metaux");

      expect(sounds.created).toHaveLength(0);
    });
  });

  // The default loader is the one the game actually runs; an injected lang
  // bundle proves nothing about what it keeps (QA-147).
  describe("the shipped bundle", () => {
    it("keeps the effect names, not just the ids", async () => {
      const bundle = {
        data: {
          AUM: LANG.AUM,
          AUE: LANG.AUE,
          AUA: LANG.AUA,
          AUEC: LANG.AUEC,
        },
      };
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response(JSON.stringify(bundle))) as unknown as typeof fetch;

      try {
        const loaded = new AudioManager({
          createSound: sounds.factory,
          timers: clock,
        });
        await loaded.init();
        loaded.playSound("cassage_bois");
      } finally {
        globalThis.fetch = realFetch;
      }

      expect(sounds.created).toHaveLength(1);
      expect(sounds.created[0]?.url).toBe("/assets/sound/effects/fx_510.mp3");
    });
  });

  describe("stop", () => {
    it("silences music and ambiance and forgets the saved track", async () => {
      await audio.playMusic(115);
      await audio.playEnvironment(1);
      audio.stop();

      expect(sounds.created.every((s) => s.stopped)).toBe(true);
      expect(audio.getMusicId()).toBe(0);
      expect(audio.getAmbianceId()).toBe(0);
      expect(clock.count).toBe(0);
    });
  });
});

// Exercise live voices, including those detached by a music transition.
describe("audio lifecycle regressions", () => {
  it("discards background action sounds while allowing explicit alerts", async () => {
    const sounds = fakeSounds();
    const audio = new AudioManager({
      createSound: sounds.factory,
      loadLang: async () => LANG,
      isFocused: () => false,
    });
    await audio.init();
    audio.playEffect(510);
    audio.playSound("fx_611.mp3");
    expect(sounds.created).toHaveLength(0);
    audio.playEffect(510, "effects", true);
    audio.playSound("fx_611.mp3", "effects", true);
    expect(sounds.created).toHaveLength(2);
    audio.stop();
  });
  it("mutes, adjusts and stops effects that have already started", async () => {
    const sounds = fakeSounds();
    const audio = new AudioManager({
      createSound: sounds.factory,
      loadLang: async () => LANG,
    });
    await audio.init();
    audio.playEffect(510);
    audio.setVolume("effects", 0.8);
    audio.setMuted("effects", true);
    expect(sounds.created[0]?.level).toBeCloseTo(0.16);
    expect(sounds.created[0]?.muted).toBe(true);
    audio.stop();
    expect(sounds.created[0]?.stopped).toBe(true);
  });

  it("stops outgoing music during a crossfade", async () => {
    const sounds = fakeSounds();
    const clock = new Clock();
    const audio = new AudioManager({
      createSound: sounds.factory,
      timers: clock,
      loadLang: async () => LANG,
    });
    await audio.init();
    await audio.playMusic(115);
    await audio.playMusic(32);
    audio.stop();
    expect(sounds.created.every((s) => s.stopped)).toBe(true);
    expect(clock.count).toBe(0);
  });

  it("does not resurrect music after stop while loading", async () => {
    const sounds = fakeSounds();
    let resolve!: (value: typeof LANG) => void;
    const audio = new AudioManager({
      createSound: sounds.factory,
      loadLang: () =>
        new Promise((r) => {
          resolve = r;
        }),
    });
    void audio.init();
    const pending = audio.playMusic(115);
    audio.stop();
    resolve(LANG);
    await pending;
    expect(sounds.created).toHaveLength(0);
  });

  it("resolves published filenames and packed linkage names", async () => {
    const sounds = fakeSounds();
    const audio = new AudioManager({
      createSound: sounds.factory,
      loadLang: async () => LANG,
    });
    await audio.init();
    audio.playSound("fx_611.mp3");
    audio.playSound("Abrakleur_Sombre_Hit");
    expect(sounds.created.map((s) => s.url)).toEqual([
      "/assets/sound/effects/fx_611.mp3",
      "/assets/sound/effects/Abrakleur_Sombre_Hit.mp3",
    ]);
    audio.stop();
  });
});

it("normalizes every shipped effect URL and Otomai's empty noise lists", async () => {
  const bundle = await Bun.file(
    new URL("../../../public/assets/langs/fr/audio.json", import.meta.url)
  ).json();
  const sounds = fakeSounds();
  const clock = new Clock();
  const audio = new AudioManager({
    createSound: sounds.factory,
    timers: clock,
    loadLang: async () => bundle.data,
  });
  await audio.init();
  for (const id of Object.keys(bundle.data.AUE)) {
    audio.playEffect(Number(id));
  }
  expect(sounds.created).toHaveLength(Object.keys(bundle.data.AUE).length);
  for (const sound of sounds.created) {
    expect(
      await Bun.file(
        new URL(`../../../public${sound.url}`, import.meta.url)
      ).exists()
    ).toBe(true);
  }
  for (const id of [18, 19, 20]) {
    audio.stop();
    await audio.playEnvironment(id);
    expect(clock.count).toBe(0);
    expect(sounds.created[sounds.created.length - 1]?.url).toEndWith(".mp3");
  }
  audio.stop();
});
