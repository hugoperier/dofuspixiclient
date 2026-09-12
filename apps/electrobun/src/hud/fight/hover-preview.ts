import type { DofusPathfinding } from "@dofus/grid";
import { castGeometryError, cellsInArea } from "@dofus/grid";

import type { Battlefield } from "@/game/scene";
import type { FightUI } from "@/hud/fight/fight-ui";
import { fightMovementPath } from "@/game/machines/fight-movement-targeting";
import { spellCastActor } from "@/game/machines/spell-cast.machine";
import { fightStore } from "@/game/stores/fight-store";

/**
 * Wires cell-hover events from the battlefield to the fight-UI
 * overlays + cast machine. Two modes:
 *
 * 1. No spell selected + it's our turn + we have MP: draw the literal
 *    MP-bound path from our cell to the hovered cell using the same
 *    4-direction-only pathfinder the server validates against.
 *
 * 2. Spell selected (cast machine is `targeting`): compute the AoE
 *    footprint via the shared @dofus/grid `cellsInArea` primitive
 *    (same code the server runs), filter out-of-LoS cells, and
 *    dispatch HOVER_CELL to the machine so the highlight overlay
 *    stays in sync.
 *
 * A running animation is not a third mode. `currentCellId` reports
 * where the server says we stand, not where the sprite currently is,
 * so the preview is anchored correctly even while an earlier action
 * is still playing out.
 */
export interface HoverPreviewDeps {
  battlefield: Battlefield;
  fightUI(): FightUI | null;
  pathfinding(): DofusPathfinding | null;
  /**
   * Where the server says we stand. Must be the message-time cell, not
   * the animated sprite position, or the preview lags every queued
   * action by the length of its animation.
   */
  currentCellId(): number | null;
  mapDimensions(): { width: number; height: number } | null;
  /**
   * Cells occupied by fighters, used by `hasLineOfSight` as an
   * obstruction set.
   */
  occupiedCells(): Set<number>;
  /**
   * Snapshot fighter positions into the pathfinder's occupied-cell
   * set before we run findFightPath — otherwise the server rejects
   * paths that cross an enemy and the click looks swallowed. Called
   * on every hover; pathfinder state is overwritten each call.
   */
  syncOccupied(): void;
  /**
   * Per-cell LoS blocking flag (walls, decorations, glass cells flagged
   * `lineOfSight=false` in the original 1.29 map data). The Bresenham
   * walk stops on the first blocked cell, so this is what makes spells
   * actually respect cover.
   */
  losBlocked(cell: number): boolean;
}

export class HoverPreview {
  /**
   * Last cell the user hovered. Stored so we can re-fire the same hover
   * computation after off-cursor events (a fighter dying, our own move
   * animation finishing, etc.) — without it the path/AoE preview would
   * stay frozen until the mouse moves again.
   */
  private lastHovered: number | null = null;

  constructor(private readonly deps: HoverPreviewDeps) {
    deps.battlefield.setOnCellHover((cellId) => this.onHover(cellId));
  }

  /**
   * Re-evaluate the current hover. Call after server events that
   * invalidate the previous preview (death, teleport, our own move
   * complete) so the highlight catches up before the next mouse move.
   */
  refreshFromCurrentHover(): void {
    this.onHover(this.lastHovered);
  }

  private onHover(cellId: number | null): void {
    this.lastHovered = cellId;
    const ui = this.deps.fightUI();
    if (!ui) {
      return;
    }

    // Outside any cell → drop all hover-derived overlays.
    if (cellId === null) {
      ui.clearHighlightType("movement-path");
      ui.clearHighlightType("spell-zone");
      ui.clearHighlightType("spell-zone-invalid");
      spellCastActor.send({ type: "HOVER_CLEAR" });
      return;
    }

    const castSnap = spellCastActor.getSnapshot();
    if (castSnap.matches("targeting") && castSnap.context.spell) {
      this.updateSpellPreview(cellId);
      return;
    }

    this.updateMovementPreview(cellId);
  }

  private updateMovementPreview(hoveredCell: number): void {
    const ui = this.deps.fightUI();
    if (!ui) {
      return;
    }

    // Only preview when we actually can move — off-turn or during
    // placement the reachable tint isn't showing anyway.
    const fight = fightStore.getSnapshot();
    if (
      fight.mode !== "fighting" ||
      !fight.isMyTurn ||
      fight.actionPending ||
      fight.finishing ||
      fight.mp <= 0
    ) {
      // mp<=0 matches the original: once the MP is spent the reachable
      // ring disappears and so does the hovered-path hint — showing a
      // trimmed "you could walk here" overlay with zero MP is what
      // caused the path-spreads-everywhere regression.
      ui.clearHighlightType("movement-path");
      return;
    }

    const pf = this.deps.pathfinding();
    const from = this.deps.currentCellId();
    if (!pf || from === null) {
      ui.clearHighlightType("movement-path");
      return;
    }
    this.deps.syncOccupied();
    const path = fightMovementPath(fight, pf, from, hoveredCell);
    if (!path) {
      ui.clearHighlightType("movement-path");
      return;
    }
    // Skip the caster's current cell — it shouldn't look like a step.
    ui.highlightCells(path.slice(1), "movement-path" as const);
  }

  private updateSpellPreview(hoveredCell: number): void {
    const ui = this.deps.fightUI();
    if (!ui) {
      return;
    }
    const snap = spellCastActor.getSnapshot();
    const spell = snap.context.spell;
    const caster = snap.context.casterCellId;
    const dims = this.deps.mapDimensions();
    if (!spell || caster === null || !dims) {
      return;
    }

    const inRange = snap.context.targetingCells.includes(hoveredCell);
    if (!inRange) {
      // Out of range / min-range — hide AoE, flash the cell in red so
      // the player sees why nothing is about to happen.
      ui.highlightCells([hoveredCell], "spell-zone-invalid" as const);
      spellCastActor.send({
        type: "HOVER_CELL",
        cellId: hoveredCell,
        previewCells: [],
      });
      return;
    }

    // Pull the freshest occupancy snapshot every hover — the spell
    // preview used to build its own Set inline, which meant any
    // change-of-state (death, summon, teleport) between hovers could
    // leave a phantom blocker in the LoS check until the cursor moved.
    this.deps.syncOccupied();
    const occupants = this.deps.occupiedCells();
    const losBlocked = this.deps.losBlocked;
    const fmap = {
      width: dims.width,
      height: dims.height,
      occupantOf: (cell: number): number | undefined =>
        occupants.has(cell) ? cell : undefined,
      losBlocked: (cell: number): boolean => losBlocked(cell),
    };

    // LoS gate: if the spell requires LoS and the caster can't see
    // the target cell, the whole AoE is invalid.
    const state = fightStore.getSnapshot();
    const mine = state.fighters.get(state.mySpriteId ?? "");
    const losOk =
      castGeometryError(fmap, caster, hoveredCell, {
        ...spell,
        rangeBonus: mine?.rangeBonus ?? 0,
      }) === null;
    if (!losOk) {
      ui.highlightCells([hoveredCell], "spell-zone-invalid" as const);
      ui.clearHighlightType("spell-zone");
      spellCastActor.send({
        type: "HOVER_CELL",
        cellId: hoveredCell,
        previewCells: [],
      });
      return;
    }

    // For trap / glyph / summon spells the primary effect's
    // areaKind/areaSize describes the SPAWNED entity's trigger zone.
    // The canonical 1.29 client previews exactly that zone on hover
    // (the player wants to see where the glyph will trigger before
    // clicking). singleTargetSpawn is honored only by the cast
    // pipeline — preview always shows the full footprint.
    const area = cellsInArea(
      fmap,
      caster,
      hoveredCell,
      spell.areaKind,
      spell.areaSize
    );
    ui.clearHighlightType("spell-zone-invalid");
    ui.highlightCells(area, "spell-zone" as const);
    spellCastActor.send({
      type: "HOVER_CELL",
      cellId: hoveredCell,
      previewCells: area,
    });
  }
}
