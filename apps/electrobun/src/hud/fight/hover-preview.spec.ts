import { afterEach, expect, test } from "bun:test";

import { create } from "@bufbuild/protobuf";
import { DofusPathfinding } from "@dofus/grid";
import {
  GameJoinSchema,
  GameTurnFinishSchema,
  GameTurnStartSchema,
} from "@dofus/proto/game_pb";

import { spellCastActor } from "@/game/machines/spell-cast.machine";
import { fightActor } from "@/game/stores/fight-store";

import { HoverPreview, type HoverPreviewDeps } from "./hover-preview";

afterEach(() => {
  fightActor.send({ type: "LEAVE" });
  spellCastActor.send({ type: "RESET" });
});

function harness() {
  let hover: (cell: number | null) => void = () => {};
  const highlights = new Map<string, number[]>();
  const pf = new DofusPathfinding(15, 17, [200, 215, 230, 245, 260]);
  const preview = new HoverPreview({
    battlefield: {
      setOnCellHover: (fn: typeof hover) => {
        hover = fn;
      },
    } as HoverPreviewDeps["battlefield"],
    fightUI: () =>
      ({
        clearHighlightType: (type: string) => highlights.delete(type),
        highlightCells: (cells: number[], type: string) =>
          highlights.set(type, cells),
      }) as unknown as ReturnType<HoverPreviewDeps["fightUI"]>,
    pathfinding: () => pf,
    currentCellId: () => 200,
    mapDimensions: () => ({ width: 15, height: 17 }),
    isMoving: () => false,
    occupiedCells: () => new Set(),
    syncOccupied: () => {},
    losBlocked: () => false,
  });
  fightActor.send({
    type: "FIGHT_INIT",
    payload: create(GameJoinSchema, {}),
    mySpriteId: "1",
  });
  fightActor.send({ type: "FIGHT_START" });
  fightActor.send({
    type: "TURN_START",
    payload: create(GameTurnStartSchema, { spriteId: "1", timeMs: 30000 }),
  });
  fightActor.send({ type: "STATS_UPDATE", ap: 6, mp: 3 });
  return {
    hover: (cell: number | null) => hover(cell),
    highlights,
    pf,
    preview,
  };
}

test("only a complete reachable path is previewed", () => {
  const h = harness();
  h.hover(245);
  expect(h.highlights.get("movement-path")).toEqual([215, 230, 245]);
  h.hover(260);
  expect(h.highlights.has("movement-path")).toBe(false);
  h.hover(200);
  expect(h.highlights.has("movement-path")).toBe(false);
  h.pf.addOccupied(215);
  h.hover(230);
  expect(h.highlights.has("movement-path")).toBe(false);
});

test("a pending action and a changed turn clear the existing preview", () => {
  const h = harness();
  h.hover(215);
  fightActor.send({ type: "ACTION_PENDING", pending: true });
  h.preview.refreshFromCurrentHover();
  expect(h.highlights.has("movement-path")).toBe(false);
  fightActor.send({ type: "ACTION_PENDING", pending: false });
  fightActor.send({
    type: "TURN_END",
    payload: create(GameTurnFinishSchema, { spriteId: "1" }),
  });
  fightActor.send({
    type: "TURN_START",
    payload: create(GameTurnStartSchema, { spriteId: "2" }),
  });
  h.preview.refreshFromCurrentHover();
  expect(h.highlights.has("movement-path")).toBe(false);
});
