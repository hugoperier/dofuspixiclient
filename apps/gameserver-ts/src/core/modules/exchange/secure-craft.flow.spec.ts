import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import type { ExchangeSession } from "@modules/exchange/exchange.types";
import type { SecureCraftState } from "@modules/exchange/secure-craft.registry";
import type { ItemRow } from "@shared/db/schema";
import { ExchangeType } from "@dofus/proto/common_pb";
import { SecureCraftFlow } from "@modules/exchange/secure-craft.flow";
import { SecureCraftRegistryService } from "@modules/exchange/secure-craft.registry";

const ARTISAN = { sessionId: "s-art", characterId: "art", name: "Artisan" };
const CUSTOMER = { sessionId: "s-cus", characterId: "cus", name: "Client" };

/** "Scier", Bûcheron. Planche en Frêne = 20 × Bois de Frêne, one slot. */
const SAWING = 101;
const JOB_LUMBERJACK = 2;
const ASH_WOOD = 303;
const ASH_PLANK = 459;
/** The Hache de Bûcheron, from `jobs_data.tools`. */
const AXE = 454;

interface HarnessOptions {
  accepted?: boolean;
  rolls?: number[];
  artisanTool?: number | null;
  artisanLevel?: number;
  payKamas?: string;
  customerKamas?: number;
}

function harness(options: HarnessOptions = {}) {
  const recorded = {
    given: [] as { playerId: string; templateId: number }[],
    experience: [] as { characterId: string; jobId: number; amount: number }[],
    transfers: [] as { from: string; to: string; itemId: string }[],
    kamas: [] as { from: string; to: string; amount: bigint }[],
    removed: [] as string[],
    quantities: [] as { id: string; left: number }[],
  };

  const rolls = [...(options.rolls ?? [0])];
  const originalRandom = Math.random;
  Math.random = () => rolls.shift() ?? 0;

  // Two bags, because the bench is shared: the artisan bringing part of
  // the recipe is the ordinary case of the mechanism, and a harness with
  // one bag cannot tell "consumed from the right player" from "consumed".
  const bags: Record<string, ItemRow[]> = {
    [CUSTOMER.characterId]: [
      { id: "wood", templateId: ASH_WOOD, quantity: 40 },
      { id: "gift", templateId: 1, quantity: 1 },
    ].map((row) => ({
      ...row,
      position: -1,
      ownerId: CUSTOMER.characterId,
    })) as unknown as ItemRow[],
    [ARTISAN.characterId]: [
      { id: "art-wood", templateId: ASH_WOOD, quantity: 15 },
    ].map((row) => ({
      ...row,
      position: -1,
      ownerId: ARTISAN.characterId,
    })) as unknown as ItemRow[],
  };

  const artisanTool =
    options.artisanTool === undefined ? AXE : options.artisanTool;

  const inventory = {
    findOwned: async (playerId: string, id: string) =>
      (bags[playerId] ?? []).find((r) => r.id === id),
    findByPlayer: async (playerId: string) => bags[playerId] ?? [],
    findEquipped: async () =>
      artisanTool === null ? [] : [{ position: 1, templateId: artisanTool }],
    findTemplate: async (id: number) => ({ id, weight: 1, effects: [] }),
    deleteItem: async (id: string) => {
      recorded.removed.push(id);
    },
    updateQuantity: async (id: string, left: number) => {
      recorded.quantities.push({ id, left });
    },
    insertItem: async (grant: { playerId: string; templateId: number }) => {
      recorded.given.push(grant);
      return { id: "made", ...grant } as unknown as ItemRow;
    },
  };

  const craft: SecureCraftState = {
    craftId: "c-1",
    mapId: 7411,
    skillId: SAWING,
    jobId: JOB_LUMBERJACK,
    jobLevel: options.artisanLevel ?? 1,
    maxSlots: 2,
    artisan: ARTISAN,
    customer: CUSTOMER,
    slots: {},
    payItems: {},
    payKamas: options.payKamas ?? "0",
    payBonusKamas: "0",
    accepted: options.accepted ?? true,
    customerReady: false,
    artisanReady: false,
    crafted: 0,
  };

  const crafts = new SecureCraftRegistryService();
  crafts.open(craft);

  const flow = new SecureCraftFlow(
    { withTransaction: <T>(fn: () => Promise<T>) => fn() } as never,
    crafts,
    { get: () => undefined, close: () => {} } as never,
    {
      coopItem: () => {},
      payItem: () => {},
      payKamas: () => {},
      craftResult: () => {},
      leave: () => {},
      openCraft: () => {},
      openCoopCraft: () => {},
      ready: () => {},
      request: () => {},
    } as never,
    { getByCharacter: () => ({ mapId: 7411, name: "x" }) } as never,
    { get: () => ({ accountId: "a" }) } as never,
    { isInFight: () => false } as never,
    {
      findBySkill: async () => [
        {
          resultItemId: ASH_PLANK,
          skillId: SAWING,
          ingredients: [{ itemId: ASH_WOOD, quantity: 20 }],
        },
      ],
    } as never,
    inventory as never,
    {
      sendItemAdd: () => {},
      sendItemRemove: () => {},
      sendItemQuantity: () => {},
    } as never,
    {
      transfer: async (move: {
        from: { id: string };
        to: { id: string };
        itemId: string;
      }) => {
        recorded.transfers.push({
          from: move.from.id,
          to: move.to.id,
          itemId: move.itemId,
        });
        return {
          ok: true as const,
          move: { destination: { id: "moved" } as unknown as ItemRow },
        };
      },
    } as never,
    {
      transfer: async (move: {
        from: { id: string };
        to: { id: string };
        amount: bigint;
      }) => {
        recorded.kamas.push({
          from: move.from.id,
          to: move.to.id,
          amount: move.amount,
        });
        return { ok: true as const };
      },
    } as never,
    {
      load: async () => {},
      skill: () => ({ id: SAWING, jobId: JOB_LUMBERJACK, kind: 2 }),
      isToolOf: (templateId: number, jobId: number) =>
        templateId === AXE && jobId === JOB_LUMBERJACK,
    } as never,
    {
      findPlayerJob: async () => ({
        jobId: JOB_LUMBERJACK,
        level: options.artisanLevel ?? 1,
        experience: "0",
      }),
      findPlayerJobs: async () => [],
    } as never,
    {
      addExperience: async (
        characterId: string,
        jobId: number,
        amount: number
      ) => {
        recorded.experience.push({ characterId, jobId, amount });
        return { jobId, experience: "0", level: 1, leveledTo: null };
      },
      announceGain: async () => {},
    } as never,
    {
      findById: async () => ({ kamas: String(options.customerKamas ?? 5000) }),
    } as never,
    { sendStats: async () => {} } as never
  );

  const sessionFor = (side: typeof ARTISAN, kind: number): ExchangeSession => ({
    sessionId: side.sessionId,
    characterId: side.characterId,
    accountId: "a",
    kind,
    remote: { kind: 1, id: side.characterId },
    phase: "open",
    lockKey: craft.craftId,
    tradeId: craft.craftId,
    openedAt: Date.now(),
  });

  return {
    flow,
    craft,
    recorded,
    artisanSession: sessionFor(
      ARTISAN,
      ExchangeType.EXCHANGE_SECURE_CRAFT_ARTISAN
    ),
    customerSession: sessionFor(
      CUSTOMER,
      ExchangeType.EXCHANGE_SECURE_CRAFT_CLIENT
    ),
    restore: () => {
      Math.random = originalRandom;
    },
  };
}

/** Both sides press "Combiner"; the second one is what crafts. */
async function bothConfirm(h: {
  flow: SecureCraftFlow;
  customerSession: ExchangeSession;
  artisanSession: ExchangeSession;
}) {
  await h.flow.setReady(h.customerSession);
  return h.flow.setReady(h.artisanSession);
}

describe("SecureCraftFlow — who may do what", () => {
  test("either party lays ingredients, each out of their own bag", async () => {
    const h = harness();

    expect(await h.flow.moveItem(h.customerSession, true, "wood", 5)).toEqual({
      ok: true,
    });
    expect(
      await h.flow.moveItem(h.artisanSession, true, "art-wood", 15)
    ).toEqual({ ok: true });

    expect(h.craft.slots).toEqual({
      wood: { characterId: CUSTOMER.characterId, quantity: 5 },
      "art-wood": { characterId: ARTISAN.characterId, quantity: 15 },
    });

    h.restore();
  });

  test("neither may lay a stack out of the other's bag", async () => {
    const h = harness();

    // "wood" exists, but not in the artisan's inventory — `findOwned` is
    // asked about the mover, so this is a miss and not a theft.
    expect(await h.flow.moveItem(h.artisanSession, true, "wood", 20)).toEqual({
      ok: false,
      reason: "not-found",
    });

    h.restore();
  });

  test("neither may take back what the other laid", async () => {
    const h = harness();

    await h.flow.moveItem(h.customerSession, true, "wood", 20);

    expect(await h.flow.moveItem(h.artisanSession, false, "wood", 0)).toEqual({
      ok: false,
      reason: "not-a-party",
    });
    expect(h.craft.slots.wood).toBeDefined();

    h.restore();
  });

  test("one confirmation is not enough", async () => {
    const h = harness({ rolls: [0] });

    await h.flow.moveItem(h.customerSession, true, "wood", 20);

    expect(await h.flow.setReady(h.artisanSession)).toEqual({ ok: true });
    expect(h.craft.artisanReady).toBe(true);
    expect(h.recorded.given).toEqual([]);

    h.restore();
  });

  test("pressing Combiner again takes the confirmation back", async () => {
    const h = harness({ rolls: [0] });

    await h.flow.moveItem(h.customerSession, true, "wood", 20);
    await h.flow.setReady(h.artisanSession);
    await h.flow.setReady(h.artisanSession);

    expect(h.craft.artisanReady).toBe(false);

    // And the customer's own confirmation therefore does not commit.
    await h.flow.setReady(h.customerSession);
    expect(h.recorded.given).toEqual([]);

    h.restore();
  });

  test("nothing happens before both sides have agreed", async () => {
    const h = harness({ accepted: false });

    await h.flow.moveItem(h.customerSession, true, "wood", 20);

    expect(await h.flow.setReady(h.artisanSession)).toEqual({
      ok: false,
      reason: "pending",
    });

    h.restore();
  });

  test("an artisan who took the tool off cannot craft", async () => {
    // Re-checked at craft time, not only when the deal was struck: a
    // proposal can sit on screen for as long as the two like.
    const h = harness({ artisanTool: null });

    await h.flow.moveItem(h.customerSession, true, "wood", 20);

    expect(await bothConfirm(h)).toEqual({ ok: false, reason: "no-tool" });

    h.restore();
  });

  test("a refused craft leaves neither confirmation standing", async () => {
    const h = harness({ artisanTool: null });

    await h.flow.moveItem(h.customerSession, true, "wood", 20);
    await bothConfirm(h);

    expect(h.craft.customerReady).toBe(false);
    expect(h.craft.artisanReady).toBe(false);

    h.restore();
  });
});

describe("SecureCraftFlow — a confirmation covers one particular deal", () => {
  test("laying an ingredient clears both", async () => {
    const h = harness();

    await h.flow.moveItem(h.customerSession, true, "wood", 20);
    await h.flow.setReady(h.customerSession);
    await h.flow.moveItem(h.artisanSession, true, "art-wood", 1);

    expect(h.craft.customerReady).toBe(false);

    h.restore();
  });

  test("changing the payment clears both", async () => {
    const h = harness();

    await h.flow.moveItem(h.customerSession, true, "wood", 20);
    await h.flow.setReady(h.artisanSession);
    await h.flow.movePayKamas(h.customerSession, 250n, false);

    expect(h.craft.artisanReady).toBe(false);

    h.restore();
  });

  test("a completed craft clears both", async () => {
    const h = harness({ rolls: [0] });

    await h.flow.moveItem(h.customerSession, true, "wood", 20);
    await bothConfirm(h);

    expect(h.craft.customerReady).toBe(false);
    expect(h.craft.artisanReady).toBe(false);
    expect(h.craft.slots).toEqual({});

    h.restore();
  });
});

describe("SecureCraftFlow — the split that is the whole point", () => {
  test("the object goes to the customer", async () => {
    const h = harness({ rolls: [0] });

    await h.flow.moveItem(h.customerSession, true, "wood", 20);
    await bothConfirm(h);

    expect(h.recorded.given).toHaveLength(1);
    expect(h.recorded.given[0]).toMatchObject({
      playerId: CUSTOMER.characterId,
      templateId: ASH_PLANK,
    });

    h.restore();
  });

  test("the experience goes to the artisan", async () => {
    const h = harness({ rolls: [0] });

    await h.flow.moveItem(h.customerSession, true, "wood", 20);
    await bothConfirm(h);

    expect(h.recorded.experience).toEqual([
      { characterId: ARTISAN.characterId, jobId: JOB_LUMBERJACK, amount: 1 },
    ]);

    h.restore();
  });

  test("each contribution comes out of its own owner's bag", async () => {
    const h = harness({ rolls: [0] });

    // The recipe wants 20 Ash Wood; between them they have it.
    await h.flow.moveItem(h.customerSession, true, "wood", 5);
    await h.flow.moveItem(h.artisanSession, true, "art-wood", 15);
    await bothConfirm(h);

    expect(h.recorded.given).toHaveLength(1);
    expect(h.recorded.quantities).toEqual([{ id: "wood", left: 35 }]);
    // The artisan's fifteen were the whole stack, so it is gone rather
    // than shrunk.
    expect(h.recorded.removed).toEqual(["art-wood"]);

    h.restore();
  });

  test("a failure still consumes and still pays — as it does solo", async () => {
    const h = harness({ rolls: [0.99] });

    await h.flow.moveItem(h.customerSession, true, "wood", 20);
    await bothConfirm(h);

    expect(h.recorded.given).toEqual([]);
    expect(h.recorded.quantities).toEqual([{ id: "wood", left: 20 }]);
    expect(h.recorded.experience).toHaveLength(1);

    h.restore();
  });
});

describe("SecureCraftFlow — the payment", () => {
  test("moves from the customer to the artisan, and only on a craft", async () => {
    const h = harness({ rolls: [0] });

    await h.flow.moveItem(h.customerSession, true, "wood", 20);
    await h.flow.movePayItem(h.customerSession, true, "gift", 1);
    await h.flow.movePayKamas(h.customerSession, 250n, false);

    // Nothing has moved yet: an offer is a proposal.
    expect(h.recorded.transfers).toEqual([]);
    expect(h.recorded.kamas).toEqual([]);

    await bothConfirm(h);

    expect(h.recorded.transfers).toEqual([
      { from: CUSTOMER.characterId, to: ARTISAN.characterId, itemId: "gift" },
    ]);
    expect(h.recorded.kamas).toEqual([
      { from: CUSTOMER.characterId, to: ARTISAN.characterId, amount: 250n },
    ]);

    h.restore();
  });

  test("the premium is paid on a success, on top of the fee", async () => {
    const h = harness({ rolls: [0] });

    await h.flow.moveItem(h.customerSession, true, "wood", 20);
    await h.flow.movePayKamas(h.customerSession, 100n, false);
    await h.flow.movePayKamas(h.customerSession, 400n, true);
    await bothConfirm(h);

    expect(h.recorded.kamas).toEqual([
      { from: CUSTOMER.characterId, to: ARTISAN.characterId, amount: 500n },
    ]);

    h.restore();
  });

  test("the premium is withheld on a failure; the fee is not", async () => {
    const h = harness({ rolls: [0.99] });

    await h.flow.moveItem(h.customerSession, true, "wood", 20);
    await h.flow.movePayKamas(h.customerSession, 100n, false);
    await h.flow.movePayKamas(h.customerSession, 400n, true);
    await bothConfirm(h);

    expect(h.recorded.given).toEqual([]);
    expect(h.recorded.kamas).toEqual([
      { from: CUSTOMER.characterId, to: ARTISAN.characterId, amount: 100n },
    ]);

    h.restore();
  });

  test("is clamped to the purse rather than refused", async () => {
    const h = harness({ customerKamas: 100 });

    await h.flow.movePayKamas(h.customerSession, 9999n, false);

    expect(h.craft.payKamas).toBe("100");

    h.restore();
  });

  test("the two purses are clamped against each other, not separately", async () => {
    // Both are owed together on a success, so a fee that only fits when
    // the premium is ignored does not fit.
    const h = harness({ customerKamas: 100 });

    await h.flow.movePayKamas(h.customerSession, 80n, false);
    await h.flow.movePayKamas(h.customerSession, 9999n, true);

    expect(h.craft.payBonusKamas).toBe("20");

    h.restore();
  });

  test("a negative offer is refused outright", async () => {
    const h = harness();

    expect(await h.flow.movePayKamas(h.customerSession, -1n, false)).toEqual({
      ok: false,
      reason: "invalid-quantity",
    });

    h.restore();
  });

  test("the artisan cannot set the payment", async () => {
    const h = harness();

    expect(await h.flow.movePayItem(h.artisanSession, true, "gift", 1)).toEqual(
      { ok: false, reason: "not-the-customer" }
    );

    h.restore();
  });
});
