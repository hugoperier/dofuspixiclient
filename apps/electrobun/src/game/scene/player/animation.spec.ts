import { describe, expect, test } from "bun:test";

import {
  animCycleTriggerFrame,
  casterPose,
  PlayerAnimation,
  spriteBaseOf,
} from "@/game/scene/player/animation";

describe("animCycleTriggerFrame", () => {
  test("rings on the frame the class metadata lands the action", () => {
    // `anim17R` on a class sprite: 45 frames, applyEnd 18.
    expect(animCycleTriggerFrame(45, 18)).toBe(18);
  });

  test("falls back to the last frame with no metadata", () => {
    expect(animCycleTriggerFrame(45, null)).toBe(44);
  });

  test("never leaves the animation", () => {
    expect(animCycleTriggerFrame(20, 99)).toBe(19);
  });

  test("an applyEnd of 0 would never re-arm, so it rings at the end", () => {
    expect(animCycleTriggerFrame(45, 0)).toBe(44);
  });
});

describe("casterPose", () => {
  test("a spell plays the cast pose", () => {
    expect(casterPose("anim1")).toEqual({
      state: PlayerAnimation.CAST,
      sprite: "anim1",
    });
  });

  test("a server that names no clip still casts", () => {
    expect(casterPose("")).toEqual({
      state: PlayerAnimation.CAST,
      sprite: "anim1",
    });
  });

  test("a sword swings on its own clip, not the punch", () => {
    // `GA;303` for the Petite Epée de Boisaille carries its `an: 14`.
    expect(casterPose("anim14")).toEqual({
      state: PlayerAnimation.ATTACK,
      sprite: "anim14",
    });
  });

  test("bare hands punch", () => {
    expect(casterPose("anim0")).toEqual({
      state: PlayerAnimation.ATTACK,
      sprite: "anim0",
    });
  });
});

describe("spriteBaseOf", () => {
  test("a state plays its default clip", () => {
    expect(
      spriteBaseOf({ animation: PlayerAnimation.ATTACK, spriteAnimation: null })
    ).toBe("anim0");
  });

  test("a requested clip outlives a change of facing", () => {
    // `setDirection` mid-swing re-reads this; it must not drop the
    // sword back onto the punch.
    expect(
      spriteBaseOf({
        animation: PlayerAnimation.ATTACK,
        spriteAnimation: "anim14",
      })
    ).toBe("anim14");
  });
});
