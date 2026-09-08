import { expect, spyOn, test } from "bun:test";
import { Texture } from "pixi.js";
import { Spell610 } from "./spell-610";
import { Spell1005 } from "./spell-1005";
import { Spell2112 } from "./spell-2112";

for (const [Ctor, count, id] of [[Spell610, 30, 610], [Spell1005, 90, 1005], [Spell2112, 15, 2112]] as const) {
test.each(Array.from({ length: count }, (_, i) => i))(`${id} completes once after impact with random phase %i`, (phase) => {
  const random = spyOn(Math, "random").mockReturnValue((phase + 0.5) / count);
  const spell = new Ctor();
  const events: string[] = [];
  const cell = { cellId: 0, x: 0, y: 0, groundLevel: 0 };
  try {
    spell.init({ cellFrom: cell, cellTo: cell, displayType: 11, anchor: cell,
      angle: 0, distance: 0, level: 6, casterFacingRight: true, parentFrame: 0,
      instanceIndex: 0, isCritical: false,
      caster: { id: 1, name: "Osa", team: 0, hp: 100, maxHp: 100, isPlayer: true },
    }, { onHit: () => events.push("impact"), onComplete: () => events.push("complete"),
      playSound: (id) => events.push(id), onEvent() {},
    }, { getTexture: () => Texture.EMPTY, hasTexture: () => true,
      getFrames: () => Array.from({ length: 96 }, () => Texture.EMPTY),
    });
    for (let frame = 0; frame < 180; frame++) spell.update(1000 / 60);
    expect(events.filter((event) => event === "impact" || event === "complete")).toEqual(["impact", "complete"]);
    if (spell.spellId !== 1005) expect(events).toEqual(["impact", "dodge_610", "complete"]);
    else expect(events).toContain("crockette_1005");
    expect(spell.isComplete()).toBe(true);
  } finally {
    spell.destroy();
    random.mockRestore();
  }
});
}
