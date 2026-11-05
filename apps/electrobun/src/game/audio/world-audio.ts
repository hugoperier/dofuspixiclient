import { loadMapsLang, type MapsLangData } from "@/game/lang/maps-lang";

import type { AudioManager } from "./audio-manager";

interface MapAudio {
  mapId: number;
  subareaId: number;
  musicId: number;
  ambianceId: number;
}
type Player = Pick<
  AudioManager,
  "playMusic" | "playEnvironment" | "stopMusic" | "getMusicId" | "stop"
>;
/** Keeps map updates, fight transitions and asynchronous lang loading ordered. */
export class WorldAudio {
  private map: MapAudio | null = null;
  private fighting = false;
  private revision = 0;
  private explorationMusic = 0;
  private fightMapId: number | null = null;
  private previousMusic = 0;
  constructor(
    private readonly audio: Player,
    private readonly loadMaps: () => Promise<MapsLangData> = loadMapsLang,
    private readonly random: () => number = Math.random
  ) {}
  setMap(map: MapAudio): void {
    this.revision++;
    this.map = map;
    if (map.musicId > 0) {
      this.explorationMusic = map.musicId;
    }
    void this.audio.playEnvironment(map.ambianceId);
    if (!this.fighting) {
      void this.audio.playMusic(map.musicId);
    }
    // A fight may arrive before the battlefield has replayed its map data.
    else if (this.fightMapId === null) {
      void this.selectFightMusic();
    }
  }
  async startFight(): Promise<void> {
    if (this.fighting) {
      return;
    }
    this.fighting = true;
    await this.selectFightMusic();
  }
  private async selectFightMusic(): Promise<void> {
    const revision = ++this.revision;
    const map = this.map;
    if (!map) {
      return;
    }
    const lang = await this.loadMaps();
    if (!this.fighting || revision !== this.revision || this.map !== map) {
      return;
    }
    const subarea =
      map.subareaId > 0 ? map.subareaId : lang.maps.get(map.mapId)?.subareaId;
    const musics =
      subarea === undefined
        ? []
        : (lang.subareas.get(subarea)?.fightMusicIds ?? []);
    this.fightMapId = map.mapId;
    this.previousMusic = this.audio.getMusicId();
    if (musics.length) {
      await this.audio.playMusic(
        musics[Math.floor(this.random() * musics.length)]!,
        true
      );
    }
  }
  async endFight(): Promise<void> {
    if (!this.fighting) {
      return;
    }
    this.fighting = false;
    const revision = ++this.revision;
    this.fightMapId = null;
    await this.audio.playMusic(this.explorationMusic);
    if (revision !== this.revision || this.fighting) {
      return;
    }
    // A few map ids have no AUM entry. Restore the inherited map theme;
    // never leave a battle theme playing just because a map is silent.
    if (this.audio.getMusicId() !== this.explorationMusic) {
      if (this.previousMusic > 0) {
        await this.audio.playMusic(this.previousMusic);
      } else {
        this.audio.stopMusic();
      }
    }
  }
  stop(): void {
    this.revision++;
    this.fighting = false;
    this.map = null;
    this.fightMapId = null;
    this.explorationMusic = 0;
    this.previousMusic = 0;
    this.audio.stop();
  }
}
