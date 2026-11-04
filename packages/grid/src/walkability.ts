/** The two map-data fields that decide whether a cell can be walked on. */
export interface CellMovement {
  /** Absent means active, as in the 1.29 map data. */
  active?: boolean;
  movement?: number;
}

/**
 * Whether a fighter may stand on, or walk across, `cell`.
 *
 * `movement = 1` marks holes, doors, zaaps and resources. Roleplay may still
 * end a walk on one, but a fight never touches them: `InteractionsManager.as:69`
 * refuses such a cell as a destination when `bIsFight`, and
 * `Pathfinding.as:157` only opens one when it is that destination. Inactive
 * cells are closed in every mode.
 *
 * The server builds its fight map from this rule, so the client must preview
 * and send paths with it too, or the server rejects the move.
 */
export function isFightWalkable(cell: CellMovement): boolean {
  return cell.active !== false && (cell.movement ?? 0) > 1;
}
