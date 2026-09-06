import { randomUUID } from "node:crypto";

import type { Recipe } from "@modules/exchange/craft.repository";
import type { ExchangeSession } from "@modules/exchange/exchange.types";
import type {
  SecureCraftSide,
  SecureCraftState,
} from "@modules/exchange/secure-craft.registry";
import type { TransactionalAdapterKysely } from "@nestjs-cls/transactional-adapter-kysely";
import type { DB, ItemRow } from "@shared/db/schema";
import { ExchangeType } from "@dofus/proto/common_pb";
import { CraftRepository } from "@modules/exchange/craft.repository";
import { ExchangeFramesService } from "@modules/exchange/exchange.frames.service";
import { ExchangeRegistryService } from "@modules/exchange/exchange.registry";
import { SecureCraftRegistryService } from "@modules/exchange/secure-craft.registry";
import { FightRegistryService } from "@modules/fight/registry/fight.registry";
import { InventoryFramesService } from "@modules/inventory/inventory.frames.service";
import { InventoryRepository } from "@modules/inventory/inventory.repository";
import { rollItemEffects } from "@modules/inventory/item-effects";
import { playerOwner } from "@modules/items/item-owner";
import { ItemTransferService } from "@modules/items/item-transfer.service";
import { KamasTransferService } from "@modules/items/kamas-transfer.service";
import {
  craftExperience,
  fitsInGrid,
  isSkillUnlocked,
  rollCraft,
} from "@modules/jobs/craft.rules";
import { JobsCatalogService } from "@modules/jobs/jobs.catalog.service";
import { craftSlotsAtLevel } from "@modules/jobs/jobs.craft-slots";
import { JobsRepository } from "@modules/jobs/jobs.repository";
import { JobsService } from "@modules/jobs/jobs.service";
import { PlayerPresenceService } from "@modules/player-presence/player-presence.service";
import { PlayersRepository } from "@modules/players/players.repository";
import { StatsService } from "@modules/stats/stats.service";
import { Injectable, Logger } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { JobSkillKind } from "@shared/db/schema";
import { SessionRegistry } from "@shared/gateway-adapter/session-registry";

export type SecureCraftDenial =
  | "self"
  | "not-in-world"
  | "target-not-found"
  | "different-map"
  | "target-busy"
  | "already-exchanging"
  | "no-session"
  | "not-target"
  | "not-the-customer"
  | "not-the-artisan"
  | "not-a-party"
  | "no-job"
  | "no-tool"
  | "skill-locked"
  | "not-a-craft-skill"
  | "not-found"
  | "equipped"
  | "not-enough"
  | "invalid-quantity"
  | "no-slot-left"
  | "empty-bench"
  | "no-such-recipe"
  | "recipe-too-large"
  | "pending";

export type SecureCraftResult =
  | { ok: true }
  | { ok: false; reason: SecureCraftDenial };

/** `equip-rules.ts`'s weapon slot — where a job tool is worn. */
const WEAPON_POSITION = 1;

/**
 * Crafting for somebody else — exchange types 12 and 13.
 *
 * Two windows, one deal. **Either** party may put ingredients on the bench —
 * the artisan covering the part of the recipe the customer could not find is
 * the ordinary case, and a customer holding every ingredient would have had
 * no reason to hire anybody. What is not symmetric is the outcome: the object
 * goes to the customer, the **experience** to the artisan, and the payment
 * the other way. That split is the whole point of the mechanism, and it is
 * the one thing here that would be invisible if it were wrong — an artisan
 * who received the object as well would look like a working feature to
 * anyone not counting.
 *
 * Both sides confirm. "Combiner" is a flag, not a trigger: it sets the
 * presser's own, and only the second one to arrive runs the craft. Any
 * change to either pile afterwards clears both, so nobody can agree to one
 * recipe and commit to another — the same rule a trade's `EK` follows, and
 * for the same reason.
 *
 * The shape is `TradeFlow`'s, not `CraftFlow`'s: one shared `lockKey` rather
 * than two locks, so the artisan's `EK` can never interleave with the
 * customer's `EMO`. What it borrows from `CraftFlow` is the rules — the same
 * `craft.rules.ts` decides slots, experience and the roll, so a co-operative
 * craft and a solo one cannot drift apart.
 *
 * **Nothing moves until the artisan crafts.** Ingredients, payment and the
 * result all commit in one transaction, so a socket dropping mid-deal has
 * nothing to undo.
 *
 * The two sides are told apart by the type each *receives*: 12 is the
 * customer's window, 13 the artisan's. Which of the two opened the deal is
 * not recorded beyond that — "Inviter à" and "Demander à" are the same
 * arrangement seen from opposite ends.
 */
@Injectable()
export class SecureCraftFlow {
  private readonly logger = new Logger(SecureCraftFlow.name);

  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterKysely<DB>>,
    private readonly crafts: SecureCraftRegistryService,
    private readonly exchanges: ExchangeRegistryService,
    private readonly frames: ExchangeFramesService,
    private readonly presence: PlayerPresenceService,
    private readonly sessions: SessionRegistry,
    private readonly fights: FightRegistryService,
    private readonly recipes: CraftRepository,
    private readonly inventory: InventoryRepository,
    private readonly inventoryFrames: InventoryFramesService,
    private readonly transfers: ItemTransferService,
    private readonly kamas: KamasTransferService,
    private readonly catalog: JobsCatalogService,
    private readonly jobsRepo: JobsRepository,
    private readonly jobs: JobsService,
    private readonly players: PlayersRepository,
    private readonly stats: StatsService
  ) {}

  /** The deal this session belongs to, if any. */
  craftOf(session: ExchangeSession): SecureCraftState | undefined {
    return session.tradeId ? this.crafts.get(session.tradeId) : undefined;
  }

  /**
   * `ER12` / `ER13` — one player proposes the arrangement to another.
   *
   * `asArtisan` is which end the *initiator* is standing at: type 13 is the
   * artisan inviting a customer, type 12 the customer asking an artisan.
   * Everything after this point is symmetric.
   */
  async request(
    session: { sessionId: string; accountId: string; characterId: string },
    targetCharacterId: string,
    skillId: number,
    asArtisan: boolean
  ): Promise<SecureCraftResult> {
    if (targetCharacterId === session.characterId) {
      return { ok: false, reason: "self" };
    }

    const me = this.presence.getByCharacter(session.characterId);
    const them = this.presence.getByCharacter(targetCharacterId);

    if (!me) {
      return { ok: false, reason: "not-in-world" };
    }

    if (!them) {
      return { ok: false, reason: "target-not-found" };
    }

    // The map, not the distance — the same rule `TradeFlow` applies, and
    // for the same reason: nothing else outside a fight checks adjacency
    // (QA-114), and inventing it here would make this stricter than talking
    // to a banker. The bench the artisan is supposed to be standing at is
    // part of that same unwritten rule.
    if (me.mapId !== them.mapId) {
      return { ok: false, reason: "different-map" };
    }

    if (
      this.exchanges.has(them.sessionId) ||
      this.fights.isInFight(them.sessionId)
    ) {
      return { ok: false, reason: "target-busy" };
    }

    const artisan = asArtisan
      ? {
          sessionId: session.sessionId,
          characterId: session.characterId,
          name: me.name,
        }
      : {
          sessionId: them.sessionId,
          characterId: targetCharacterId,
          name: them.name,
        };
    const customer = asArtisan
      ? {
          sessionId: them.sessionId,
          characterId: targetCharacterId,
          name: them.name,
        }
      : {
          sessionId: session.sessionId,
          characterId: session.characterId,
          name: me.name,
        };

    const ready = await this.artisanCan(artisan.characterId, skillId);

    if (!ready.ok) {
      return ready;
    }

    const craftId = randomUUID();

    this.crafts.open({
      craftId,
      mapId: me.mapId,
      skillId,
      jobId: ready.jobId,
      jobLevel: ready.level,
      maxSlots: craftSlotsAtLevel(ready.level),
      artisan,
      customer,
      slots: {},
      payItems: {},
      payKamas: "0",
      payBonusKamas: "0",
      accepted: false,
      customerReady: false,
      artisanReady: false,
      crafted: 0,
    });

    for (const [side, kind] of [
      [customer, ExchangeType.EXCHANGE_SECURE_CRAFT_CLIENT],
      [artisan, ExchangeType.EXCHANGE_SECURE_CRAFT_ARTISAN],
    ] as const) {
      this.exchanges.open({
        sessionId: side.sessionId,
        characterId: side.characterId,
        accountId: this.accountOf(side.sessionId),
        kind,
        remote: playerOwner(
          side.characterId === artisan.characterId
            ? customer.characterId
            : artisan.characterId
        ),
        phase: "pending",
        // The shared key: one queue, not two locks.
        lockKey: craftId,
        tradeId: craftId,
        openedAt: Date.now(),
      });
    }

    this.frames.request(
      [session.sessionId, them.sessionId],
      { id: session.characterId, name: me.name },
      { id: targetCharacterId, name: them.name },
      asArtisan
        ? ExchangeType.EXCHANGE_SECURE_CRAFT_ARTISAN
        : ExchangeType.EXCHANGE_SECURE_CRAFT_CLIENT
    );

    this.logger.log(
      `secure craft ${craftId}: ${artisan.characterId} works for ` +
        `${customer.characterId} (skill ${skillId})`
    );

    return { ok: true };
  }

  /** `EA` — the invited side says yes, and both windows open. */
  accept(session: ExchangeSession): SecureCraftResult {
    const craft = this.craftOf(session);

    if (!craft) {
      return { ok: false, reason: "no-session" };
    }

    if (craft.accepted) {
      return { ok: true };
    }

    craft.accepted = true;

    for (const [side, kind] of [
      [craft.customer, ExchangeType.EXCHANGE_SECURE_CRAFT_CLIENT],
      [craft.artisan, ExchangeType.EXCHANGE_SECURE_CRAFT_ARTISAN],
    ] as const) {
      const open = this.exchanges.get(side.sessionId);

      if (open) {
        open.phase = "open";
      }

      this.frames.openCoopCraft(
        side.sessionId,
        kind,
        craft.skillId,
        craft.maxSlots,
        side.characterId === craft.artisan.characterId
          ? craft.customer.name
          : craft.artisan.name
      );
    }

    return { ok: true };
  }

  /**
   * `EMO` — a party lays an ingredient.
   *
   * Either of them, and each out of their own bag. The stack is recorded
   * against whoever laid it, which is what lets the commit take it back out
   * of the right inventory and the window draw it under the right name; a
   * player can only ever take back what they laid themselves.
   */
  async moveItem(
    session: ExchangeSession,
    add: boolean,
    itemId: string,
    quantity: number
  ): Promise<SecureCraftResult> {
    const craft = this.craftOf(session);

    if (!craft) {
      return { ok: false, reason: "no-session" };
    }

    const side = sideOf(craft, session.sessionId);

    if (!side) {
      return { ok: false, reason: "not-a-party" };
    }

    return this.lay(craft, side, add, itemId, quantity);
  }

  /** `EPO` — the customer offers an item in payment. */
  async movePayItem(
    session: ExchangeSession,
    add: boolean,
    itemId: string,
    quantity: number
  ): Promise<SecureCraftResult> {
    const craft = this.craftOf(session);

    if (!craft) {
      return { ok: false, reason: "no-session" };
    }

    if (session.sessionId !== craft.customer.sessionId) {
      return { ok: false, reason: "not-the-customer" };
    }

    // The payment pile has no grid: it is not a recipe.
    return this.layPayment(craft, add, itemId, quantity);
  }

  /**
   * `EPG` — the customer sets one of the two purses. Absolute, like a
   * trade's.
   *
   * `bonus` picks which: the fee, owed whatever the roll says, or the
   * premium, owed only on a success. Two amounts rather than one with a
   * flag, because the customer is deciding two different things — what the
   * artisan's time is worth and what the risk is worth — and a single
   * number cannot express "pay something either way, more if it works".
   */
  async movePayKamas(
    session: ExchangeSession,
    amount: bigint,
    bonus: boolean
  ): Promise<SecureCraftResult> {
    const craft = this.craftOf(session);

    if (!craft) {
      return { ok: false, reason: "no-session" };
    }

    if (session.sessionId !== craft.customer.sessionId) {
      return { ok: false, reason: "not-the-customer" };
    }

    if (amount < 0n) {
      return { ok: false, reason: "invalid-quantity" };
    }

    // Clamped to the purse rather than refused, which is what the canonical
    // client does on its side (`validateKama`). An offer of more than one
    // has is a slip, not an attack, and the commit would refuse it anyway.
    // What is left of the purse is measured against the *other* amount:
    // the two are paid together on a success, so a fee that fits only
    // because the premium is ignored does not fit.
    const purse = BigInt(
      (await this.players.findById(craft.customer.characterId))?.kamas ?? 0
    );
    const other = BigInt(bonus ? craft.payKamas : craft.payBonusKamas);
    const room = purse > other ? purse - other : 0n;
    const clamped = amount > room ? room : amount;

    if (bonus) {
      craft.payBonusKamas = String(clamped);
    } else {
      craft.payKamas = String(clamped);
    }

    this.frames.payKamas(this.sides(craft), clamped, bonus);
    this.unconfirm(craft);

    return { ok: true };
  }

  /**
   * `EK` — "Combiner". One player's confirmation, not the trigger.
   *
   * It sets the presser's own flag and broadcasts it; the craft runs when
   * the *second* one arrives. Pressing it again takes the confirmation
   * back, which is the only way out of a deal you have agreed to but the
   * other side has not.
   */
  async setReady(session: ExchangeSession): Promise<SecureCraftResult> {
    const craft = this.craftOf(session);

    if (!craft) {
      return { ok: false, reason: "no-session" };
    }

    const side = sideOf(craft, session.sessionId);

    if (!side) {
      return { ok: false, reason: "not-a-party" };
    }

    if (!craft.accepted) {
      return { ok: false, reason: "pending" };
    }

    const isArtisan = side.characterId === craft.artisan.characterId;
    const now = !(isArtisan ? craft.artisanReady : craft.customerReady);

    if (isArtisan) {
      craft.artisanReady = now;
    } else {
      craft.customerReady = now;
    }

    this.frames.ready(this.sides(craft), side.characterId, now);

    if (!(craft.customerReady && craft.artisanReady)) {
      return { ok: true };
    }

    const result = await this.resolve(craft);

    if (!result.ok) {
      // The deal survives a refusal — a missing tool or a bench that spells
      // no recipe is something the two can fix and try again — but neither
      // confirmation may stand over a craft that did not happen.
      this.unconfirm(craft);
    }

    return result;
  }

  /**
   * Both sides have confirmed: make it.
   *
   * The one asymmetry that matters: each party's ingredients leave their
   * own bag, the object goes to the customer, the experience to the
   * artisan, and the payment the other way. All of it is one transaction.
   */
  private async resolve(craft: SecureCraftState): Promise<SecureCraftResult> {
    // Re-checked here, not only at request time: a deal can sit on screen
    // for as long as the two like, and unequipping the tool in the meantime
    // is entirely ordinary.
    const ready = await this.artisanCan(
      craft.artisan.characterId,
      craft.skillId
    );

    if (!ready.ok) {
      return ready;
    }

    const matched = await this.matchRecipe(craft);

    if (!matched.ok) {
      return matched;
    }

    const recipe = matched.value;
    const context = {
      jobLevel: craft.jobLevel,
      skillId: craft.skillId,
      ingredientCount: recipe.ingredients.length,
    };

    if (!fitsInGrid(context)) {
      return { ok: false, reason: "recipe-too-large" };
    }

    const success = rollCraft(context, Math.random());
    const experience = craftExperience(context);

    const committed = await this.txHost.withTransaction(async () => {
      const byId = await this.benchRows(craft);

      for (const [itemId, slot] of Object.entries(craft.slots)) {
        const row = byId.get(itemId);

        // The owner too: a stack that changed hands since it was laid is
        // no longer the thing that was agreed to, and consuming it anyway
        // would take it out of whoever's bag it landed in.
        if (
          !row ||
          row.ownerId !== slot.characterId ||
          row.position >= 0 ||
          row.quantity < slot.quantity
        ) {
          return null;
        }
      }

      const consumed: { id: string; left: number; sessionId: string }[] = [];

      for (const [itemId, slot] of Object.entries(craft.slots)) {
        const row = byId.get(itemId) as ItemRow;
        const left = row.quantity - slot.quantity;

        if (left <= 0) {
          await this.inventory.deleteItem(itemId);
        } else {
          await this.inventory.updateQuantity(itemId, left);
        }

        consumed.push({
          id: itemId,
          left,
          // Whose window has to be told the stack shrank — the owner's,
          // which on a shared bench is not always the customer's.
          sessionId: sideById(craft, slot.characterId).sessionId,
        });
      }

      let produced: ItemRow | null = null;

      if (success) {
        const template = await this.inventory.findTemplate(recipe.resultItemId);

        if (!template) {
          return null;
        }

        // To the **customer**. This line is the mechanism.
        produced = await this.inventory.insertItem({
          playerId: craft.customer.characterId,
          templateId: recipe.resultItemId,
          quantity: 1,
          effects: rollItemEffects(template.effects),
        });
      }

      // To the **artisan**, and on a failure too — same rule as a solo
      // craft, and the reason an artisan will take a red recipe on.
      const gain = await this.jobs.addExperience(
        craft.artisan.characterId,
        craft.jobId,
        experience
      );

      const paid = await this.settle(craft, success);

      if (!paid) {
        return null;
      }

      return { consumed, produced, gain };
    });

    if (!committed) {
      return { ok: false, reason: "not-enough" };
    }

    for (const { id, left, sessionId } of committed.consumed) {
      if (left <= 0) {
        this.inventoryFrames.sendItemRemove(sessionId, id);
      } else {
        this.inventoryFrames.sendItemQuantity(sessionId, id, left);
      }
    }

    if (committed.produced) {
      this.inventoryFrames.sendItemAdd(
        craft.customer.sessionId,
        committed.produced
      );
    }

    // Everything on the table has moved, so nothing on the table is still
    // an offer. Both confirmations go with it: the next craft has to be
    // agreed to on its own terms.
    craft.slots = {};
    craft.payItems = {};
    craft.payKamas = "0";
    craft.payBonusKamas = "0";
    craft.customerReady = false;
    craft.artisanReady = false;
    craft.crafted++;

    for (const side of [craft.customer, craft.artisan]) {
      this.frames.craftResult(side.sessionId, success);
      await this.stats.sendStats(side.sessionId, sideCharacter(craft, side));
    }

    if (committed.gain) {
      await this.jobs.announceGain(
        craft.artisan.sessionId,
        craft.artisan.characterId,
        committed.gain
      );
    }

    return { ok: true };
  }

  /**
   * Close the deal for both sides.
   *
   * Nothing has moved that is not already committed, so this is a teardown
   * and never a rollback.
   */
  close(craft: SecureCraftState, completed: boolean): void {
    for (const side of [craft.customer, craft.artisan]) {
      this.exchanges.close(side.sessionId);

      if (this.sessions.get(side.sessionId)) {
        this.frames.leave(side.sessionId, completed);
      }
    }

    this.crafts.close(craft.craftId);
  }

  /** The artisan holds the job, its tool, and the skill is open to them. */
  private async artisanCan(
    characterId: string,
    skillId: number
  ): Promise<
    | { ok: true; jobId: number; level: number }
    | { ok: false; reason: SecureCraftDenial }
  > {
    await this.catalog.load();

    const skill = this.catalog.skill(skillId);

    if (!skill || skill.kind !== JobSkillKind.Craft) {
      return { ok: false, reason: "not-a-craft-skill" };
    }

    const held = await this.jobsRepo.findPlayerJob(characterId, skill.jobId);

    if (!held) {
      return { ok: false, reason: "no-job" };
    }

    if (!isSkillUnlocked(skillId, held.level)) {
      return { ok: false, reason: "skill-locked" };
    }

    const equipped = await this.inventory.findEquipped(characterId);
    const weapon = equipped.find((row) => row.position === WEAPON_POSITION);

    if (!weapon || !this.catalog.isToolOf(weapon.templateId, skill.jobId)) {
      return { ok: false, reason: "no-tool" };
    }

    return { ok: true, jobId: skill.jobId, level: held.level };
  }

  /**
   * Lay or take back one stack on the shared bench.
   *
   * The stack is looked up in **`by`'s own bag**, which is what stops a
   * player laying the other one's goods, and recorded against them, which
   * is what lets the commit take it back out of the right inventory.
   */
  private async lay(
    craft: SecureCraftState,
    by: SecureCraftSide,
    add: boolean,
    itemId: string,
    quantity: number
  ): Promise<SecureCraftResult> {
    const existing = craft.slots[itemId];

    // A stack somebody else laid is not yours to move, in either
    // direction — a "Retirer" that reached across the bench would let one
    // player empty the other's contribution.
    if (existing && existing.characterId !== by.characterId) {
      return { ok: false, reason: "not-a-party" };
    }

    const item = await this.inventory.findOwned(by.characterId, itemId);

    if (!item) {
      return { ok: false, reason: "not-found" };
    }

    if (!add) {
      delete craft.slots[itemId];
      this.frames.coopItem(this.sides(craft), by.characterId, false, item);
      this.unconfirm(craft);
      return { ok: true };
    }

    const checked = checkStack(item, quantity);

    if (!checked.ok) {
      return checked;
    }

    const wouldOccupy =
      existing === undefined
        ? Object.keys(craft.slots).length + 1
        : Object.keys(craft.slots).length;

    if (wouldOccupy > craft.maxSlots) {
      return { ok: false, reason: "no-slot-left" };
    }

    craft.slots[itemId] = { characterId: by.characterId, quantity };
    this.frames.coopItem(this.sides(craft), by.characterId, true, {
      ...item,
      quantity,
    });
    this.unconfirm(craft);

    return { ok: true };
  }

  /**
   * Lay or take back one stack on the payment pile.
   *
   * The customer's alone, and ungridded: a payment is not a recipe, so the
   * artisan's slot count has nothing to say about how many things may be
   * offered for the work.
   */
  private async layPayment(
    craft: SecureCraftState,
    add: boolean,
    itemId: string,
    quantity: number
  ): Promise<SecureCraftResult> {
    const item = await this.inventory.findOwned(
      craft.customer.characterId,
      itemId
    );

    if (!item) {
      return { ok: false, reason: "not-found" };
    }

    if (!add) {
      delete craft.payItems[itemId];
      this.frames.payItem(this.sides(craft), false, item);
      this.unconfirm(craft);
      return { ok: true };
    }

    const checked = checkStack(item, quantity);

    if (!checked.ok) {
      return checked;
    }

    craft.payItems[itemId] = quantity;
    this.frames.payItem(this.sides(craft), true, { ...item, quantity });
    this.unconfirm(craft);

    return { ok: true };
  }

  /**
   * Take back both confirmations.
   *
   * Called from every path that changes what is on the table. A "Combiner"
   * agrees to a *particular* set of ingredients and a particular price, and
   * letting it stand across a change is how a player ends up paying for
   * something other than what they looked at.
   */
  private unconfirm(craft: SecureCraftState): void {
    for (const side of [craft.customer, craft.artisan]) {
      const was =
        side.characterId === craft.artisan.characterId
          ? craft.artisanReady
          : craft.customerReady;

      if (!was) {
        continue;
      }

      if (side.characterId === craft.artisan.characterId) {
        craft.artisanReady = false;
      } else {
        craft.customerReady = false;
      }

      this.frames.ready(this.sides(craft), side.characterId, false);
    }
  }

  /** Both sockets, in the order every frame in this flow addresses them. */
  private sides(craft: SecureCraftState): readonly string[] {
    return [craft.customer.sessionId, craft.artisan.sessionId];
  }

  /**
   * Every row the bench names, from whichever bag it is still sitting in.
   *
   * One query per contributor rather than one per stack: the two are
   * usually the only two players involved, and reading a whole inventory
   * is what `findByPlayer` is for.
   */
  private async benchRows(
    craft: SecureCraftState
  ): Promise<Map<string, ItemRow>> {
    const owners = new Set(
      Object.values(craft.slots).map((slot) => slot.characterId)
    );
    const byId = new Map<string, ItemRow>();

    for (const characterId of owners) {
      for (const row of await this.inventory.findByPlayer(characterId)) {
        byId.set(row.id, row);
      }
    }

    return byId;
  }

  /**
   * Move the payment from the customer to the artisan.
   *
   * Goods and the fee are owed whatever the roll said — the artisan spent
   * the same skill and the same tool on a failure, and a payment
   * conditional on luck is not a payment. The premium is the part that is
   * conditional, and it is the only part `success` touches.
   */
  private async settle(
    craft: SecureCraftState,
    success: boolean
  ): Promise<boolean> {
    for (const [itemId, quantity] of Object.entries(craft.payItems)) {
      const result = await this.transfers.transfer({
        from: playerOwner(craft.customer.characterId),
        to: playerOwner(craft.artisan.characterId),
        itemId,
        quantity,
        actorCharacterId: craft.customer.characterId,
        exchangeKind: ExchangeType.EXCHANGE_SECURE_CRAFT_CLIENT,
        exchangeSessionId: craft.craftId,
      });

      if (!result.ok) {
        return false;
      }

      this.inventoryFrames.sendItemAdd(
        craft.artisan.sessionId,
        result.move.destination
      );
    }

    const amount =
      BigInt(craft.payKamas) + (success ? BigInt(craft.payBonusKamas) : 0n);

    if (amount > 0n) {
      const result = await this.kamas.transfer({
        from: playerOwner(craft.customer.characterId),
        to: playerOwner(craft.artisan.characterId),
        amount,
        actorCharacterId: craft.customer.characterId,
        exchangeKind: ExchangeType.EXCHANGE_SECURE_CRAFT_CLIENT,
        exchangeSessionId: craft.craftId,
      });

      if (!result.ok) {
        return false;
      }
    }

    return true;
  }

  /** Which recipe the customer has laid out; the same rule as a solo bench. */
  private async matchRecipe(
    craft: SecureCraftState
  ): Promise<
    { ok: true; value: Recipe } | { ok: false; reason: SecureCraftDenial }
  > {
    const laid = Object.entries(craft.slots);

    if (laid.length === 0) {
      return { ok: false, reason: "empty-bench" };
    }

    const byId = await this.benchRows(craft);
    const onBench = new Map<number, number>();

    // Summed by **template**, across both contributors: two players each
    // laying five Ash Wood have laid ten, and a recipe asking for ten is
    // satisfied. That is the whole reason to craft co-operatively.
    for (const [itemId, slot] of laid) {
      const row = byId.get(itemId);

      if (!row) {
        return { ok: false, reason: "not-found" };
      }

      onBench.set(
        row.templateId,
        (onBench.get(row.templateId) ?? 0) + slot.quantity
      );
    }

    for (const recipe of await this.recipes.findBySkill(craft.skillId)) {
      if (recipe.ingredients.length !== onBench.size) {
        continue;
      }

      const matches = recipe.ingredients.every(
        (ingredient) => onBench.get(ingredient.itemId) === ingredient.quantity
      );

      if (matches) {
        return { ok: true, value: recipe };
      }
    }

    return { ok: false, reason: "no-such-recipe" };
  }

  private accountOf(sessionId: string): string {
    return this.sessions.get(sessionId)?.accountId ?? "";
  }
}

function sideCharacter(
  craft: SecureCraftState,
  side: { sessionId: string }
): string {
  return side.sessionId === craft.artisan.sessionId
    ? craft.artisan.characterId
    : craft.customer.characterId;
}

/** Which party this socket is, or `undefined` if it is neither. */
function sideOf(
  craft: SecureCraftState,
  sessionId: string
): SecureCraftSide | undefined {
  if (sessionId === craft.artisan.sessionId) {
    return craft.artisan;
  }

  return sessionId === craft.customer.sessionId ? craft.customer : undefined;
}

/** The same, by character id. Both are always one of the two. */
function sideById(
  craft: SecureCraftState,
  characterId: string
): SecureCraftSide {
  return characterId === craft.artisan.characterId
    ? craft.artisan
    : craft.customer;
}

/** The three things that make a stack layable, in one place. */
function checkStack(
  item: ItemRow,
  quantity: number
): { ok: true } | { ok: false; reason: SecureCraftDenial } {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, reason: "invalid-quantity" };
  }

  if (item.position >= 0) {
    return { ok: false, reason: "equipped" };
  }

  if (quantity > item.quantity) {
    return { ok: false, reason: "not-enough" };
  }

  return { ok: true };
}
