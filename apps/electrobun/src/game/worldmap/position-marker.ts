import type { Graphics } from "pixi.js";

import { WORLDMAP_CONSTANTS } from "@/game/types/worldmap";

/**
 * Le repère de la position du joueur, partagé par la carte du monde et la
 * minimap — les deux en avaient une copie mot pour mot.
 *
 * Le 1.29 pose un `UI_MapExplorerSelectRectangle` : un rectangle **creux** de
 * la taille d'une case, en `MAP_CURRENT_POSITION` (`0xFF0000`). Ici c'était un
 * aplat rouge à 50 % qui masquait le décor dessous — QA-009 et QA-030.
 */
export function drawPositionMarker(
  target: Graphics,
  pixelX: number,
  pixelY: number,
  color = 0xff0000
): void {
  const cellW =
    WORLDMAP_CONSTANTS.DISPLAY_WIDTH / WORLDMAP_CONSTANTS.CHUNK_SIZE;
  const cellH =
    WORLDMAP_CONSTANTS.DISPLAY_HEIGHT / WORLDMAP_CONSTANTS.CHUNK_SIZE;

  target.clear();
  target.rect(pixelX - cellW / 2, pixelY - cellH / 2, cellW, cellH);
  target.stroke({ color, width: 2, alignment: 0.5 });
}

/**
 * Le drapeau d'un marqueur posé par le joueur : une hampe et un fanion, calés
 * sur le coin bas-gauche de la case pour ne pas recouvrir ce qu'ils désignent.
 */
export function drawMarkerFlag(
  target: Graphics,
  pixelX: number,
  pixelY: number,
  color: number
): void {
  const cellH =
    WORLDMAP_CONSTANTS.DISPLAY_HEIGHT / WORLDMAP_CONSTANTS.CHUNK_SIZE;
  const height = cellH * 1.4;
  const flagW = height * 0.55;
  const flagH = height * 0.4;
  const footX = pixelX;
  const footY = pixelY + cellH / 2;

  target.clear();

  target.moveTo(footX, footY);
  target.lineTo(footX, footY - height);
  target.stroke({ color: 0x000000, width: 2 });

  target.poly([
    footX,
    footY - height,
    footX + flagW,
    footY - height + flagH / 2,
    footX,
    footY - height + flagH,
  ]);
  target.fill({ color });
  target.stroke({ color: 0x000000, width: 1 });
}
