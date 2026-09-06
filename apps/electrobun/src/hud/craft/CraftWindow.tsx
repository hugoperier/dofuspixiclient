import { useEffect, useState, useSyncExternalStore } from "react";

import type { GameClient } from "@/game/game-client";
import type { CraftsLang } from "@/game/lang/crafts-lang";
import type { ItemData } from "@/game/network/protocol";
import { loadCraftsLang, matchCraftRecipe } from "@/game/lang/crafts-lang";
import { type JobsLang, loadJobsLang } from "@/game/lang/jobs-lang";
import { characterStore } from "@/game/stores/character-store";
import { craftStore } from "@/game/stores/craft-store";
import { getBagItems, inventoryStore } from "@/game/stores/inventory-store";

import { Panel } from "../components/Panel";
import {
  BagBrowser,
  BenchSlots,
  CraftButton,
  ObtainedBox,
  outcomeColor,
  ResetGlyph,
  SkillBanner,
} from "./craft-parts";
import {
  CRAFT_BENCH,
  CRAFT_COLUMN,
  CRAFT_LAYOUT,
  CRAFT_OBTAINED,
  CRAFT_QUANTITIES,
  CRAFT_RECIPES,
} from "./craft-theme";
import { RecipeBookPanel } from "./RecipeBookPanel";

/**
 * The workbench — exchange type 3.
 *
 * Server-driven like the bank: it opens on `EC` and closes on `EV`, so it
 * sits outside the `activePanel` rotation and opening it must not close
 * the inventory.
 *
 * Laid out after `screenshot-ui/craft_menu.png`, which is four separate
 * pieces rather than one window: the skill caption, the bag window, the
 * bench strip with its button row, and the "Objet obtenu" box facing them
 * from the far side of the play area. `craft-theme.ts` carries the
 * measurements and how they were taken.
 *
 * The bench is not a container. Nothing laid there has left the bag — the
 * server holds it in memory and moves rows only when the craft commits —
 * which is why both the grid and the strip can be drawn from the live
 * inventory store without either of them lying.
 */
export function CraftWindow({
  zoom,
  gameClient,
  playArea,
}: {
  zoom: number;
  gameClient: GameClient | null;
  playArea: { width: number; height: number };
}) {
  const craft = useSyncExternalStore(
    craftStore.subscribe,
    craftStore.getSnapshot
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
  const [quantityIndex, setQuantityIndex] = useState(0);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [craftsLang, setCraftsLang] = useState<CraftsLang | null>(null);
  const [jobsLang, setJobsLang] = useState<JobsLang | null>(null);

  useEffect(() => {
    void loadCraftsLang().then(setCraftsLang);
    void loadJobsLang().then(setJobsLang);
  }, []);

  const laid = [...craft.slots.values()];
  const recipe = matchCraftRecipe(
    jobsLang?.skills.get(craft.skillId)?.craftItemIds ?? [],
    laid,
    craftsLang?.recipes ?? null
  );

  // Kept so the result box still shows what came out after a craft: the
  // server empties the bench on every attempt, so by the time `Ec` says
  // "réussie" there is nothing left to match a recipe against.
  const [lastResultItemId, setLastResultItemId] = useState<number | null>(null);
  const matchedResultId = recipe?.resultItemId ?? null;
  useEffect(() => {
    if (matchedResultId !== null) {
      setLastResultItemId(matchedResultId);
    }
  }, [matchedResultId]);

  if (!craft.open) {
    return null;
  }

  const p = (n: number) => Math.round(n * zoom);
  const skill = jobsLang?.skills.get(craft.skillId);
  const skillName = skill?.label ?? "Atelier";

  /** How much of a stack is already laid on the bench. */
  const laidFrom = (unicId: number) => craft.slots.get(unicId)?.quantity ?? 0;

  /**
   * The strip shows what is **left** of each stack, not the whole of it and
   * not nothing at all.
   *
   * It used to drop a stack from the strip the moment any part of it was
   * laid, which left the player with no way to come back for a second
   * "Poser 10" — the other half of QA-152. A stack is only gone from the
   * bag once all of it is on the bench.
   */
  const bag = getBagItems(inventory)
    .map((item) => ({
      ...item,
      quantity: item.quantity - laidFrom(item.unicId),
    }))
    .filter((item) => item.quantity > 0);

  const full = craft.slots.size >= craft.maxSlots;
  const running = craft.seriesRemaining > 0;
  const quantity = CRAFT_QUANTITIES[quantityIndex] ?? 1;

  /**
   * Lay `amount` more of a stack — `item.quantity` is what is left of it.
   *
   * `EMO` carries the slot's **absolute** total, not a delta:
   * `CraftFlow.moveItem` writes `bench.slots[itemId] = quantity`. Sending
   * the increment made a second "Poser 10" rewrite 10 over 10, so every
   * recipe asking for more than ten of one ingredient was unreachable as
   * soon as the player held more than the recipe wanted — 820 of the 2 296
   * (QA-152). What goes on the fil is therefore the new total.
   */
  const lay = (item: ItemData, amount: number) => {
    const already = laidFrom(item.unicId);
    const added = Math.min(amount, item.quantity);

    if (added <= 0) {
      return;
    }

    gameClient?.exchangeMoveItem(item.unicId, true, already + added);
  };

  // A full bench still accepts more of a stack it already holds: that
  // takes no new slot, and the server's own `wouldOccupy` says the same.
  const fitsOn = (item: ItemData) => !full || laidFrom(item.unicId) > 0;

  const bagActions = [
    {
      label: "Poser",
      enabled: (item: ItemData) => fitsOn(item),
      run: (item: ItemData) => lay(item, 1),
    },
    {
      label: "Poser 10",
      enabled: (item: ItemData) => fitsOn(item) && item.quantity > 1,
      run: (item: ItemData) => lay(item, 10),
    },
    {
      label: "Tout poser",
      enabled: (item: ItemData) => fitsOn(item) && item.quantity > 1,
      run: (item: ItemData) => lay(item, item.quantity),
    },
  ];

  const combine = () => {
    if (running) {
      gameClient?.stopCraftSeries();
    } else if (quantity <= 1) {
      gameClient?.craftOnce();
    } else {
      gameClient?.craftSeries(quantity);
    }
  };

  const clearBench = () => {
    for (const item of laid) {
      gameClient?.exchangeMoveItem(item.unicId, false, 0);
    }
  };

  // `playArea` arrives in canvas pixels, like the trade window's; every
  // measurement in `craft-theme` is in base units, so the one place the two
  // meet is the recipe book's height, which `Panel` wants in base units.
  const playHeightBase = playArea.height / Math.max(zoom, 0.01);
  // The result box sits level with the bench strip, which puts its bottom
  // edge exactly one button row above the column's.
  const obtainedBottom = CRAFT_LAYOUT.edge + CRAFT_BENCH.buttons.height;
  const recipesHeight = Math.max(
    140,
    playHeightBase -
      CRAFT_RECIPES.top -
      obtainedBottom -
      CRAFT_OBTAINED.box.height -
      CRAFT_LAYOUT.edge
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

      <ObtainedBox
        zoom={zoom}
        position={{
          left: p(CRAFT_LAYOUT.leftEdge),
          bottom: p(obtainedBottom),
        }}
        resultItemId={matchedResultId ?? lastResultItemId}
        lang={craftsLang}
        outcome={outcomeLabel(craft)}
        outcomeTone={outcomeColor(craft.outcome)}
      />

      {/* Pinned to the bottom-right corner and stacking upward, so the
          bench strip keeps its place whatever the play area's height. */}
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
            laid={laid}
            maxSlots={craft.maxSlots}
            iconOf={(item) => inventory.templates.get(item.itemId)}
            onRemove={(item) =>
              gameClient?.exchangeMoveItem(item.unicId, false, 0)
            }
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
            width={CRAFT_BENCH.buttons.recipes}
            tone="dark"
            label="Recettes"
            pressed={recipesOpen}
            onClick={() => setRecipesOpen((open) => !open)}
          />
          <CraftButton
            zoom={zoom}
            width={CRAFT_BENCH.buttons.quantity}
            tone="orange"
            label={`Qté : ${quantity}`}
            title="Nombre de fabrications enchaînées"
            disabled={running}
            onClick={() =>
              setQuantityIndex((i) => (i + 1) % CRAFT_QUANTITIES.length)
            }
          />
          <CraftButton
            zoom={zoom}
            width={CRAFT_BENCH.buttons.clear}
            tone="orange"
            title="Vider l'atelier"
            disabled={running || craft.slots.size === 0}
            onClick={clearBench}
          >
            <ResetGlyph zoom={zoom} />
          </CraftButton>
          <CraftButton
            zoom={zoom}
            width={CRAFT_BENCH.buttons.combine}
            tone="orange"
            label={running ? "Arrêter" : "Combiner"}
            disabled={!running && craft.slots.size === 0}
            onClick={combine}
          />
        </div>
      </div>
    </div>
  );
}

function outcomeLabel(craft: {
  outcome: string;
  seriesRemaining: number;
  seriesCrafted: number;
}): string {
  if (craft.seriesRemaining > 0) {
    return `En série — ${craft.seriesRemaining} restantes`;
  }

  if (craft.seriesCrafted > 0) {
    return `Série terminée — ${craft.seriesCrafted} fabriqués`;
  }

  if (craft.outcome === "success") {
    return "Fabrication réussie.";
  }

  if (craft.outcome === "failure") {
    // Worth saying out loud, because the ingredients are gone either way.
    return "Échec — ingrédients perdus.";
  }

  return "";
}
