import { Direction, getDirOffsets } from "@dofus/grid";

import {
  CELL_HALF_HEIGHT,
  CELL_HALF_WIDTH,
} from "@/game/constants/battlefield";

export interface Point {
  x: number;
  y: number;
}

interface Edge {
  cell: number;
  start: Point;
  startKey: string;
  endKey: string;
}

/**
 * Trace the outer perimeter(s) of a union of cells as closed polygons,
 * one per connected sub-region.
 *
 *   1. For each cell, look at its 4 diagonal neighbours (NE/SE/SW/NW,
 *      the 4 edges of the cell's diamond). An edge is on the boundary
 *      iff that neighbour is NOT in the zone.
 *   2. Each boundary edge is directed clockwise: NE = top→right,
 *      SE = right→bottom, SW = bottom→left, NW = left→top, so
 *      consecutive boundary edges share an endpoint.
 *   3. Follow edges until every one has been emitted.
 *
 * Two zone cells that touch only at a corner (the NE and NW cells of
 * an excluded caster, a melee ring, every arm of a line-only cross)
 * make a pinch: two boundary edges leave that corner. The walk stays
 * on the cell it arrived from, which splits the pinch into two simple
 * loops. Keying edges by their start corner alone dropped one of the
 * two, and the walk then cut diagonals across the cells.
 */
export function tracePerimeterLoops(
  cellIds: ReadonlySet<number>,
  mapWidth: number,
  cellPos: (cellId: number) => Point
): Point[][] {
  const dirOffsets = getDirOffsets(mapWidth);
  const NE = dirOffsets[Direction.NORTH_EAST] ?? 0;
  const SE = dirOffsets[Direction.SOUTH_EAST] ?? 0;
  const SW = dirOffsets[Direction.SOUTH_WEST] ?? 0;
  const NW = dirOffsets[Direction.NORTH_WEST] ?? 0;

  // Corners serialised as rounded "x|y" so two edges meet without
  // floating-point fuzziness.
  const k = (p: Point): string => `${Math.round(p.x)}|${Math.round(p.y)}`;
  const edges: Edge[] = [];
  const outgoing = new Map<string, Edge[]>();
  const add = (cell: number, start: Point, end: Point): void => {
    const edge = { cell, start, startKey: k(start), endKey: k(end) };
    edges.push(edge);
    const list = outgoing.get(edge.startKey);
    if (list) {
      list.push(edge);
    } else {
      outgoing.set(edge.startKey, [edge]);
    }
  };

  for (const cellId of cellIds) {
    const pos = cellPos(cellId);
    const top = { x: pos.x, y: pos.y - CELL_HALF_HEIGHT };
    const right = { x: pos.x + CELL_HALF_WIDTH, y: pos.y };
    const bottom = { x: pos.x, y: pos.y + CELL_HALF_HEIGHT };
    const left = { x: pos.x - CELL_HALF_WIDTH, y: pos.y };
    if (!cellIds.has(cellId + NE)) {
      add(cellId, top, right);
    }
    if (!cellIds.has(cellId + SE)) {
      add(cellId, right, bottom);
    }
    if (!cellIds.has(cellId + SW)) {
      add(cellId, bottom, left);
    }
    if (!cellIds.has(cellId + NW)) {
      add(cellId, left, top);
    }
  }

  const loops: Point[][] = [];
  const used = new Set<Edge>();
  for (const seed of edges) {
    if (used.has(seed)) {
      continue;
    }
    const polygon: Point[] = [];
    let current: Edge | undefined = seed;
    while (current && !used.has(current)) {
      used.add(current);
      polygon.push(current.start);
      const from: Edge = current;
      const next: Edge[] = outgoing.get(from.endKey) ?? [];
      current = next.find((e) => e.cell === from.cell) ?? next[0];
    }
    if (polygon.length >= 3) {
      loops.push(polygon);
    }
  }
  return loops;
}
