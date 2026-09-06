import { useState } from "react";

import type { CraftsLang } from "@/game/lang/crafts-lang";
import type { ItemData, ItemTemplateData } from "@/game/network/protocol";
import { showContextMenu } from "@/game/stores/context-menu-store";

import { Scrollbar } from "../components/Scrollbar";
import { useTooltip } from "../components/Tooltip";
import { ItemIcon } from "../inventory/ItemIcon";
import { FILTER_CATEGORIES } from "../inventory/inventory-theme";
import { TypeSelect } from "../inventory/TypeSelect";
import { useItemFilters } from "../inventory/use-item-filters";
import {
  CRAFT_BENCH,
  CRAFT_COLORS,
  CRAFT_COLUMN,
  CRAFT_OBTAINED,
  CRAFT_WINDOW,
} from "./craft-theme";

const C = CRAFT_COLORS;
export const GRID_ASSET_BASE = "/themes/classic/assets/panels/inventory";

/**
 * The three category buttons retail draws in the craft window, in the
 * order the capture has them. The bag's own row has nine; a bench does
 * not, and the missing six are not a simplification of this port —
 * `screenshot-ui/craft_menu.png` shows exactly these three.
 */
const CRAFT_FILTER_IDS = ["equipment", "consumables", "resources"] as const;

/**
 * The four things a craft slot needs to know about what sits in it.
 *
 * Deliberately narrower than `ItemTemplateData`, which only ever covers
 * what the character is carrying — the wrong set for a co-operative bench,
 * where half the ingredients belong to the other player and never appear
 * in this client's template map. `CraftItemInfo` from the lang bundle
 * satisfies this too, which is what lets the partner's contribution be
 * drawn at all. `ItemTemplateData` satisfies it structurally.
 */
export interface CraftIcon {
  name: string;
  level: number;
  typeId: number;
  gfxId: number;
}

/**
 * "Compétence : Sculpter un Bâton", above the window.
 *
 * `width` is the caller's because the two benches are not the same shape:
 * the solo one is a right-hand column, the co-operative one spans the play
 * area with the banner centred over both contributions.
 */
export function SkillBanner({
  zoom,
  skillName,
  width = CRAFT_COLUMN.width,
}: {
  zoom: number;
  skillName: string;
  width?: number;
}) {
  const p = (n: number) => Math.round(n * zoom);

  return (
    <div
      style={{
        width: p(width),
        height: p(CRAFT_COLUMN.bannerHeight),
        boxSizing: "border-box",
        background: C.dark,
        border: `${p(3)}px solid #ffffff`,
        borderRadius: p(13),
        display: "flex",
        alignItems: "center",
        padding: `0 ${p(12)}px`,
        fontFamily: "Verdana, sans-serif",
        fontSize: p(11),
        fontWeight: "bold",
        color: C.darkText,
        whiteSpace: "nowrap",
        overflow: "hidden",
      }}
    >
      Compétence : {skillName}
    </div>
  );
}

/**
 * The window's contents: the type caption and dropdown, the three
 * category buttons beside the pods gauge, and the 9×3 bag grid.
 *
 * Absolutely positioned against `Panel`'s padding box, so every y here is
 * measured from under the top border and the title bar occupies 0..22.
 */
export function BagBrowser({
  zoom,
  items,
  templates,
  weight,
  selectedUnicId,
  onSelect,
  actions,
}: {
  zoom: number;
  items: ItemData[];
  templates: Map<number, ItemTemplateData>;
  weight: { current: number; max: number };
  selectedUnicId: number | null;
  onSelect: (item: ItemData) => void;
  actions: CraftCellAction[];
}) {
  const p = (n: number) => Math.round(n * zoom);
  const G = CRAFT_WINDOW.grid;
  const {
    categoryId,
    setCategoryId,
    typeName,
    setTypeName,
    typeOptions,
    visible,
  } = useItemFilters(items, templates);
  const [scrollTop, setScrollTop] = useState(0);

  const rows = Math.max(G.rows, Math.ceil(visible.length / G.columns));
  const cellCount = rows * G.columns;
  const viewportHeight = G.rows * G.cellSize;
  const contentHeight = rows * G.cellSize;
  const maxScroll = Math.max(0, contentHeight - viewportHeight);
  const clampedScroll = Math.min(scrollTop, maxScroll);
  const podsRatio =
    weight.max > 0 ? Math.min(1, Math.max(0, weight.current / weight.max)) : 0;

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: p(CRAFT_WINDOW.label.x),
          top: p(CRAFT_WINDOW.label.y),
          height: p(CRAFT_WINDOW.label.height),
          display: "flex",
          alignItems: "center",
          fontFamily: "Verdana, sans-serif",
          fontSize: p(CRAFT_WINDOW.label.fontSize),
          color: C.text,
        }}
      >
        Équipement
      </div>

      <div
        style={{
          position: "absolute",
          left: p(CRAFT_WINDOW.dropdown.x),
          top: p(CRAFT_WINDOW.dropdown.y),
          width: p(CRAFT_WINDOW.dropdown.width),
          height: p(CRAFT_WINDOW.dropdown.height),
        }}
      >
        <TypeSelect
          value={typeName}
          options={typeOptions}
          onChange={setTypeName}
          zoom={zoom}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: p(CRAFT_WINDOW.filters.x),
          top: p(CRAFT_WINDOW.filters.y),
          display: "flex",
          gap: p(CRAFT_WINDOW.filters.pitch - CRAFT_WINDOW.filters.size),
        }}
      >
        {CRAFT_FILTER_IDS.map((id) => {
          const category = FILTER_CATEGORIES.find((c) => c.id === id);
          if (!category) {
            return null;
          }
          const active = categoryId === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              title={category.label}
              onClick={() => setCategoryId(active ? null : id)}
              style={{
                width: p(CRAFT_WINDOW.filters.size),
                height: p(CRAFT_WINDOW.filters.size),
                border: "none",
                borderRadius: p(4),
                // Retail darkens the button that is on rather than
                // outlining it — the capture's "Ressources" filter is a
                // brown tile beside two orange ones.
                background: active ? C.dark : "#df7d2e",
                backgroundImage: `url("${category.icon}")`,
                backgroundSize: "70%",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
                cursor: "pointer",
                padding: 0,
              }}
            />
          );
        })}
      </div>

      <div
        title={`Pods : ${weight.current} / ${weight.max}`}
        style={{
          position: "absolute",
          left: p(CRAFT_WINDOW.pods.x),
          top: p(CRAFT_WINDOW.pods.y),
          width: p(CRAFT_WINDOW.pods.width),
          height: p(CRAFT_WINDOW.pods.height),
          background: C.gaugeTrack,
          borderRadius: p(CRAFT_WINDOW.pods.height / 2),
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${podsRatio * 100}%`,
            height: "100%",
            background: C.orange,
            borderRadius: p(CRAFT_WINDOW.pods.height / 2),
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: p(G.x),
          top: p(G.y),
          display: "flex",
          height: p(viewportHeight),
        }}
      >
        <div
          style={{
            width: p(G.columns * G.cellSize),
            height: "100%",
            overflow: "hidden",
          }}
          onWheel={(e) => {
            if (maxScroll <= 0) {
              return;
            }
            e.stopPropagation();
            setScrollTop((prev) =>
              Math.max(
                0,
                Math.min(maxScroll, prev + Math.sign(e.deltaY) * G.cellSize)
              )
            );
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${G.columns}, ${p(G.cellSize)}px)`,
              transform: `translateY(${p(-clampedScroll)}px)`,
              willChange: "transform",
            }}
          >
            {Array.from({ length: cellCount }, (_, index) => {
              const item = visible[index];
              return (
                <CraftCell
                  key={item?.unicId ?? `empty-${index}`}
                  zoom={zoom}
                  width={G.cellSize}
                  height={G.cellSize}
                  item={item}
                  template={item ? templates.get(item.itemId) : undefined}
                  selected={item?.unicId === selectedUnicId}
                  onSelect={onSelect}
                  actions={actions}
                />
              );
            })}
          </div>
        </div>

        <Scrollbar
          zoom={zoom}
          width={G.scrollbarWidth}
          scrollTop={clampedScroll}
          maxScroll={maxScroll}
          viewportHeight={viewportHeight}
          contentHeight={contentHeight}
          step={G.cellSize}
          onScroll={setScrollTop}
          trackColor="transparent"
          thumbColor={C.scrollThumb}
          thumbVisible={maxScroll > 0}
        />
      </div>
    </>
  );
}

/**
 * The bench strip: one slot per craft slot the skill grants, right-aligned
 * with the first free one outlined the way retail marks where the next
 * ingredient lands.
 */
export function BenchSlots({
  zoom,
  laid,
  maxSlots,
  iconOf,
  onRemove,
  align = "right",
  showNextSlot = true,
  top = CRAFT_BENCH.slot.top,
}: {
  zoom: number;
  laid: ItemData[];
  maxSlots: number;
  /**
   * How a laid stack is drawn. A lookup rather than a map because half of
   * a co-operative bench belongs to the other player, whose templates this
   * client has never been sent — see `CraftIcon`.
   */
  iconOf: (item: ItemData) => CraftIcon | undefined;
  /** Absent on a strip the reader may look at but not touch. */
  onRemove?: (item: ItemData) => void;
  align?: "left" | "right";
  /**
   * Where the row starts under the panel's padding box, in base units.
   *
   * The solo bench sits in a bare box, so the default clears nothing. A
   * strip inside a *titled* panel has to clear the bar, which `Panel`
   * draws at a hardcoded 22 — without this the slots are painted over the
   * name the strip belongs to.
   */
  top?: number;
  /**
   * The outline retail puts on the slot the next ingredient lands in.
   * Off on the partner's strip: nothing this player does lands there.
   */
  showNextSlot?: boolean;
}) {
  const p = (n: number) => Math.round(n * zoom);
  const S = CRAFT_BENCH.slot;
  const actions = onRemove
    ? [{ label: "Retirer", enabled: () => true, run: onRemove }]
    : [];

  return (
    <div
      style={{
        position: "absolute",
        [align]: p(S.rightMargin),
        top: p(top),
        display: "flex",
      }}
    >
      {Array.from({ length: Math.max(0, maxSlots) }, (_, index) => (
        <CraftCell
          // Slot index is the identity here: the strip is a fixed row of
          // positions, not a list that reorders.
          key={`slot-${index}`}
          zoom={zoom}
          width={S.width}
          height={S.height}
          item={laid[index]}
          template={laid[index] ? iconOf(laid[index] as ItemData) : undefined}
          selected={
            showNextSlot && index === laid.length && laid.length < maxSlots
          }
          onSelect={() => undefined}
          actions={actions}
        />
      ))}
    </div>
  );
}

export interface CraftCellAction {
  label: string;
  enabled: (item: ItemData, template: CraftIcon | undefined) => boolean;
  run: (item: ItemData) => void;
}

/**
 * One slot, in the grid or in the bench strip.
 *
 * Same `grid-cell-bg.svg` as every other 1.29 grid, stretched: the bench
 * slots are 38×35 base units against the grid's 32×32, which is the
 * capture's own proportion and not a square.
 */
export function CraftCell({
  zoom,
  width,
  height,
  item,
  template,
  selected,
  onSelect,
  actions,
}: {
  zoom: number;
  width: number;
  height: number;
  item: ItemData | undefined;
  template: CraftIcon | undefined;
  selected: boolean;
  onSelect: (item: ItemData) => void;
  actions: CraftCellAction[];
}) {
  const p = (n: number) => Math.round(n * zoom);
  const tooltip = useTooltip();

  const frame = {
    width: p(width),
    height: p(height),
    backgroundImage: `url("${GRID_ASSET_BASE}/grid-cell-bg.svg")`,
    backgroundSize: "100% 100%",
    boxSizing: "border-box" as const,
  };

  const highlight = selected && (
    <img
      src={`${GRID_ASSET_BASE}/grid-cell-highlight.svg`}
      alt=""
      draggable={false}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );

  if (!item) {
    return <div style={{ ...frame, position: "relative" }}>{highlight}</div>;
  }

  const available = actions.filter((action) => action.enabled(item, template));

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      onDoubleClick={() => available[0]?.run(item)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (available.length === 0) {
          return;
        }
        showContextMenu(
          template?.name ?? "Objet",
          available.map((action) => ({
            label: action.label,
            onClick: () => action.run(item),
          })),
          e.clientX,
          e.clientY
        );
      }}
      onMouseEnter={(e) => {
        if (template) {
          tooltip.show(
            `${template.name}${template.level ? ` (Niv.${template.level})` : ""}`,
            e.clientX,
            e.clientY
          );
        }
      }}
      onMouseLeave={tooltip.hide}
      style={{
        ...frame,
        position: "relative",
        border: "none",
        padding: p(2),
        cursor: "pointer",
      }}
    >
      {template && (
        <ItemIcon
          typeId={template.typeId}
          gfxId={template.gfxId}
          size="100%"
          alt={template.name}
          style={{ width: "100%", height: "100%" }}
        />
      )}
      {item.quantity > 1 && <QuantityTag zoom={zoom} value={item.quantity} />}
      {highlight}
    </button>
  );
}

/**
 * The stack count.
 *
 * A filled dark tag rather than the outlined text `ItemGrid` draws: in
 * this capture the number sits on its own 12×12 plaque in the cell's
 * top-left corner, which is what makes it readable over a pale icon.
 */
export function QuantityTag({ zoom, value }: { zoom: number; value: number }) {
  const p = (n: number) => Math.round(n * zoom);

  return (
    <span
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        minWidth: p(12),
        height: p(12),
        padding: `0 ${p(1)}px`,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: C.quantityTag,
        color: "#ffffff",
        fontFamily: "Verdana, sans-serif",
        fontSize: p(8),
        fontWeight: "bold",
        lineHeight: 1,
      }}
    >
      {value}
    </span>
  );
}

/**
 * "Objet obtenu" — the box that previews, and then reports, the result.
 *
 * It carries the outcome line too: the capture has no other place for one,
 * and a failed craft has to say so out loud because the ingredients are
 * gone either way. Both the caption and the arrow are the caller's, since
 * the two benches point at this box from different sides — the solo one
 * from the right, the co-operative one from directly above.
 */
export function ObtainedBox({
  zoom,
  position,
  resultItemId,
  lang,
  outcome,
  outcomeTone,
  arrow = true,
}: {
  zoom: number;
  /** Placed by the caller, in base units, against the play area. */
  position: React.CSSProperties;
  resultItemId: number | null;
  lang: CraftsLang | null;
  outcome: string;
  outcomeTone: string;
  arrow?: boolean;
}) {
  const p = (n: number) => Math.round(n * zoom);
  const B = CRAFT_OBTAINED;
  const result = resultItemId === null ? null : lang?.items.get(resultItemId);

  return (
    <div
      style={{
        position: "absolute",
        ...position,
        display: "flex",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: p(B.box.width),
          height: p(B.box.height),
          boxSizing: "border-box",
          background: C.dark,
          border: `${p(3)}px solid #ffffff`,
          borderRadius: p(13),
          display: "flex",
          alignItems: "center",
          gap: p(8),
          padding: `0 ${p(9)}px`,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "Verdana, sans-serif",
              fontSize: p(11),
              fontWeight: "bold",
              color: C.darkText,
            }}
          >
            Objet obtenu
          </div>
          {outcome && (
            <div
              style={{
                marginTop: p(3),
                fontFamily: "Verdana, sans-serif",
                fontSize: p(8),
                color: outcomeTone,
              }}
            >
              {outcome}
            </div>
          )}
        </div>

        <div
          style={{
            width: p(B.slot.size),
            height: p(B.slot.size),
            flexShrink: 0,
            backgroundImage: `url("${GRID_ASSET_BASE}/grid-cell-bg.svg")`,
            backgroundSize: "100% 100%",
            padding: p(2),
            boxSizing: "border-box",
          }}
          title={result?.name ?? ""}
        >
          {result && (
            <ItemIcon
              typeId={result.typeId}
              gfxId={result.gfxId}
              size="100%"
              alt={result.name}
              style={{ width: "100%", height: "100%" }}
            />
          )}
        </div>
      </div>

      {arrow && (
        <svg
          width={p(B.arrow.width)}
          height={p(B.arrow.height)}
          viewBox="0 0 55 42"
          aria-hidden="true"
          style={{ marginLeft: p(B.arrow.gap), display: "block" }}
        >
          <path
            d="M3 21 23 4v9h29v16H23v9z"
            fill="#ece8d8"
            stroke="#ffffff"
            strokeWidth={3}
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}

/** The ↻ on the "vider l'atelier" button. */
export function ResetGlyph({ zoom }: { zoom: number }) {
  const size = Math.round(12 * zoom);
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M13.4 8a5.4 5.4 0 1 1-1.6-3.8"
        fill="none"
        stroke="#ffffff"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <path d="M14.2 1.4v5.2H9z" fill="#ffffff" />
    </svg>
  );
}

export function CraftButton({
  zoom,
  width,
  tone,
  label,
  title,
  pressed = false,
  disabled = false,
  onClick,
  children,
}: {
  zoom: number;
  width: number;
  tone: "dark" | "orange";
  label?: string;
  title?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  const p = (n: number) => Math.round(n * zoom);
  const background =
    tone === "dark" ? C.dark : pressed ? C.orangePressed : C.orange;

  return (
    <button
      type="button"
      title={title ?? label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: p(width),
        height: p(CRAFT_BENCH.buttons.height),
        boxSizing: "border-box",
        background: pressed && tone === "dark" ? "#6b6252" : background,
        border: `${p(2)}px solid #ffffff`,
        borderRadius: p(7),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        fontFamily: "Verdana, sans-serif",
        fontSize: p(10),
        fontWeight: "bold",
        color: C.darkText,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children ?? label}
    </button>
  );
}

/** The colour an outcome line is written in. */
export function outcomeColor(outcome: string): string {
  if (outcome === "success") {
    return C.success;
  }

  if (outcome === "failure") {
    return C.failure;
  }

  return "#cdc7b4";
}
