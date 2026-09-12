import { describe, expect, it } from "bun:test";

import { parseMapsBundle } from "@/game/lang/maps-lang";

import { WorldAudio } from "./world-audio";

const maps = parseMapsBundle({
  data: {
    MA: {
      m: { "1": { sa: 4 } },
      sa: { "4": { m: [30, 32] }, "5": { m: [129] } },
    },
  },
});
function player() {
  let music = 0;
  const calls: number[] = [];
  return {
    calls,
    async playMusic(id: number) {
      if (id > 0) {
        music = id;
        calls.push(id);
      }
    },
    async playEnvironment() {},
    async backToOldMusic() {},
    getMusicId: () => music,
    stop: () => {
      music = 0;
    },
    stopMusic: () => {
      music = 0;
    },
  };
}
const map = { mapId: 1, subareaId: 4, musicId: 115, ambianceId: 7 };
describe("world audio transitions", () => {
  it("stops the battle theme when entering a fight from a silent session", async () => {
    const audio = player();
    const world = new WorldAudio(
      audio,
      async () => maps,
      () => 0
    );
    world.setMap({ ...map, musicId: 0 });
    await world.startFight();
    expect(audio.getMusicId()).toBe(30);
    await world.endFight();
    expect(audio.getMusicId()).toBe(0);
  });
  it("restores the inherited theme if a map references a missing music", async () => {
    const audio = player();
    const playMusic = audio.playMusic;
    audio.playMusic = async (id) => {
      if (id !== 100) {
        await playMusic(id);
      }
    };
    const world = new WorldAudio(
      audio,
      async () => maps,
      () => 0
    );
    world.setMap(map);
    world.setMap({ ...map, musicId: 100 });
    await world.startFight();
    await world.endFight();
    expect(audio.getMusicId()).toBe(115);
  });
  it("keeps the map theme for placement, selects by subarea at start and returns at end", async () => {
    const audio = player();
    const world = new WorldAudio(
      audio,
      async () => maps,
      () => 0.99
    );
    world.setMap(map);
    expect(audio.calls).toEqual([115]);
    await world.startFight();
    await world.startFight();
    expect(audio.calls).toEqual([115, 32]);
    await world.endFight();
    await world.endFight();
    expect(audio.calls).toEqual([115, 32, 115]);
  });
  it("uses the server subarea, including regions sharing the exploration theme", async () => {
    const audio = player();
    const world = new WorldAudio(audio, async () => maps);
    world.setMap({ ...map, subareaId: 5, musicId: 129 });
    await world.startFight();
    expect(audio.getMusicId()).toBe(129);
  });
  it("falls back to the map bundle for a missing subarea and preserves inherited music", async () => {
    const audio = player();
    const world = new WorldAudio(
      audio,
      async () => maps,
      () => 0
    );
    world.setMap(map);
    world.setMap({ ...map, subareaId: 0, musicId: 0 });
    await world.startFight();
    await world.endFight();
    expect(audio.calls).toEqual([115, 30, 115]);
  });
  it("does not let a delayed playlist resurrect a fight after leaving or disconnecting", async () => {
    for (const disconnect of [false, true]) {
      const audio = player();
      let ready!: (value: typeof maps) => void;
      const world = new WorldAudio(
        audio,
        () =>
          new Promise((r) => {
            ready = r;
          })
      );
      world.setMap(map);
      const pending = world.startFight();
      if (disconnect) {
        world.stop();
      } else {
        await world.endFight();
      }
      ready(maps);
      await pending;
      expect(audio.calls).not.toContain(30);
      expect(audio.calls).not.toContain(32);
    }
  });
  it("a map update during combat cannot override its track; exit uses the destination", async () => {
    const audio = player();
    const world = new WorldAudio(
      audio,
      async () => maps,
      () => 0
    );
    world.setMap(map);
    await world.startFight();
    world.setMap({ ...map, mapId: 2, musicId: 118 });
    expect(audio.getMusicId()).toBe(30);
    await world.endFight();
    expect(audio.getMusicId()).toBe(118);
  });
});
