import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { create } from "@bufbuild/protobuf";
import {
  type Application,
  BlurFilter,
  Container,
  DOMAdapter,
  Sprite,
  Texture,
  Ticker,
} from "pixi.js";

import type { MapData } from "@/game/datacenter/map";
import { getMapCoords } from "@/game/input/map-coordinates";
import * as mapsLang from "@/game/lang/maps-lang";
import { MessageHandler } from "@/game/network/message-handler";
import { DofusMessageSchema, GameMapDataSchema } from "@/game/network/protocol";
import { MapTransition } from "@/game/scene/map/transition";

import { MapHandler } from "./map.handler";

const ORIGIN = 991100;
const COORDINATES = new Map([
  [ORIGIN, { x: 0, y: 0 }],
  [991101, { x: 0, y: -1 }],
  [991102, { x: 0, y: 1 }],
  [991103, { x: 1, y: 0 }],
  [991104, { x: -1, y: 0 }],
  [991105, { x: 20, y: 30 }],
]);

const restore: Array<() => void | Promise<void>> = [];

beforeEach(() => {
  // Supply the coordinates available once maps.json has loaded. Keep the
  // real coordinate helper, network handler and animation on the call path.
  const coords = spyOn(mapsLang, "getMapLangCoords").mockImplementation(
    (mapId) => COORDINATES.get(mapId) ?? null
  );
  // Shader precision probing is the only DOM operation needed to construct
  // a real BlurFilter here. Rendering pixels is covered by the visual check.
  const canvas = spyOn(DOMAdapter.get(), "createCanvas").mockReturnValue({
    getContext: () => null,
  } as unknown as HTMLCanvasElement);
  restore.push(
    () => coords.mockRestore(),
    () => canvas.mockRestore()
  );
});

afterEach(async () => {
  for (const cleanup of restore.splice(0).reverse()) {
    await cleanup();
  }
});

function harness() {
  let now = 1_000;
  const clock = spyOn(performance, "now").mockImplementation(() => now);
  const ticker = Ticker.shared;
  const autoStart = ticker.autoStart;
  ticker.autoStart = false;
  ticker.stop();
  ticker.lastTime = now;

  const stage = new Container();
  const map = new Container();
  stage.addChild(map);
  const baseFilter = new BlurFilter({ strength: 0 });
  map.filters = [baseFilter];
  const app = {
    stage,
    screen: { width: 1000, height: 600 },
    renderer: { render: () => {} },
  } as unknown as Application;
  const transition = new MapTransition(app, map, [baseFilter]);
  const messages = new MessageHandler();
  let reveal = Promise.resolve();

  function advance(ms: number) {
    // Keep frames below Pixi's maximum delta so animation time and the
    // clock advance together, without real timers or a running browser.
    for (let elapsed = 0; elapsed < ms; elapsed += 10) {
      now += 10;
      ticker.update(now);
    }
  }

  new MapHandler(
    messages,
    { send: () => true } as never,
    { playMusic: () => {}, playEnvironment: () => {} } as never,
    { getCurrentCharacter: () => null } as never,
    () =>
      ({
        setPathfinding: () => {},
        prepareWorldActors: () => {},
        loadMapFromData: async (
          _data: MapData,
          ...options: Parameters<MapTransition["startTransition"]>
        ) => {
          transition.startTransition(...options);
          if (map.children.length === 0) {
            map.addChild(new Sprite(Texture.WHITE));
          }
          advance(150);
        },
        revealMap: () => {
          reveal = transition.reveal();
          return reveal;
        },
      }) as never
  );

  restore.push(async () => {
    transition.destroy();
    await reveal;
    messages.clear();
    stage.destroy({ children: true });
    baseFilter.destroy();
    ticker.autoStart = autoStart;
    clock.mockRestore();
  });

  return {
    map,
    stage,
    baseFilter,
    transition,
    advance,
    async load(mapId: number) {
      messages.handle(
        create(DofusMessageSchema, {
          payload: {
            case: "gameMapData",
            value: create(GameMapDataSchema, {
              mapId,
              width: 15,
              height: 17,
            }),
          },
        })
      );
      await Promise.resolve();
    },
    finish: () => reveal,
    snapshot: () => {
      const snapshot = stage.getChildByLabel("map-transition-snapshot");
      return snapshot instanceof Sprite ? snapshot : null;
    },
  };
}

describe("map changes keep the existing stationary crossfade", () => {
  test.each([
    ["north", 991101],
    ["south", 991102],
    ["east", 991103],
    ["west", 991104],
    ["teleport", 991105],
    ["unknown map", 991199],
  ])("%s: neither map moves during reveal", async (_label, destination) => {
    const h = harness();
    await h.load(ORIGIN);
    await h.load(destination);

    const snapshot = h.snapshot();
    expect(snapshot).not.toBeNull();
    if (!snapshot) {
      throw new Error("Missing map snapshot");
    }
    const snapshotPosition = { x: snapshot.x, y: snapshot.y };
    expect({ x: h.map.x, y: h.map.y }).toEqual({ x: 0, y: 0 });

    for (let elapsed = 0; elapsed < 200; elapsed += 10) {
      h.advance(10);
      expect({ x: h.map.x, y: h.map.y }).toEqual({ x: 0, y: 0 });
      expect({ x: snapshot.x, y: snapshot.y }).toEqual(snapshotPosition);
    }
    await h.finish();
    expect(h.transition.isTransitioning()).toBe(false);
    expect(getMapCoords(ORIGIN)).toEqual({ x: 0, y: 0 });
    expect(getMapCoords(destination)).toEqual(
      COORDINATES.get(destination) ?? null
    );
  });

  test("fades the old map and unblurs the new one in 200 ms, then releases the snapshot", async () => {
    const h = harness();
    await h.load(ORIGIN);
    await h.load(991102);
    const snapshot = h.snapshot();
    if (!snapshot) {
      throw new Error("Missing map snapshot");
    }
    const texture = snapshot.texture;
    const blur = h.map.filters?.[1];
    expect(blur).toBeInstanceOf(BlurFilter);
    if (!(blur instanceof BlurFilter)) {
      throw new Error("Missing map blur");
    }
    expect(snapshot.alpha).toBe(1);
    expect(blur.strength).toBe(8);
    h.advance(100);
    expect(snapshot.alpha).toBeCloseTo(0.5);
    expect(blur.strength).toBeCloseTo(4);
    h.advance(100);
    await h.finish();

    expect(snapshot.destroyed).toBe(true);
    expect(texture.destroyed).toBe(true);
    expect(h.snapshot()).toBeNull();
    expect(h.map.filters).toEqual([h.baseFilter]);
    expect(h.transition.isTransitioning()).toBe(false);
  });

  test("first load has no snapshot or reveal animation", async () => {
    const h = harness();
    await h.load(ORIGIN);
    await h.finish();
    expect(h.snapshot()).toBeNull();
    expect(h.transition.isTransitioning()).toBe(false);
    expect(h.map.filters).toEqual([h.baseFilter]);
    expect({ x: h.map.x, y: h.map.y }).toEqual({ x: 0, y: 0 });
  });

  test("cleanup during reveal removes temporary resources and preserves the map position", async () => {
    const h = harness();
    await h.load(ORIGIN);
    h.map.position.set(30, 40);
    await h.load(991105);
    const snapshot = h.snapshot();
    if (!snapshot) {
      throw new Error("Missing map snapshot");
    }
    const texture = snapshot.texture;
    h.advance(50);
    h.transition.cleanup();
    await h.finish();

    expect(snapshot.destroyed).toBe(true);
    expect(texture.destroyed).toBe(true);
    expect(h.map.filters).toEqual([h.baseFilter]);
    expect({ x: h.map.x, y: h.map.y }).toEqual({ x: 30, y: 40 });
    expect(h.transition.isTransitioning()).toBe(false);
  });
});
