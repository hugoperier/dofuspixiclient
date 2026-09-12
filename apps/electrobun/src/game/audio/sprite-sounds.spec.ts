import { describe, expect, it } from "bun:test";

import { Sprite, Texture } from "pixi.js";

import type {
  CharacterAnimation,
  CharacterSpriteLoader,
} from "@/game/assets/character-sprite";
import type { ActivePlayer } from "@/game/scene/player/types";
import { PlayerSpriteController } from "@/game/scene/player/sprite-controller";

function setup() {
  const sounds: string[] = [];
  const animation: CharacterAnimation = {
    textures: [Texture.EMPTY, Texture.EMPTY, Texture.EMPTY],
    frameCount: 3,
    fps: 10,
    offsetX: 0,
    offsetY: 0,
    frameWidth: 1,
    frameHeight: 1,
    sounds: [
      { frame: 0, soundId: "step" },
      { frame: 1, soundId: "swing" },
      { frame: 1, soundId: "voice" },
    ],
  };
  const player = {
    sprite: new Sprite(Texture.EMPTY),
    currentAnimData: animation,
    frameIndex: 0,
    frameTimer: 0,
    animation: "walk",
  } as ActivePlayer;
  const controller = new PlayerSpriteController(
    {} as CharacterSpriteLoader,
    () => true,
    () => 1,
    (name) => sounds.push(name)
  );
  return { sounds, player, controller };
}
describe("sprite audio playback", () => {
  it("plays simultaneous cues once per entered frame, repeating only on a new cycle", () => {
    const { sounds, player, controller } = setup();
    controller.tickFrame(player, 0);
    controller.tickFrame(player, 0);
    expect(sounds).toEqual(["step"]);
    controller.tickFrame(player, 0.1);
    controller.tickFrame(player, 0);
    expect(sounds).toEqual(["step", "swing", "voice"]);
    controller.tickFrame(player, 0.1);
    controller.tickFrame(player, 0.1);
    expect(sounds).toEqual(["step", "swing", "voice", "step"]);
  });
  it("does not repeat a held one-shot or duplicate the harvest's own cues", () => {
    const { sounds, player, controller } = setup();
    player.animation = "attack";
    for (let i = 0; i < 8; i++) {
      controller.tickFrame(player, 0.1);
    }
    expect(sounds).toEqual(["step", "swing", "voice"]);
    player.animation = "harvest";
    player.frameIndex = 0;
    for (let i = 0; i < 8; i++) {
      controller.tickFrame(player, 0.1);
    }
    expect(sounds).toEqual(["step", "swing", "voice"]);
  });
});
