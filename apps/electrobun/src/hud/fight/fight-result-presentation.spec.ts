import { expect, test } from "bun:test";

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import {
  FightExperienceProgressSchema,
  GameEndSchema,
} from "@dofus/proto/game_pb";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FightResultWindow } from "./FightResultWindow";
import { resultFixture, resultTemplates } from "./fight-result.fixture";
import {
  durationLabel,
  experiencePercent,
  resultLayout,
} from "./fight-result-presentation";

test("duration omits empty units and keeps the reference wording", () => {
  expect(durationLabel(960000)).toBe("16 minutes");
  expect(durationLabel(3661000)).toBe("1 heure 1 minute 1 seconde");
  expect(durationLabel(0)).toBe("-");
  expect(durationLabel(-1)).toBe("-");
});

test("XP stays precise, clamps inconsistent bounds and handles the level cap", () => {
  const base = 9007199254740993000n;
  expect(
    experiencePercent(
      create(FightExperienceProgressSchema, {
        current: base + 1n,
        levelFloor: base,
        nextLevelFloor: base + 4n,
      })
    )
  ).toBe(25);
  expect(
    experiencePercent(
      create(FightExperienceProgressSchema, {
        current: 40n,
        levelFloor: 90n,
        nextLevelFloor: 160n,
      })
    )
  ).toBe(0);
  expect(
    experiencePercent(
      create(FightExperienceProgressSchema, {
        current: 200n,
        levelFloor: 90n,
        nextLevelFloor: 160n,
      })
    )
  ).toBe(100);
  expect(
    experiencePercent(
      create(FightExperienceProgressSchema, {
        current: 100n,
        levelFloor: 100n,
        nextLevelFloor: 100n,
      })
    )
  ).toBe(0);
  expect(
    experiencePercent(
      create(FightExperienceProgressSchema, {
        current: base,
        levelFloor: 400000n,
      })
    )
  ).toBe(100);
});

test("layout matches reference geometry and uniformly shrinks at half size", () => {
  const full = resultLayout(resultFixture, 914, 532);
  const small = resultLayout(resultFixture, 457, 266);
  expect(full.panelHeight).toBe(323);
  expect(full.scale).toBe(1);
  expect(small.scale).toBe(0.5);
  expect(full.winners).toHaveLength(4);
  expect(full.losers).toHaveLength(1);
  const large = create(GameEndSchema, {
    results: Array.from({ length: 16 }, (_, index) => ({
      spriteId: String(index),
      team: index % 2,
    })),
  });
  const layout = resultLayout(large, 914, 532);
  expect(layout.panelHeight + 26).toBeLessThan(532);
});

test("new result fields round-trip and old frames do not fabricate XP or challenges", () => {
  const decoded = fromBinary(
    GameEndSchema,
    toBinary(GameEndSchema, resultFixture)
  );
  expect(decoded.results[0]?.experience?.current).toBe(50n);
  expect(decoded.challenges[0]?.succeeded).toBe(false);
  const legacy = fromBinary(GameEndSchema, new Uint8Array());
  expect(legacy.challenges).toEqual([]);
  const html = renderToStaticMarkup(
    createElement(FightResultWindow, {
      result: create(GameEndSchema, {
        results: [{ spriteId: "1", name: "Ancien client", xpWon: 12n }],
      }),
      templates: resultTemplates,
      onClose: () => {},
      playArea: { width: 914, height: 532 },
    })
  );
  expect(html).not.toContain('role="progressbar"');
  expect(html).not.toContain("Bonus de challenges");
  expect(html).toContain("Ancien client");
  expect(html).toContain(">12</span>");
});

test("monster rows have blank rewards, and drops have quantities only in tooltips", () => {
  const html = renderToStaticMarkup(
    createElement(FightResultWindow, {
      result: resultFixture,
      templates: resultTemplates,
      onClose: () => {},
      playArea: { width: 914, height: 532 },
    })
  );
  expect(html).toContain('aria-label="Perdants"');
  expect(html).toContain("1 x Note sur Krtek");
  expect(html).not.toContain("☠");
  expect(html).not.toContain(">0</div>");
});
