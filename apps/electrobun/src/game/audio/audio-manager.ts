import { createLogger } from "@/utils/logger";

import {
  type AudioChannel,
  type AudioSettings,
  readAudioSettings,
  saveAudioSettings,
} from "./audio-settings";
import { EFFECT_FILES } from "./effect-files";
import { createHtmlSound, type Sound, type SoundFactory } from "./sound";

const log = createLogger("Audio");
const FADE_MS = 4000;
const FADE_STEPS = 20;
interface LangSound {
  f: string;
  v: number;
  l: boolean;
  o: number;
}
interface LangAmbiance {
  bg: number[];
  n: number[];
  mind: number;
  maxd: number;
}
export interface AudioLang {
  AUM: Record<string, LangSound>;
  AUE: Record<string, LangSound>;
  AUA: Record<string, LangAmbiance>;
  AUEC?: Record<string, number>;
}
export interface Timers {
  setInterval(fn: () => void, ms: number): number;
  clearInterval(handle: number): void;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}
const REAL_TIMERS: Timers = {
  setInterval: (fn, ms) => setInterval(fn, ms) as unknown as number,
  clearInterval: (h) => clearInterval(h),
  setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
  clearTimeout: (h) => clearTimeout(h),
};
export interface AudioManagerDeps {
  isFocused?: () => boolean;
  createSound?: SoundFactory;
  timers?: Timers;
  random?: () => number;
  loadLang?: () => Promise<AudioLang | null>;
}
interface Voice {
  channel: AudioChannel;
  baseVolume: number;
  gain: number;
}

/** Retail keyname folding, also used for packed sounds outside AUEC. */
export function audioKey(name: string): string {
  return name
    .replace(/\.mp3$/i, "")
    .replace(/[ -]/g, "_")
    .replace(/é/g, "e")
    .replace(/à/g, "a")
    .toUpperCase();
}
const effectFiles = new Map(EFFECT_FILES.map((file) => [audioKey(file), file]));

/** Three channels, with ownership of every voice including one-shots and fades. */
export class AudioManager {
  private static instance: AudioManager | null = null;
  private readonly createSound: SoundFactory;
  private readonly timers: Timers;
  private readonly random: () => number;
  private readonly loadLang: () => Promise<AudioLang | null>;
  private readonly isFocused: () => boolean;
  private lang: AudioLang | null = null;
  private initPromise: Promise<void> | null = null;
  private settings = readAudioSettings();
  private readonly listeners = new Set<() => void>();
  private readonly missing = new Set<string>();
  private readonly voices = new Map<Sound, Voice>();
  private readonly fades = new Map<Sound, number>();
  private music: Sound | null = null;
  private musicId = 0;
  private savedMusicId = 0;
  private savedMusicAt = 0;
  private ambianceId = 0;
  private ambianceBed: Sound[] = [];
  private noiseTimer: number | null = null;
  private generation = 0;
  private musicRequest = 0;
  private environmentRequest = 0;

  constructor(deps: AudioManagerDeps = {}) {
    this.createSound = deps.createSound ?? createHtmlSound;
    this.timers = deps.timers ?? REAL_TIMERS;
    this.random = deps.random ?? Math.random;
    this.loadLang = deps.loadLang ?? defaultLoadLang;
    this.isFocused =
      deps.isFocused ??
      (() =>
        typeof document === "undefined" ||
        typeof document.hasFocus !== "function" ||
        document.hasFocus());
  }
  static getInstance(): AudioManager {
    AudioManager.instance ??= new AudioManager();
    return AudioManager.instance;
  }
  init(): Promise<void> {
    this.initPromise ??= this.loadLang()
      .then((lang) => {
        if (!lang) {
          return;
        }
        // The lang converter emits {} for empty AS arrays (Otomaï).
        this.lang = {
          ...lang,
          AUA: Object.fromEntries(
            Object.entries(lang.AUA).map(([id, a]) => [
              id,
              {
                ...a,
                bg: Array.isArray(a.bg) ? a.bg : [],
                n: Array.isArray(a.n) ? a.n : [],
              },
            ])
          ),
        };
      })
      .catch((err) => log.error("Failed to load audio", err));
    return this.initPromise;
  }
  getSettings = (): AudioSettings => this.settings;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  setAlert(
    key: "turnAlerts" | "timerAlerts" | "notifications",
    enabled: boolean
  ): void {
    this.settings = { ...this.settings, [key]: enabled };
    this.settingsChanged();
  }
  setVolume(channel: AudioChannel, volume: number): void {
    if (!Number.isFinite(volume)) {
      return;
    }
    this.settings = {
      ...this.settings,
      volumes: {
        ...this.settings.volumes,
        [channel]: Math.max(0, Math.min(1, volume)),
      },
    };
    this.settingsChanged();
  }
  getVolume(channel: AudioChannel): number {
    return this.settings.volumes[channel];
  }
  setMuted(channel: AudioChannel, muted: boolean): void {
    this.settings = {
      ...this.settings,
      mutes: { ...this.settings.mutes, [channel]: muted },
    };
    this.settingsChanged();
  }
  isMuted(channel: AudioChannel): boolean {
    return this.settings.mutes[channel];
  }
  getMusicId(): number {
    return this.musicId;
  }
  getAmbianceId(): number {
    return this.ambianceId;
  }

  stopMusic(): void {
    this.musicRequest++;
    for (const [sound, voice] of this.voices) {
      if (voice.channel === "music") {
        this.release(sound);
      }
    }
    this.music = null;
    this.musicId = 0;
  }

  async playMusic(id: number, saveOld = false): Promise<void> {
    const generation = this.generation;
    const request = ++this.musicRequest;
    await this.init();
    if (
      generation !== this.generation ||
      request !== this.musicRequest ||
      id <= 0 ||
      id === this.musicId
    ) {
      return;
    }
    const entry = this.lang?.AUM[String(id)];
    if (!entry) {
      this.warnMissing(`music ${id}`);
      return;
    }
    if (saveOld && this.music) {
      this.savedMusicId = this.musicId;
      this.savedMusicAt = this.music.position();
    }
    this.musicId = id;
    this.startMusic(entry, 0);
  }
  async backToOldMusic(): Promise<void> {
    const id = this.savedMusicId;
    const at = this.savedMusicAt;
    this.savedMusicId = 0;
    this.savedMusicAt = 0;
    if (id <= 0 || id === this.musicId) {
      return;
    }
    const generation = this.generation;
    const request = ++this.musicRequest;
    await this.init();
    if (generation !== this.generation || request !== this.musicRequest) {
      return;
    }
    const entry = this.lang?.AUM[String(id)];
    if (!entry) {
      return;
    }
    this.musicId = id;
    this.startMusic(entry, at);
  }
  async playEnvironment(id: number): Promise<void> {
    const generation = this.generation;
    const request = ++this.environmentRequest;
    await this.init();
    if (
      generation !== this.generation ||
      request !== this.environmentRequest ||
      id <= 0 ||
      id === this.ambianceId
    ) {
      return;
    }
    const ambiance = this.lang?.AUA[String(id)];
    if (!ambiance) {
      this.warnMissing(`ambiance ${id}`);
      return;
    }
    this.stopEnvironment(true);
    this.ambianceId = id;
    for (const effectId of ambiance.bg) {
      const entry = this.lang?.AUE[String(effectId)];
      if (!entry) {
        continue;
      }
      const sound = this.spawnEffect(entry, "environment", true);
      if (sound) {
        this.ambianceBed.push(sound);
      }
    }
    this.scheduleNoise(ambiance);
  }
  playEffect(
    id: number,
    channel: AudioChannel = "effects",
    bypassFocus = false
  ): void {
    if (!bypassFocus && !this.isFocused()) {
      return;
    }
    if (this.deferUntilReady(() => this.playEffect(id, channel, bypassFocus))) {
      return;
    }
    const entry = this.lang?.AUE[String(id)];
    if (entry) {
      this.spawnEffect(entry, channel, false);
    }
  }
  playSound(
    name: string,
    channel: AudioChannel = "effects",
    bypassFocus = false
  ): void {
    if (!bypassFocus && !this.isFocused()) {
      return;
    }
    if (
      this.deferUntilReady(() => this.playSound(name, channel, bypassFocus))
    ) {
      return;
    }
    const key = audioKey(name);
    const id = this.lang?.AUEC?.[key];
    if (id !== undefined) {
      this.playEffect(id, channel, bypassFocus);
      return;
    }
    const file = effectFiles.get(key);
    if (file) {
      this.spawnEffect({ f: file, v: 100, l: false, o: 0 }, channel, false);
    } else {
      this.warnMissing(`effect ${name}`);
    }
  }
  /** Invalidates pending loads as well as stopping all currently live voices. */
  stop(): void {
    this.generation++;
    this.musicRequest++;
    this.environmentRequest++;
    this.stopEnvironment(false);
    for (const sound of this.voices.keys()) {
      this.release(sound);
    }
    this.music = null;
    this.musicId = 0;
    this.savedMusicId = 0;
    this.savedMusicAt = 0;
  }
  destroy(): void {
    this.stop();
    this.listeners.clear();
    if (AudioManager.instance === this) {
      AudioManager.instance = null;
    }
  }
  private deferUntilReady(fn: () => void): boolean {
    if (this.lang) {
      return false;
    }
    const generation = this.generation;
    void this.init().then(() => {
      if (this.lang && generation === this.generation) {
        fn();
      }
    });
    return true;
  }
  private spawnEffect(
    entry: LangSound,
    channel: AudioChannel,
    loop: boolean
  ): Sound | null {
    const file = effectFiles.get(audioKey(entry.f));
    if (!file) {
      this.warnMissing(`file ${entry.f}`);
      return null;
    }
    const sound = this.spawn(
      `/assets/sound/effects/${file}`,
      { loop, startAt: entry.o },
      channel,
      entry.v
    );
    sound.play();
    return sound;
  }
  private startMusic(entry: LangSound, at: number): void {
    const previous = this.music;
    const next = this.spawn(
      `/assets/sound/musics/${entry.f}`,
      { loop: entry.l, startAt: at > 0 ? at : entry.o },
      "music",
      entry.v,
      0
    );
    this.music = next;
    if (previous) {
      this.fade(previous, 0, true);
    }
    next.play();
    this.fade(next, 1);
  }
  private spawn(
    url: string,
    options: { loop: boolean; startAt: number },
    channel: AudioChannel,
    baseVolume: number,
    gain = 1
  ): Sound {
    const sound = this.createSound(url, {
      ...options,
      onEnded: () => this.release(sound),
    });
    this.voices.set(sound, { channel, baseVolume, gain });
    this.applyVoice(sound);
    return sound;
  }
  private release(sound: Sound): void {
    const timer = this.fades.get(sound);
    if (timer !== undefined) {
      this.timers.clearInterval(timer);
    }
    this.fades.delete(sound);
    this.voices.delete(sound);
    if (this.music === sound) {
      this.music = null;
      this.musicId = 0;
    }
    sound.stop();
  }
  private stopEnvironment(fade: boolean): void {
    for (const sound of this.ambianceBed) {
      if (fade) {
        this.fade(sound, 0, true);
      } else {
        this.release(sound);
      }
    }
    this.ambianceBed = [];
    this.ambianceId = 0;
    if (this.noiseTimer !== null) {
      this.timers.clearTimeout(this.noiseTimer);
    }
    this.noiseTimer = null;
  }
  private scheduleNoise(ambiance: LangAmbiance): void {
    if (ambiance.n.length === 0) {
      return;
    }
    const delay = Math.max(
      10,
      (ambiance.mind + Math.round(this.random() * ambiance.maxd)) * 1000
    );
    this.noiseTimer = this.timers.setTimeout(() => {
      this.noiseTimer = null;
      this.playEffect(
        ambiance.n[Math.floor(ambiance.n.length * this.random())]!,
        "environment"
      );
      this.scheduleNoise(ambiance);
    }, delay);
  }
  private settingsChanged(): void {
    for (const sound of this.voices.keys()) {
      this.applyVoice(sound);
    }
    saveAudioSettings(this.settings);
    for (const listener of this.listeners) {
      listener();
    }
  }
  private applyVoice(sound: Sound): void {
    const voice = this.voices.get(sound);
    if (!voice) {
      return;
    }
    sound.setVolume(
      ((this.settings.volumes[voice.channel] * voice.baseVolume) / 100) *
        voice.gain
    );
    sound.setMuted(this.settings.mutes[voice.channel]);
  }
  private fade(sound: Sound, target: number, release = false): void {
    const old = this.fades.get(sound);
    if (old !== undefined) {
      this.timers.clearInterval(old);
    }
    const voice = this.voices.get(sound);
    if (!voice) {
      return;
    }
    const from = voice.gain;
    let step = 0;
    const handle = this.timers.setInterval(() => {
      voice.gain = from + (target - from) * (++step / FADE_STEPS);
      this.applyVoice(sound);
      if (step >= FADE_STEPS) {
        this.timers.clearInterval(handle);
        this.fades.delete(sound);
        if (release) {
          this.release(sound);
        }
      }
    }, FADE_MS / FADE_STEPS);
    this.fades.set(sound, handle);
  }
  private warnMissing(name: string): void {
    if (this.missing.has(name)) {
      return;
    }
    this.missing.add(name);
    log.warn(`Unknown audio ${name}`);
  }
}
async function defaultLoadLang(): Promise<AudioLang | null> {
  const res = await fetch("/assets/langs/fr/audio.json");
  if (!res.ok) {
    return null;
  }
  const { data } = (await res.json()) as { data?: AudioLang };
  return data?.AUM && data.AUE && data.AUA ? data : null;
}
