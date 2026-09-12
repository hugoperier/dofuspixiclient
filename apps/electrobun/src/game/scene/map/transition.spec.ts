import { expect, spyOn, test } from "bun:test";

import { type Application, Container, Sprite, Texture } from "pixi.js";

import { MapTransition } from "./transition";

test("a failed GPU snapshot cannot move the terrain or block the next map load", () => {
  const stage = new Container();
  const map = new Container();
  map.addChild(new Sprite(Texture.WHITE));
  stage.addChild(map);
  map.position.set(42, 17);
  const error = spyOn(console, "error").mockImplementation(() => {});
  const transition = new MapTransition(
    {
      screen: { width: 800, height: 600 },
      stage,
      renderer: {
        render() {
          throw new Error("GPU snapshot unavailable");
        },
      },
    } as unknown as Application,
    map
  );
  try {
    expect(() => transition.startTransition()).not.toThrow();
    expect([map.x, map.y]).toEqual([42, 17]);
    expect(transition.isTransitioning()).toBe(false);
    expect(map.parent === stage).toBe(true);
    expect(map.children).toHaveLength(1);
  } finally {
    transition.destroy();
    error.mockRestore();
    stage.destroy({ children: true });
  }
});
