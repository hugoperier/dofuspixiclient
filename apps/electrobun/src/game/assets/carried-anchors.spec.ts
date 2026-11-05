import { expect, test } from "bun:test";

import {
  type CarriedAnchors,
  carriedAnchorAt,
  carryingAnimation,
} from "./carried-anchors";

test("carried anchors follow native frames when the published sprite is resampled", () => {
  const first = { x: -8, y: -90 };
  const next = { x: -9, y: -92 };
  const data: CarriedAnchors = {
    fps: 20,
    animations: { walk_CR: [first, next] },
  };
  for (const frame of [0, 1, 2]) {
    expect(carriedAnchorAt(data, "walk_CR", frame, 60)).toBe(first);
  }
  for (const frame of [3, 4, 5]) {
    expect(carriedAnchorAt(data, "walk_CR", frame, 60)).toBe(next);
  }
  expect(carriedAnchorAt(data, "walk_CR", 1, 20)).toBe(next);
  expect(carriedAnchorAt(data, "staticR", 0, 60)).toBeNull();
});

test("carry variants cover idle, movement and throw after the link is released", () => {
  for (const base of ["static", "walk", "run", "hit", "carring"]) {
    expect(carryingAnimation(base, true)).toBe(`${base}_C`);
    expect(carryingAnimation(base, false)).toBe(base);
  }
  expect(carryingAnimation("carringThrow", false)).toBe("carringThrow_C");
  expect(carryingAnimation("walk_C", true)).toBe("walk_C");
});

for (const gfxId of [120, 121]) {
  test(`Pandawa ${gfxId} has published anchor strips for all 16 carrying poses`, async () => {
    const metadata: { carriedAnchors: CarriedAnchors } = await Bun.file(
      new URL(
        `../../../public/assets/spritesheets/sprites/${gfxId}/metadata.json`,
        import.meta.url
      )
    ).json();
    const data = metadata.carriedAnchors;
    expect(Object.keys(data.animations)).toHaveLength(16);
    for (const base of [
      "static",
      "walk",
      "run",
      "hit",
      "die",
      "carring",
      "carringEnd",
      "carringThrow",
    ]) {
      for (const direction of ["R", "L"]) {
        const point = carriedAnchorAt(data, `${base}_C${direction}`, 0, 60);
        expect(point).not.toBeNull();
        expect(Number.isFinite(point?.y)).toBe(true);
      }
    }
  });
}
