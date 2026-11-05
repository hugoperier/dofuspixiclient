import { Tooltip } from "@base-ui/react/tooltip";
import { EquipmentPosition } from "@dofus/protocol";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

import {
  MainBanner,
  MainBannerButtons,
  MainBannerCircle,
  MainBannerGrid,
  MainBannerGridSlot,
  MainBannerHeart,
  MainBannerIconButton,
  MainBannerMorePanel,
  MainBannerRightPanel,
  MainBannerForfeitButton,
  MainBannerTurnButton,
} from "@/components/ui/main-banner";
import { playAudioEvent } from "@/game/audio/audio-events";
import { useSpellCast } from "@/game/machines/spell-cast-selectors";
import { togglePanel, toggleWorldMap } from "@/game/stores";
import { characterStore } from "@/game/stores/character-store";
import { showContextMenu } from "@/game/stores/context-menu-store";
import { getEquippedAt, inventoryStore } from "@/game/stores/inventory-store";
import {
  HOTBAR_PAGES,
  HOTBAR_SLOTS_PER_PAGE,
  type HotbarTab,
  type ResolvedShortcut,
  resolveShortcut,
  setHotbarTab,
  shortcutsStore,
  slotAt,
  stepHotbarPage,
} from "@/game/stores/shortcuts-store";
import {
  CLOSE_COMBAT_SPELL_ID,
  type SpellEntry,
  spellAtSlot,
  spellsStore,
} from "@/game/stores/spells-store";
import {
  dropOnSlot,
  removeFromSlot,
  triggerSlot,
} from "@/hud/banner/hotbar-actions";
import {
  type HotbarDragPayload,
  hotbarDragAllowed,
  hotbarDragProps,
  hotbarDropProps,
} from "@/hud/banner/hotbar-dnd";
import { BannerChatContainer } from "@/hud/chat/BannerChatContainer";
import { useGameClient } from "@/hud/contexts/GameClientContext";
import { useFightClock } from "@/hud/fight/useFightClock";
import { useFightMode } from "@/hud/fight/useFightMode";
import { ItemIcon } from "@/hud/inventory/ItemIcon";
import { SpellIconMount } from "@/hud/spells/SpellIconMount";

import { Minimap } from "../minimap/Minimap";
import { BannerFightPoints } from "./BannerFightPoints";
import { BannerFightPortrait } from "./BannerFightPortrait";

/** Keep clock ticks local to the dial so they do not rerender every spell. */
function BannerCircle() {
  const fight = useFightMode();
  const character = useSyncExternalStore(
    characterStore.subscribe,
    characterStore.getSnapshot
  );
  const { seconds, remainingFraction } = useFightClock(
    fight.turnDurationMs > 0 ? fight.deadline : 0,
    fight.turnDurationMs
  );
  const countdown =
    fight.isMyTurn && !fight.finishing && seconds >= 1 && seconds <= 5
      ? seconds
      : undefined;
  const lastTick = useRef("");
  useEffect(() => {
    const key = `${fight.deadline}:${countdown}`;
    if (countdown !== undefined && lastTick.current !== key) {
      lastTick.current = key;
      playAudioEvent("timer");
    }
  }, [fight.deadline, countdown]);
  // Retro fills the ring with elapsed time; an inactive clock stays empty.
  return (
    <MainBannerCircle
      fill={remainingFraction === undefined ? 0 : 1 - remainingFraction}
    >
      {fight.isFighting ? (
        <BannerFightPortrait
          gfxId={character.gfxId}
          name={character.name}
          colors={[character.color1, character.color2, character.color3]}
          countdown={countdown}
        />
      ) : (
        <Minimap />
      )}
    </MainBannerCircle>
  );
}

/**
 * In-fight cast state for a single hotbar slot. Used to drive the
 * visual treatment (selected ring, dimmed when out of AP, greyed-out
 * cooldown) and to gate clicks on whether the slot is castable.
 */
type FightSlotState =
  | "idle" // not in a fight, no special treatment
  | "ready"
  | "selected"
  | "pending"
  | "unaffordable"
  | "cooldown"
  | "disabled";

/** Drag/drop wiring every cell of the bar shares. */
interface HotbarCellDnd {
  slot: number;
  tab: HotbarTab;
  onDrop: (payload: HotbarDragPayload) => void;
  onDropNowhere: (payload: HotbarDragPayload) => void;
}

interface SpellHotbarCellProps extends HotbarCellDnd {
  spell: SpellEntry | null;
  fight: FightSlotState;
  /** Click handler for fight casts. No-op when fight === "idle". */
  onCast?: ((spellId: number) => void) | undefined;
}

/**
 * Maps the slot's fight state to the Tailwind classes that overlay the
 * stock MainBannerGridSlot frame. Idle = no overlay; selected = a bright
 * inner ring; cooldown / unaffordable = dim; disabled = lower opacity.
 */
const FIGHT_SLOT_OVERLAY: Record<FightSlotState, string> = {
  idle: "",
  ready: "",
  selected: "ring-2 ring-[#ffcb5c] ring-inset shadow-[0_0_0_1px_#ffe9a8]",
  pending: "ring-2 ring-[#9be6ff] ring-inset",
  unaffordable: "opacity-60 saturate-50",
  cooldown: "grayscale opacity-50",
  disabled: "opacity-40 cursor-not-allowed",
};

/**
 * Corner label for the item quantity / `Eq` badge.
 *
 * Spell cells carry no corner label: 1.29 never draws the AP cost on a
 * shortcut container — `MouseShortcuts` only ever paints the cooldown
 * number over the icon — and the cost is in the tooltip instead.
 */
const CORNER_BADGE =
  "absolute bottom-0 right-0 z-10 px-[calc(2px*var(--resolution-factor))] " +
  "font-[Verdana,sans-serif] text-[calc(9px*var(--resolution-factor))] " +
  "font-bold drop-shadow-[0_0_2px_#000] pointer-events-none";

/**
 * Hotbar cell — one slot of the 14-wide spell grid. Wraps MainBannerGridSlot
 * with a Base UI Tooltip so hover shows the localized name + level +
 * description instead of the native browser title (which doesn't style + is
 * unreliable inside nested positioned containers).
 *
 * In a fight the cell becomes castable: clicking it routes to
 * `gameClient.fightSelectSpell` (via the `onCast` prop) and the visual
 * treatment reflects the spell-cast machine + per-spell affordability.
 * Outside a fight the cell is purely informational (hover tooltip) —
 * 1.29 refuses to cast from the map, and so does this.
 */
function SpellHotbarCell({
  spell,
  fight,
  onCast,
  slot,
  tab,
  onDrop,
  onDropNowhere,
}: SpellHotbarCellProps) {
  const dropProps = hotbarDropProps(onDrop);

  if (!spell) {
    return <MainBannerGridSlot {...dropProps} />;
  }

  const payload: HotbarDragPayload = {
    kind: "spell",
    spellId: spell.spellId,
    fromSlot: slot,
  };
  const overlay = FIGHT_SLOT_OVERLAY[fight];
  const clickable =
    fight !== "idle" && fight !== "disabled" && fight !== "cooldown";
  const handleClick =
    clickable && onCast ? () => onCast(spell.spellId) : undefined;
  const cooldownBadge =
    fight === "cooldown" && spell.cooldownRemaining > 0 ? (
      <span className="absolute inset-0 z-20 flex items-center justify-center font-[Verdana,sans-serif] text-[calc(14px*var(--resolution-factor))] font-bold text-white drop-shadow-[0_0_2px_#000] pointer-events-none">
        {spell.cooldownRemaining}
      </span>
    ) : null;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <MainBannerGridSlot
            data-audio="click2"
            className={overlay}
            {...(handleClick ? { onClick: handleClick } : {})}
            {...dropProps}
            {...hotbarDragProps(payload, () => onDropNowhere(payload))}
            onDragStartCapture={(e) => {
              if (!hotbarDragAllowed(tab, e.shiftKey)) {
                e.preventDefault();
              }
            }}
          >
            <SpellIconMount spellId={spell.spellId} label={spell.name} />
            {cooldownBadge}
          </MainBannerGridSlot>
        }
      />
      <Tooltip.Portal>
        {/* Positioner is the floating-UI fixed container; the z-index
         * has to live here, not on Popup, or the entire tooltip stacks
         * under any HUD panel with higher z-index than the Positioner's
         * default. 999999 matches the app's custom tooltip layer
         * (`hud/components/Tooltip.tsx`) so spell tooltips float above
         * world-map / fight / conquest panels. */}
        <Tooltip.Positioner sideOffset={6} style={{ zIndex: 999999 }}>
          {/*
            Canonical Dofus 1.29 spell tooltip styling — sourced from
            `dofus.graphics.gapi.styles.DofusStylePackage`:
              • bg `ExtraLightBrownSpellFullInfosStylizedRectangle` (cream
                #EDE5CC, 10px corner radius)
              • title `BrownCenterBigBoldLabel` (Font2 size 13, dark brown
                #514A3C bold)
              • body `FilterLabel` (Font1 size 11, dark brown #514A3C bold)
              • AP-cost emphasis: `OrangeLeftMediumBoldLabel` (#FF6800)
            Earlier we shipped a dark-theme bubble (#2b2a24 bg, gold
            title) which read as a generic web tooltip rather than
            anything Ankama drew.
          */}
          <Tooltip.Popup className={TOOLTIP_POPUP}>
            <div className="text-[13px] font-bold leading-tight">
              {spell.name}
              <span className="ml-2 text-[11px] font-normal text-[#7a7060]">
                Niv. {spell.level}
              </span>
            </div>
            {fight !== "idle" && (
              <div className="mt-[2px] font-bold">
                <span className="text-[#e87a0d]">{spell.apCost} PA</span>
                <span className="text-[#7a7060]"> · portée </span>
                {spell.rangeMin === spell.rangeMax
                  ? spell.rangeMin
                  : `${spell.rangeMin}–${spell.rangeMax}`}
                {spell.cooldownRemaining > 0 && (
                  <span className="text-[#7a7060]">
                    {" · "}
                    {spell.cooldownRemaining} tour(s) restant(s)
                  </span>
                )}
              </div>
            )}
            {spell.combatUnavailableReason && (
              <div className="mt-1 font-bold text-[#a33723]">
                {spell.combatUnavailableReason}
              </div>
            )}
            {spell.description && (
              <div className="mt-[3px] font-normal text-[#3a3528]">
                {spell.description}
              </div>
            )}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

const TOOLTIP_POPUP =
  "max-w-xs rounded-[6px] border border-[#514a3c] " +
  "bg-[#ede5cc] px-[8px] py-[6px] " +
  "text-[11px] leading-snug text-[#514a3c] " +
  "shadow-[0_2px_6px_rgba(0,0,0,0.45)] " +
  "font-[Verdana,sans-serif] whitespace-pre-wrap";

interface CloseCombatCellProps {
  /** The `SpellData` the server built from the equipped weapon, if any. */
  spell: SpellEntry | undefined;
  /** Icon of the worn weapon; absent means bare hands. */
  weapon: { typeId: number; gfxId: number; name: string } | undefined;
  fight: FightSlotState;
  onCast?: ((spellId: number) => void) | undefined;
}

/**
 * The close-combat container — 1.29's `_ctrCC`, the cell left of the
 * grid.
 *
 * It is not one of the 14 slots: it holds a fixed pseudo-spell whose
 * cost, range and effects come from the equipped weapon
 * (`dofus.datacenter.CloseCombat`), so it takes no drop, is never
 * dragged, and ignores the Sorts / Obj. tab. Unarmed, it falls back to
 * the punch icon, which is spell 0's own dofasset.
 */
function CloseCombatCell({
  spell,
  weapon,
  fight,
  onCast,
}: CloseCombatCellProps) {
  const name = spell?.name ?? weapon?.name ?? "Coup de poing";
  const clickable =
    Boolean(spell) &&
    fight !== "idle" &&
    fight !== "disabled" &&
    fight !== "cooldown";

  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <MainBannerGridSlot
            data-audio="click2"
            className={FIGHT_SLOT_OVERLAY[fight]}
            aria-label={name}
            {...(clickable && onCast
              ? { onClick: () => onCast(CLOSE_COMBAT_SPELL_ID) }
              : {})}
          >
            {weapon ? (
              <ItemIcon
                typeId={weapon.typeId}
                gfxId={weapon.gfxId}
                size="100%"
                alt={name}
              />
            ) : (
              <SpellIconMount spellId={CLOSE_COMBAT_SPELL_ID} label={name} />
            )}
          </MainBannerGridSlot>
        }
      />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} style={{ zIndex: 999999 }}>
          <Tooltip.Popup className={TOOLTIP_POPUP}>
            <div className="text-[13px] font-bold leading-tight">{name}</div>
            {spell && fight !== "idle" && (
              <div className="mt-[2px] font-bold">
                <span className="text-[#e87a0d]">{spell.apCost} PA</span>
                <span className="text-[#7a7060]"> · portée </span>
                {spell.rangeMin === spell.rangeMax
                  ? spell.rangeMin
                  : `${spell.rangeMin}–${spell.rangeMax}`}
              </div>
            )}
            {spell?.description && (
              <div className="mt-[3px] font-normal text-[#3a3528]">
                {spell.description}
              </div>
            )}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

interface ItemHotbarCellProps extends HotbarCellDnd {
  shortcut: ResolvedShortcut | undefined;
  onUse: () => void;
  onRemove: () => void;
}

/**
 * Hotbar cell in "Obj." mode.
 *
 * A cell survives its stack: when nothing in the inventory matches the
 * template any more it greys out instead of disappearing
 * (`MouseShortcuts.setItemStateOnContainer` applies `INACTIVE_TRANSFORM`
 * for exactly this). Double-click uses or equips, right-click opens the
 * same two options the retail popup menu carries.
 */
function ItemHotbarCell({
  shortcut,
  onUse,
  onRemove,
  slot,
  tab,
  onDrop,
  onDropNowhere,
}: ItemHotbarCellProps) {
  const dropProps = hotbarDropProps(onDrop);

  if (!shortcut) {
    return <MainBannerGridSlot {...dropProps} />;
  }

  const payload: HotbarDragPayload = { kind: "shortcut", fromSlot: slot };
  const { template, label, active } = shortcut;
  const name = template?.name ?? "Objet";

  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <MainBannerGridSlot
            data-audio="click2"
            className={active ? "" : "grayscale opacity-50"}
            onDoubleClick={onUse}
            onContextMenu={(e) => {
              e.preventDefault();
              const options = [
                { label: "Retirer ce raccourci", onClick: onRemove },
              ];
              if (active && template?.usable) {
                options.unshift({ label: "Utiliser", onClick: onUse });
              }
              showContextMenu(name, options, e.clientX, e.clientY);
            }}
            {...dropProps}
            {...hotbarDragProps(payload, () => onDropNowhere(payload))}
            onDragStartCapture={(e) => {
              if (!hotbarDragAllowed(tab, e.shiftKey)) {
                e.preventDefault();
              }
            }}
          >
            {template && (
              <ItemIcon
                typeId={template.typeId}
                gfxId={template.gfxId}
                size="100%"
                alt={name}
              />
            )}
            {label && (
              <span className={`${CORNER_BADGE} text-white`}>{label}</span>
            )}
          </MainBannerGridSlot>
        }
      />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} style={{ zIndex: 999999 }}>
          <Tooltip.Popup className={TOOLTIP_POPUP}>
            <div className="text-[13px] font-bold leading-tight">{name}</div>
            {/* `HELP_SHORTCUT_DBLCLICK` in the retail lang bundle. */}
            {active && template?.usable && (
              <div className="mt-[3px] font-normal text-[#3a3528]">
                Double-cliquez pour utiliser cet objet.
              </div>
            )}
            {!active && (
              <div className="mt-[3px] font-normal text-[#7a7060]">
                Vous n'avez plus cet objet.
              </div>
            )}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

const ICON_BUTTONS = [
  { icon: "stats", panel: "stats" },
  { icon: "spells", panel: "spells" },
  { icon: "inventory", panel: "inventory" },
  { icon: "quests", panel: "quests" },
  { icon: "map", panel: "map" },
  { icon: "friends", panel: "friends" },
  { icon: "guild", panel: "guild" },
  { icon: "mount", panel: "mount" },
] as const;

interface BannerReactProps {
  /** Callback when a spell slot is clicked during a fight (cast/select). */
  onSelectSpell?: (spellId: number) => void;
  onForfeit?: () => void;
  onPassTurn?: () => void;
}

export function BannerReact({
  onSelectSpell,
  onForfeit,
  onPassTurn,
}: BannerReactProps = {}) {
  const gameClient = useGameClient();
  const { stats } = useSyncExternalStore(
    characterStore.subscribe,
    characterStore.getSnapshot
  );
  const { spells, byId } = useSyncExternalStore(
    spellsStore.subscribe,
    spellsStore.getSnapshot
  );
  const shortcuts = useSyncExternalStore(
    shortcutsStore.subscribe,
    shortcutsStore.getSnapshot
  );
  const inventory = useSyncExternalStore(
    inventoryStore.subscribe,
    inventoryStore.getSnapshot
  );

  const fight = useFightMode();
  const cast = useSpellCast();
  const { isFighting } = fight;
  const { tab, page } = shortcuts;

  // During a fight the live LP/LPmax for our sprite live in fightStore
  // (FIGHTER_UPSERT seeds them on placement, FIGHTER_UPDATE patches
  // them on every damage/heal/turn snapshot). characterStore.stats is
  // a roleplay snapshot taken at login and never refreshed mid-fight,
  // so reading it during combat shows pre-fight HP and never moves.
  // Outside combat the fightStore mirror is empty, so we fall back to
  // the character snapshot.
  const myFighter =
    isFighting && fight.mySpriteId
      ? fight.fighters.get(fight.mySpriteId)
      : undefined;
  const hp = myFighter?.hp ?? stats?.hp ?? 100;
  const maxHp = myFighter?.maxHp ?? stats?.maxHp ?? 100;

  /** The 1-based slots this page shows, left to right, top to bottom. */
  const pageSlots = useMemo(
    () =>
      Array.from({ length: HOTBAR_SLOTS_PER_PAGE }, (_, i) => slotAt(page, i)),
    [page]
  );

  /**
   * Project the SpellEntry list onto this page's slots.
   *
   * `spellAtSlot` is the shared lookup the keyboard shortcuts use too
   * (`hotbar-actions.ts`), so a cell cannot resolve one spell under the
   * mouse and another under its key.
   */
  const hotbar = useMemo<(SpellEntry | null)[]>(
    () => pageSlots.map((slot) => spellAtSlot({ spells, byId }, slot) ?? null),
    [spells, byId, pageSlots]
  );

  /**
   * Resolve fight-slot state per spell. Outside combat every slot is
   * "idle" (regular hotbar). Inside combat we mirror the old
   * FightSpellBar treatment: disabled when not our turn, then cooldown,
   * then pending/selected, then unaffordable, else ready.
   */
  const slotState = useCallback(
    (spell: SpellEntry | null | undefined): FightSlotState => {
      if (!fight.isCombat || !spell) {
        return "idle";
      }
      if (!fight.isMyTurn || fight.finishing || spell.combatUnavailableReason) {
        return "disabled";
      }
      if (spell.cooldownRemaining > 0) {
        return "cooldown";
      }
      const isSelected = cast.selectedSpellId === spell.spellId;
      if (isSelected && cast.isPending) {
        return "pending";
      }
      if (isSelected) {
        return "selected";
      }
      if (spell.apCost > fight.ap) {
        return "unaffordable";
      }
      return "ready";
    },
    [
      fight.isCombat,
      fight.isMyTurn,
      fight.finishing,
      fight.ap,
      cast.selectedSpellId,
      cast.isPending,
    ]
  );

  const fightStates = useMemo<FightSlotState[]>(() => {
    return hotbar.map(slotState);
  }, [hotbar, slotState]);

  // The close-combat container. `byId` holds it under id 0 — the server
  // rebuilds that entry whenever the weapon changes — while `spells`
  // deliberately does not, so it never lands in a hotbar cell.
  const closeCombat = byId.get(CLOSE_COMBAT_SPELL_ID);
  const weaponItem = getEquippedAt(inventory, EquipmentPosition.WEAPON);
  const weaponTemplate = weaponItem
    ? inventory.templates.get(weaponItem.itemId)
    : undefined;
  const weapon = weaponTemplate
    ? {
        typeId: weaponTemplate.typeId,
        gfxId: weaponTemplate.gfxId,
        name: weaponTemplate.name,
      }
    : undefined;

  const handleIconClick = (panel: string) => {
    if (panel === "map") {
      toggleWorldMap();
    } else {
      togglePanel(panel as never);
    }
  };

  const cells = pageSlots.map((slot, i) => {
    const dnd = {
      slot,
      tab,
      onDrop: (payload: HotbarDragPayload) =>
        dropOnSlot(gameClient, slot, payload),
      onDropNowhere: (payload: HotbarDragPayload) =>
        removeFromSlot(gameClient, payload),
    };

    if (tab === "spells") {
      return (
        <SpellHotbarCell
          key={slot}
          spell={hotbar[i] ?? null}
          fight={fightStates[i] ?? "idle"}
          onCast={onSelectSpell}
          {...dnd}
        />
      );
    }

    return (
      <ItemHotbarCell
        key={slot}
        shortcut={resolveShortcut(shortcuts, inventory, slot)}
        onUse={() => triggerSlot(gameClient, slot)}
        onRemove={() => gameClient?.removeItemShortcut(slot)}
        {...dnd}
      />
    );
  });

  return (
    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 pointer-events-auto z-10">
      <MainBanner mode={isFighting ? "fight" : "normal"}>
        <BannerChatContainer />
        <BannerCircle />

        <MainBannerHeart hp={hp} max={maxHp} />
        {isFighting && !fight.isSpectator && (
          <BannerFightPoints ap={fight.ap} mp={fight.mp} />
        )}
        {isFighting && !fight.isSpectator && (
          <MainBannerForfeitButton
            data-audio="click2"
            onClick={onForfeit}
            disabled={!onForfeit || fight.finishing}
            aria-label="Abandonner le combat"
            title="Abandonner le combat"
          />
        )}
        {fight.isCombat && (
          <MainBannerTurnButton
            data-audio="click2"
            onClick={onPassTurn}
            disabled={
              !onPassTurn ||
              !fight.isMyTurn ||
              fight.actionPending ||
              fight.finishing ||
              !myFighter ||
              myFighter.dead
            }
            aria-label="Passer le tour"
            title="Passer le tour"
          />
        )}

        <MainBannerButtons>
          {ICON_BUTTONS.map(({ icon, panel }) => (
            <MainBannerIconButton
              key={icon}
              data-audio="click2"
              icon={icon}
              onClick={() => handleIconClick(panel)}
            />
          ))}
        </MainBannerButtons>

        <MainBannerMorePanel>
          <MainBannerIconButton
            icon="pvp"
            onClick={() => togglePanel("conquest")}
          />
          <MainBannerIconButton
            icon="job"
            onClick={() => togglePanel("jobs")}
          />
          <MainBannerIconButton icon="achievement" />
          <MainBannerIconButton icon="event" />
          <MainBannerIconButton icon="title" />
        </MainBannerMorePanel>
        <MainBannerRightPanel />

        <MainBannerGrid
          leading={
            <CloseCombatCell
              spell={closeCombat}
              weapon={weapon}
              fight={slotState(closeCombat)}
              onCast={onSelectSpell}
            />
          }
          tabs={[
            { value: "spells", label: "Sorts" },
            { value: "items", label: "Obj." },
          ]}
          value={tab}
          onValueChange={(next) => setHotbarTab(next as HotbarTab)}
          pager={{
            page,
            pageCount: HOTBAR_PAGES,
            onStep: stepHotbarPage,
          }}
        >
          <Tooltip.Provider>{cells}</Tooltip.Provider>
        </MainBannerGrid>
      </MainBanner>
    </div>
  );
}
