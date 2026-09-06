import type { ItemData } from "@/game/network/protocol";

import { ExternalStore } from "./game-store";

/** Which end of the deal this client is standing at. */
export type SecureCraftRole = "none" | "customer" | "artisan";

export interface SecureCraftState {
  open: boolean;
  role: SecureCraftRole;
  /** The skill being practised — the window's caption and its recipe set. */
  skillId: number;
  /** Frozen from the artisan's level, for both windows. */
  maxSlots: number;
  /** The other player's name, for the caption over their contribution. */
  partnerName: string;
  /**
   * The bench, split by who laid it — **mine** and **theirs**, never
   * "customer" and "artisan".
   *
   * The window is drawn relative to the reader: your own contribution is
   * the strip under your bag whichever end of the deal you are standing
   * at. Storing the two piles by role instead would push that decision
   * into every component that draws one, and one of them would eventually
   * get it backwards.
   */
  mine: Map<number, ItemData>;
  theirs: Map<number, ItemData>;
  /** What the customer offers for the work. */
  payItems: Map<number, ItemData>;
  /** The fee, owed whatever the roll says. */
  payKamas: number;
  /** The premium, owed only on a success. */
  payBonusKamas: number;
  /** Each side's "Combiner", relative to the reader like the two piles. */
  myReady: boolean;
  theirReady: boolean;
  outcome: "none" | "success" | "failure";
}

const closed: SecureCraftState = {
  open: false,
  role: "none",
  skillId: 0,
  maxSlots: 0,
  partnerName: "",
  mine: new Map(),
  theirs: new Map(),
  payItems: new Map(),
  payKamas: 0,
  payBonusKamas: 0,
  myReady: false,
  theirReady: false,
  outcome: "none",
};

/**
 * A craft done with somebody else — exchange types 12 and 13.
 *
 * One store for both ends. The two windows differ only in what they let
 * you touch — either party may lay ingredients, only the customer sets the
 * payment — and the server decides that anyway. Keeping one store means
 * the two views cannot disagree about what is on the bench.
 */
export const secureCraftStore = new ExternalStore<SecureCraftState>(closed);

export function openSecureCraft(
  role: SecureCraftRole,
  skillId: number,
  maxSlots: number,
  partnerName: string
): void {
  secureCraftStore.replaceState({
    ...closed,
    open: true,
    role,
    skillId,
    maxSlots,
    partnerName,
    mine: new Map(),
    theirs: new Map(),
    payItems: new Map(),
  });
}

export function closeSecureCraft(): void {
  if (secureCraftStore.getSnapshot().open) {
    secureCraftStore.replaceState(closed);
  }
}

/**
 * `Er` — an ingredient moved on the bench. Absolute, like every offer.
 *
 * `mine` is the frame's `ownerId` compared against the reader's own
 * character id, done by the caller: the store has no route to it.
 */
export function applyCoopItem(
  mine: boolean,
  add: boolean,
  item: ItemData | undefined
): void {
  applyTo(mine ? "mine" : "theirs", add, item);
}

/** `Ep` — the payment pile changed. */
export function applyPayItem(add: boolean, item: ItemData | undefined): void {
  applyTo("payItems", add, item);
}

/** `Ep` for kamas — `bonus` says which of the two purses. */
export function applyPayKamas(kamas: number, bonus: boolean): void {
  if (secureCraftStore.getSnapshot().open) {
    secureCraftStore.setState(
      bonus ? { payBonusKamas: kamas } : { payKamas: kamas }
    );
  }
}

/**
 * `EK` — one side's "Combiner" lit or went out.
 *
 * The server clears both on every change to the piles and says so with a
 * frame each, so this never has to guess.
 */
export function applySecureCraftReady(mine: boolean, ready: boolean): void {
  if (secureCraftStore.getSnapshot().open) {
    secureCraftStore.setState(
      mine ? { myReady: ready } : { theirReady: ready }
    );
  }
}

/** `Ec` — the attempt. Both piles are cleared by the server. */
export function applySecureCraftResult(resultCode: string): void {
  if (!secureCraftStore.getSnapshot().open) {
    return;
  }

  secureCraftStore.setState({
    mine: new Map(),
    theirs: new Map(),
    payItems: new Map(),
    payKamas: 0,
    payBonusKamas: 0,
    myReady: false,
    theirReady: false,
    outcome: resultCode === "S" ? "success" : "failure",
  });
}

function applyTo(
  pile: "mine" | "theirs" | "payItems",
  add: boolean,
  item: ItemData | undefined
): void {
  const state = secureCraftStore.getSnapshot();

  if (!state.open || !item) {
    return;
  }

  const next = new Map(state[pile]);

  if (add) {
    next.set(item.unicId, item);
  } else {
    next.delete(item.unicId);
  }

  secureCraftStore.setState({ [pile]: next, outcome: "none" });
}
