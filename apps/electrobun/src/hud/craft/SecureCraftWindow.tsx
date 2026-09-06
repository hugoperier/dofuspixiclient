import { useEffect, useState, useSyncExternalStore } from "react";

import type { GameClient } from "@/game/game-client";
import type { CraftsLang } from "@/game/lang/crafts-lang";
import type { ItemData } from "@/game/network/protocol";
import { loadCraftsLang, matchCraftRecipe } from "@/game/lang/crafts-lang";
import { type JobsLang, loadJobsLang } from "@/game/lang/jobs-lang";
import { characterStore } from "@/game/stores/character-store";
import { setChatDraft } from "@/game/stores/chat-store";
import { getBagItems, inventoryStore } from "@/game/stores/inventory-store";
import { secureCraftStore } from "@/game/stores/secure-craft-store";

import { Panel } from "../components/Panel";
import {
  BagBrowser,
  BenchSlots,
  CraftButton,
  type CraftCellAction,
  type CraftIcon,
  ObtainedBox,
  outcomeColor,
  ResetGlyph,
  SkillBanner,
} from "./craft-parts";
import {
  COOP_NATURAL,
  CRAFT_BENCH,
  CRAFT_COLORS,
  CRAFT_COLUMN,
  CRAFT_LAYOUT,
  CRAFT_RECIPES,
} from "./craft-theme";
import { RecipeBookPanel } from "./RecipeBookPanel";

const C = CRAFT_COLORS;

/**
 * The button rows under the two strips, in the capture's order.
 *
 * The solo bench has one row of four; this one has two of two and three,
 * because the two halves of the window do different things — the left
 * strip is somebody else's contribution and carries the deal's controls,
 * the right one is yours and carries the bench's.
 */
const COOP_BUTTONS = {
  payment: 92,
  whisper: 112,
  recipes: 92,
  clear: 32,
  combine: 102,
} as const;

/**
 * `Panel`'s title bar height, in base units — hardcoded there, so it is
 * hardcoded here too. Anything placed against a titled panel's padding box
 * has to clear it.
 */
const TITLE_BAR = 22;

/** The payment panel, opened by "Paiement". */
const PAYMENT = { width: 230, height: 210 } as const;

/**
 * Crafting with somebody else — exchange types 12 and 13.
 *
 * One window for both ends, and drawn **relative to the reader**: your bag
 * top-right, your contribution bottom-right, theirs bottom-left under
 * their name, whichever end of the deal you are standing at. Nothing here
 * asks whether you are the customer or the artisan in order to decide
 * where something goes — the store hands over `mine` and `theirs` already
 * resolved, and the only two places the role is consulted are the ones
 * where it is genuinely the rule: the payment is the customer's to set,
 * and the object is theirs to receive.
 *
 * Laid out after the same capture the solo bench is, plus this one's:
 * the skill caption on top, the bag window under it, a contribution strip
 * per player along the bottom, and "Objet obtenu" between them. It shares
 * every piece with `CraftWindow` through `craft-parts.tsx`, so the two
 * benches cannot drift apart visually.
 *
 * Neither strip is a container. Nothing laid there has left anybody's bag
 * — the server holds both piles in memory and moves rows only when the
 * second "Combiner" lands — which is why the bag can be drawn live.
 */
export function SecureCraftWindow({
  zoom: baseZoom,
  gameClient,
  playArea,
}: {
  zoom: number;
  gameClient: GameClient | null;
  playArea: { width: number; height: number };
}) {
  /**
   * The whole assembly's scale, not the HUD's.
   *
   * `baseZoom` says how big *one* 1.29 window should look, which is the
   * right answer for every other panel and the wrong one here: this
   * window is three pieces side by side across the play area, and at
   * `baseZoom` on an ordinary viewport they come to more than fits — the
   * columns meet in the middle and the result box ends up under one of
   * them. Dividing the play area by the assembly's natural size gives a
   * factor that makes it fit, and taking the **min** with `baseZoom`
   * means a large window still draws at the HUD's own scale rather than
   * being blown up to fill it.
   *
   * One uniform factor, so every proportion inside is preserved.
   */
  const zoom = Math.min(
    baseZoom,
    playArea.width / COOP_NATURAL.width,
    playArea.height / COOP_NATURAL.height
  );

  const craft = useSyncExternalStore(
    secureCraftStore.subscribe,
    secureCraftStore.getSnapshot
  );
  const inventory = useSyncExternalStore(
    inventoryStore.subscribe,
    inventoryStore.getSnapshot
  );
  const { name: characterName } = useSyncExternalStore(
    characterStore.subscribe,
    characterStore.getSnapshot
  );

  const [selected, setSelected] = useState<number | null>(null);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [craftsLang, setCraftsLang] = useState<CraftsLang | null>(null);
  const [jobsLang, setJobsLang] = useState<JobsLang | null>(null);

  useEffect(() => {
    void loadCraftsLang().then(setCraftsLang);
    void loadJobsLang().then(setJobsLang);
  }, []);

  const mine = [...craft.mine.values()];
  const theirs = [...craft.theirs.values()];
  const skill = jobsLang?.skills.get(craft.skillId);

  /**
   * The preview, matched over **both** contributions.
   *
   * Client-side, like the solo bench's: the recipe set is `SK[skill].cl`
   * out of the lang bundle and every ingredient on the bench arrives in
   * full on `Er`, so nothing about the answer needs a round trip. It
   * therefore updates on the same frame that changes the pile, which is
   * what "mettre à jour le preview immédiatement" asks for.
   */
  const recipe = matchCraftRecipe(
    skill?.craftItemIds ?? [],
    [...mine, ...theirs],
    craftsLang?.recipes ?? null
  );

  // Kept so the box still shows what came out after a craft: the server
  // empties both piles on every attempt, so by the time `Ec` says
  // "réussie" there is nothing left to match a recipe against.
  const [lastResultItemId, setLastResultItemId] = useState<number | null>(null);
  const matchedResultId = recipe?.resultItemId ?? null;
  useEffect(() => {
    if (matchedResultId !== null) {
      setLastResultItemId(matchedResultId);
    }
  }, [matchedResultId]);

  // Both panels are transient state of *this* deal, not of the session.
  useEffect(() => {
    if (!craft.open) {
      setRecipesOpen(false);
      setPaymentOpen(false);
    }
  }, [craft.open]);

  if (!craft.open) {
    return null;
  }

  const p = (n: number) => Math.round(n * zoom);
  const isCustomer = craft.role === "customer";
  const skillName = skill?.label ?? "Atelier";
  const partner = craft.partnerName || "L'autre joueur";

  /**
   * How a stack is drawn, wherever it came from.
   *
   * The partner's ingredients are the reason this is not a plain lookup in
   * `inventory.templates`: that map only ever holds what *this* character
   * carries, and half the bench belongs to somebody else. The lang bundle
   * knows every item in the game, so it is the fallback.
   */
  const iconOf = (item: ItemData): CraftIcon | undefined =>
    inventory.templates.get(item.itemId) ?? craftsLang?.items.get(item.itemId);

  /**
   * How much of a stack is already committed — to the bench or to the
   * payment. Both come out of the same bag, so the strip has to net them
   * off together or a stack half-laid and half-offered would read as
   * still available twice over.
   */
  const committed = (unicId: number) =>
    (craft.mine.get(unicId)?.quantity ?? 0) +
    (craft.payItems.get(unicId)?.quantity ?? 0);

  const bag = getBagItems(inventory)
    .map((item) => ({
      ...item,
      quantity: item.quantity - committed(item.unicId),
    }))
    .filter((item) => item.quantity > 0);

  const full = craft.mine.size + craft.theirs.size >= craft.maxSlots;
  // A full bench still accepts more of a stack it already holds: that
  // takes no new slot, and the server's own `wouldOccupy` says the same.
  const fitsOn = (item: ItemData) =>
    !full || (craft.mine.get(item.unicId)?.quantity ?? 0) > 0;

  /**
   * Lay `amount` more of a stack — `item.quantity` is what is left of it.
   *
   * `EMO` carries the slot's **absolute** total, not a delta, exactly as
   * at the solo bench (QA-152): sending the increment makes a second
   * "Poser 10" rewrite 10 over 10.
   */
  const lay = (item: ItemData, amount: number) => {
    const already = craft.mine.get(item.unicId)?.quantity ?? 0;
    const added = Math.min(amount, item.quantity);

    if (added > 0) {
      gameClient?.exchangeMoveItem(item.unicId, true, already + added);
    }
  };

  const bagActions: CraftCellAction[] = [
    {
      label: "Poser",
      enabled: (item) => fitsOn(item),
      run: (item) => lay(item, 1),
    },
    {
      label: "Poser 10",
      enabled: (item) => fitsOn(item) && item.quantity > 1,
      run: (item) => lay(item, 10),
    },
    {
      label: "Tout poser",
      enabled: (item) => fitsOn(item) && item.quantity > 1,
      run: (item) => lay(item, item.quantity),
    },
    {
      // The customer's alone: the payment is what is offered *for* the
      // work, and an artisan paying themselves is not a gesture.
      label: "Offrir en paiement",
      enabled: () => isCustomer,
      run: (item) =>
        gameClient?.movePayItem(
          item.unicId,
          true,
          (craft.payItems.get(item.unicId)?.quantity ?? 0) + item.quantity
        ),
    },
  ];

  const clearMine = () => {
    for (const item of mine) {
      gameClient?.exchangeMoveItem(item.unicId, false, 0);
    }
  };

  /**
   * The one line the window has for saying where the deal stands.
   *
   * A confirmation nobody can see is the failure this replaces: "Combiner"
   * that lights only your own button leaves the other player looking at an
   * unchanged screen, wondering whether they pressed it.
   */
  const status = () => {
    if (craft.outcome === "success") {
      return "Fabrication réussie.";
    }

    if (craft.outcome === "failure") {
      return "Échec — ingrédients perdus.";
    }

    if (craft.myReady && craft.theirReady) {
      return "Fabrication…";
    }

    if (craft.myReady) {
      return `En attente de ${partner}…`;
    }

    if (craft.theirReady) {
      return `${partner} a confirmé.`;
    }

    return recipe ? recipe.resultName : "";
  };

  // `playArea` arrives in canvas pixels; every measurement here is in base
  // units, so the two meet only where a panel wants a height.
  const playHeightBase = playArea.height / Math.max(zoom, 0.01);
  const stripBottom = CRAFT_LAYOUT.edge + CRAFT_BENCH.buttons.height;
  const recipesHeight = Math.max(
    140,
    playHeightBase - CRAFT_RECIPES.top - stripBottom - CRAFT_BENCH.height - 12
  );

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: playArea.width,
        height: playArea.height,
        pointerEvents: "none",
      }}
    >
      {recipesOpen && (
        <RecipeBookPanel
          zoom={zoom}
          skillName={skillName}
          craftItemIds={skill?.craftItemIds ?? []}
          lang={craftsLang}
          maxSlots={craft.maxSlots}
          left={CRAFT_LAYOUT.leftEdge}
          top={CRAFT_RECIPES.top}
          height={recipesHeight}
          onClose={() => setRecipesOpen(false)}
        />
      )}

      {paymentOpen && (
        <PaymentPanel
          zoom={zoom}
          gameClient={gameClient}
          craft={craft}
          iconOf={iconOf}
          editable={isCustomer}
          left={CRAFT_LAYOUT.leftEdge}
          bottom={stripBottom + CRAFT_BENCH.height + 12}
          onClose={() => setPaymentOpen(false)}
        />
      )}

      {/* The partner's half, bottom-left: their contribution, and the two
          controls that are about the deal rather than the bench. */}
      <div
        style={{
          position: "absolute",
          left: p(CRAFT_LAYOUT.edge),
          bottom: p(CRAFT_LAYOUT.edge),
          width: p(CRAFT_COLUMN.width),
        }}
      >
        <Panel
          title={partner}
          width={CRAFT_COLUMN.width}
          height={CRAFT_BENCH.height + 22}
          zoom={zoom}
          floating
          style={{ pointerEvents: "auto" }}
        >
          <BenchSlots
            zoom={zoom}
            laid={theirs}
            maxSlots={craft.maxSlots}
            iconOf={iconOf}
            align="left"
            showNextSlot={false}
            top={TITLE_BAR + CRAFT_BENCH.slot.top}
          />
        </Panel>

        <div
          style={{
            display: "flex",
            marginLeft: p(CRAFT_BENCH.buttons.x),
            pointerEvents: "auto",
          }}
        >
          <CraftButton
            zoom={zoom}
            width={COOP_BUTTONS.payment}
            tone="orange"
            label="Paiement"
            title={
              isCustomer
                ? "Ce que vous offrez pour le travail"
                : "Ce qui vous est offert pour le travail"
            }
            pressed={paymentOpen}
            onClick={() => setPaymentOpen((open) => !open)}
          />
          <CraftButton
            zoom={zoom}
            width={COOP_BUTTONS.whisper}
            tone="orange"
            label="Message privé"
            title={`Écrire à ${partner}`}
            disabled={!craft.partnerName}
            onClick={() => setChatDraft(`/w ${craft.partnerName} `)}
          />
        </div>
      </div>

      {/* Your half, bottom-right: the bag, your contribution, and the
          bench's own controls — the same column the solo bench has. */}
      <div
        style={{
          position: "absolute",
          right: p(CRAFT_LAYOUT.edge),
          bottom: p(CRAFT_LAYOUT.edge),
          width: p(CRAFT_COLUMN.width),
        }}
      >
        <SkillBanner zoom={zoom} skillName={skillName} />

        <div style={{ height: p(CRAFT_COLUMN.bannerGap) }} />

        <Panel
          title={characterName || "Atelier"}
          width={CRAFT_COLUMN.width}
          height={CRAFT_COLUMN.windowHeight}
          zoom={zoom}
          floating
          onClose={() => gameClient?.exchangeLeave()}
          style={{ pointerEvents: "auto" }}
        >
          <BagBrowser
            zoom={zoom}
            items={bag}
            templates={inventory.templates}
            weight={inventory.weight}
            selectedUnicId={selected}
            onSelect={(item) => setSelected(item.unicId)}
            actions={bagActions}
          />
        </Panel>

        <div style={{ height: p(CRAFT_COLUMN.benchGap) }} />

        <Panel
          title=""
          showTitleBar={false}
          width={CRAFT_COLUMN.width}
          height={CRAFT_BENCH.height}
          zoom={zoom}
          floating
          style={{ pointerEvents: "auto" }}
        >
          <BenchSlots
            zoom={zoom}
            laid={mine}
            maxSlots={craft.maxSlots}
            iconOf={iconOf}
            onRemove={(item) =>
              gameClient?.exchangeMoveItem(item.unicId, false, 0)
            }
          />
        </Panel>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginRight: p(CRAFT_BENCH.slot.rightMargin),
            pointerEvents: "auto",
          }}
        >
          <CraftButton
            zoom={zoom}
            width={COOP_BUTTONS.recipes}
            tone="dark"
            label="Recettes"
            pressed={recipesOpen}
            onClick={() => setRecipesOpen((open) => !open)}
          />
          <CraftButton
            zoom={zoom}
            width={COOP_BUTTONS.clear}
            tone="orange"
            title="Retirer ce que vous avez posé"
            disabled={mine.length === 0}
            onClick={clearMine}
          >
            <ResetGlyph zoom={zoom} />
          </CraftButton>
          {/*
            A confirmation, not a trigger: the craft runs when the second
            one arrives, and pressing it again takes yours back. `pressed`
            is therefore the state and not a click animation.
          */}
          <CraftButton
            zoom={zoom}
            width={COOP_BUTTONS.combine}
            tone="orange"
            label={craft.myReady ? "Annuler" : "Combiner"}
            title={
              craft.myReady
                ? "Retirer votre confirmation"
                : "Confirmer — la fabrication part quand vous avez confirmé tous les deux"
            }
            pressed={craft.myReady}
            disabled={craft.mine.size + craft.theirs.size === 0}
            onClick={() => gameClient?.toggleSecureCraftReady()}
          />
        </div>
      </div>
      {/* "Objet obtenu", centred along the bottom edge between the two
          contributions, where the capture puts it. `COOP_NATURAL.width`
          reserves the gap it sits in, so it normally touches neither
          column; it is still drawn **last** so that if anything ever does
          squeeze it — a viewport shorter than it is wide, where height
          picks the scale — it stays readable instead of disappearing
          under the left panel. */}
      <ObtainedBox
        zoom={zoom}
        position={{
          left: "50%",
          bottom: p(CRAFT_LAYOUT.edge),
          transform: "translateX(-50%)",
        }}
        resultItemId={matchedResultId ?? lastResultItemId}
        lang={craftsLang}
        outcome={status()}
        outcomeTone={outcomeColor(craft.outcome)}
        arrow={false}
      />
    </div>
  );
}

/**
 * "Paiement" — what is offered for the work, kept away from the recipe.
 *
 * Two purses rather than one: a fee owed whatever the roll says, and a
 * premium owed only on a success. That is the distinction the mechanism
 * exists for — an artisan will not take a red recipe on for nothing, and a
 * customer will not pay full price for a pile of ash — and one field
 * cannot express it.
 *
 * The artisan sees the same panel with the controls gone. Reading the
 * terms is not the customer's privilege; setting them is.
 */
function PaymentPanel({
  zoom,
  gameClient,
  craft,
  iconOf,
  editable,
  left,
  bottom,
  onClose,
}: {
  zoom: number;
  gameClient: GameClient | null;
  craft: {
    payItems: Map<number, ItemData>;
    payKamas: number;
    payBonusKamas: number;
  };
  iconOf: (item: ItemData) => CraftIcon | undefined;
  editable: boolean;
  left: number;
  bottom: number;
  onClose: () => void;
}) {
  const p = (n: number) => Math.round(n * zoom);
  const offered = [...craft.payItems.values()];

  return (
    <div
      style={{
        position: "absolute",
        left: p(left),
        bottom: p(bottom),
        pointerEvents: "auto",
      }}
    >
      <Panel
        title="Paiement"
        width={PAYMENT.width}
        height={PAYMENT.height}
        zoom={zoom}
        floating
        onClose={onClose}
      >
        <div
          style={{
            position: "absolute",
            left: p(10),
            top: p(30),
            width: p(PAYMENT.width - 20),
            display: "flex",
            flexDirection: "column",
            gap: p(8),
            fontFamily: "Verdana, sans-serif",
            fontSize: p(9),
            color: C.text,
          }}
        >
          <KamaField
            zoom={zoom}
            label="Garanti"
            hint="Versé même si la fabrication échoue"
            value={craft.payKamas}
            editable={editable}
            onSet={(amount) => gameClient?.movePayKamas(amount, false)}
          />
          <KamaField
            zoom={zoom}
            label="Prime de réussite"
            hint="Versé en plus, seulement si l'objet sort"
            value={craft.payBonusKamas}
            editable={editable}
            onSet={(amount) => gameClient?.movePayKamas(amount, true)}
          />

          <div style={{ marginTop: p(2) }}>Objets offerts</div>
        </div>

        <div
          style={{
            position: "absolute",
            left: p(10),
            top: p(PAYMENT.height - 52),
            display: "flex",
          }}
        >
          <BenchSlots
            zoom={zoom}
            laid={offered}
            maxSlots={Math.max(5, offered.length)}
            top={0}
            iconOf={iconOf}
            align="left"
            showNextSlot={false}
            {...(editable
              ? {
                  onRemove: (item: ItemData) =>
                    gameClient?.movePayItem(item.unicId, false, 0),
                }
              : {})}
          />
        </div>
      </Panel>
    </div>
  );
}

/** One purse: what stands now, and — for the customer — a way to change it. */
function KamaField({
  zoom,
  label,
  hint,
  value,
  editable,
  onSet,
}: {
  zoom: number;
  label: string;
  hint: string;
  value: number;
  editable: boolean;
  onSet: (amount: number) => void;
}) {
  const p = (n: number) => Math.round(n * zoom);
  const [draft, setDraft] = useState("");

  return (
    <div title={hint}>
      <div style={{ fontWeight: "bold" }}>
        {label} : {value} K
      </div>

      {editable && (
        <div style={{ display: "flex", gap: p(4), marginTop: p(3) }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
            placeholder="0"
            aria-label={`${label} en kamas`}
            style={{ flex: 1, minWidth: 0, fontSize: p(9) }}
          />
          <CraftButton
            zoom={zoom}
            width={48}
            tone="orange"
            label="Offrir"
            onClick={() => {
              onSet(Number.parseInt(draft, 10) || 0);
              setDraft("");
            }}
          />
        </div>
      )}
    </div>
  );
}
