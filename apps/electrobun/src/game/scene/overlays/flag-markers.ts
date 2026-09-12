import { Container, Graphics } from "pixi.js";

import { getCellPosition } from "@/game/datacenter/cell";
import { Z_FIGHT_CONTAINER } from "@/game/constants/z-index";
import { fightFlagStore } from "@/hud/fight/fight-flag-store";

import { Actor, type ActorId, freshActorId } from "../actor";
import { RENDERED, type Rendered } from "../capabilities";

const DEFAULT_MAP_WIDTH = 15;
const DEFAULT_GROUND_LEVEL = 7;

// The arrow floats above the cell it points at, its tip just touching
// the tile. Sized against the 53×27 cell so it reads at 1× zoom.
const ARROW_WIDTH = 16;
const ARROW_HEIGHT = 26;
const ARROW_HOVER = 6;

const ARROW_FILL = 0xd21f1f;
const ARROW_STROKE = 0x5a0808;

/**
 * The red "look here" arrows teammates drop on a cell (`Gf` in 1.29).
 * One per sender, replaced whenever that sender points somewhere else,
 * and only ever fed by frames the server addressed to our own team.
 *
 * Drawn above the fight container so an arrow is never hidden behind a
 * fighter standing on the cell it marks.
 */
export class FlagMarkers extends Actor implements Rendered {
  readonly id: ActorId = freshActorId();
  readonly [RENDERED] = true as const;
  readonly container: Container;
  readonly zIndex = Z_FIGHT_CONTAINER + 1;

  private graphics: Graphics;
  private mapWidth = DEFAULT_MAP_WIDTH;
  private groundLevel = DEFAULT_GROUND_LEVEL;
  private unsubscribe: () => void;

  constructor(parentContainer: Container) {
    super();
    this.container = new Container();
    this.container.label = "flag-markers";
    this.container.zIndex = this.zIndex;

    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
    parentContainer.addChild(this.container);

    this.unsubscribe = fightFlagStore.subscribe(() => this.redraw());
    this.redraw();
  }

  setMapDimensions(width: number, groundLevel?: number): void {
    this.mapWidth = width;
    if (groundLevel !== undefined) {
      this.groundLevel = groundLevel;
    }
    this.redraw();
  }

  private redraw(): void {
    if (this.graphics.destroyed) {
      return;
    }
    this.graphics.clear();

    for (const cellId of fightFlagStore.getSnapshot().markers.values()) {
      const pos = getCellPosition(cellId, this.mapWidth, this.groundLevel);
      this.drawArrow(pos.x, pos.y - ARROW_HOVER);
    }
  }

  /** A downward-pointing arrow whose tip sits at (x, y). */
  private drawArrow(x: number, y: number): void {
    const halfShaft = ARROW_WIDTH / 4;
    const halfHead = ARROW_WIDTH / 2;
    const headTop = y - ARROW_HEIGHT / 2;
    const top = y - ARROW_HEIGHT;

    this.graphics
      .moveTo(x, y)
      .lineTo(x - halfHead, headTop)
      .lineTo(x - halfShaft, headTop)
      .lineTo(x - halfShaft, top)
      .lineTo(x + halfShaft, top)
      .lineTo(x + halfShaft, headTop)
      .lineTo(x + halfHead, headTop)
      .closePath()
      .fill({ color: ARROW_FILL })
      .stroke({ color: ARROW_STROKE, width: 1 });
  }

  destroy(): void {
    this.dispose();
  }

  /** Scene calls this on remove(id) / clear(). Idempotent. */
  dispose(): void {
    this.unsubscribe();

    if (!this.graphics.destroyed) {
      this.graphics.destroy();
    }
    if (!this.container.destroyed) {
      this.container.destroy();
    }
  }
}
