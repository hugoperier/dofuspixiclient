import { beforeEach, describe, expect, test } from "bun:test";

import type { ItemData } from "@/game/network/protocol";

import {
  applyCoopItem,
  applyPayItem,
  applyPayKamas,
  applySecureCraftReady,
  applySecureCraftResult,
  closeSecureCraft,
  openSecureCraft,
  secureCraftStore,
} from "./secure-craft-store";

const SAWING = 101;

function item(unicId: number, quantity: number): ItemData {
  return {
    itemId: 303,
    unicId,
    quantity,
    position: -1,
    effects: [],
    effectsRaw: "",
  } as unknown as ItemData;
}

function open(role: "customer" | "artisan" = "customer") {
  openSecureCraft(role, SAWING, 3, "Bellegosse");
}

describe("secureCraftStore — the two piles are the reader's, not the roles'", () => {
  beforeEach(closeSecureCraft);

  test("an ingredient lands in whichever pile its owner names", () => {
    open();

    applyCoopItem(true, true, item(1, 5));
    applyCoopItem(false, true, item(2, 15));

    const state = secureCraftStore.getSnapshot();
    expect([...state.mine.keys()]).toEqual([1]);
    expect([...state.theirs.keys()]).toEqual([2]);
  });

  test("the artisan's window splits them the same way", () => {
    // The point of storing "mine"/"theirs" rather than
    // "customer"/"artisan": nothing below the store has to know the role.
    open("artisan");

    applyCoopItem(true, true, item(1, 5));

    expect([...secureCraftStore.getSnapshot().mine.keys()]).toEqual([1]);
  });

  test("a quantity is replaced, not added to — offers are absolute", () => {
    open();

    applyCoopItem(true, true, item(1, 5));
    applyCoopItem(true, true, item(1, 20));

    expect(secureCraftStore.getSnapshot().mine.get(1)?.quantity).toBe(20);
  });

  test("taking a stack back empties its slot", () => {
    open();

    applyCoopItem(true, true, item(1, 5));
    applyCoopItem(true, false, item(1, 0));

    expect(secureCraftStore.getSnapshot().mine.size).toBe(0);
  });
});

describe("secureCraftStore — the payment is two purses", () => {
  beforeEach(closeSecureCraft);

  test("the fee and the premium do not overwrite each other", () => {
    open();

    applyPayKamas(100, false);
    applyPayKamas(400, true);

    const state = secureCraftStore.getSnapshot();
    expect(state.payKamas).toBe(100);
    expect(state.payBonusKamas).toBe(400);
  });

  test("offered goods are their own pile, not ingredients", () => {
    open();

    applyPayItem(true, item(9, 1));

    const state = secureCraftStore.getSnapshot();
    expect([...state.payItems.keys()]).toEqual([9]);
    expect(state.mine.size).toBe(0);
  });
});

describe("secureCraftStore — confirmations", () => {
  beforeEach(closeSecureCraft);

  test("each side's flag is kept apart", () => {
    open();

    applySecureCraftReady(true, true);
    applySecureCraftReady(false, true);

    const state = secureCraftStore.getSnapshot();
    expect(state.myReady).toBe(true);
    expect(state.theirReady).toBe(true);
  });

  test("a result clears both piles, both purses and both flags", () => {
    open();

    applyCoopItem(true, true, item(1, 5));
    applyCoopItem(false, true, item(2, 15));
    applyPayKamas(100, false);
    applyPayKamas(400, true);
    applySecureCraftReady(true, true);

    applySecureCraftResult("S");

    const state = secureCraftStore.getSnapshot();
    expect(state.mine.size).toBe(0);
    expect(state.theirs.size).toBe(0);
    expect(state.payKamas).toBe(0);
    expect(state.payBonusKamas).toBe(0);
    expect(state.myReady).toBe(false);
    expect(state.outcome).toBe("success");
  });

  test("an outcome does not survive the next ingredient", () => {
    // Otherwise "Fabrication réussie" sits over a bench being filled for
    // the next one, which reads as a result the player has not had yet.
    open();
    applySecureCraftResult("E");

    applyCoopItem(true, true, item(1, 5));

    expect(secureCraftStore.getSnapshot().outcome).toBe("none");
  });
});

describe("secureCraftStore — a closed window ignores everything", () => {
  test("frames arriving after `EV` change nothing", () => {
    closeSecureCraft();

    applyCoopItem(true, true, item(1, 5));
    applyPayKamas(100, false);
    applySecureCraftReady(true, true);

    const state = secureCraftStore.getSnapshot();
    expect(state.open).toBe(false);
    expect(state.mine.size).toBe(0);
    expect(state.payKamas).toBe(0);
    expect(state.myReady).toBe(false);
  });
});
