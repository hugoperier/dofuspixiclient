import type { DofusPathfinding } from "@dofus/grid";

import type { FightState } from "@/game/stores/fight-store";

/**
 * The exact path accepted by both hover and click; never a truncated prefix.
 *
 * Deliberately blind to `presentationPending`: animations are a
 * rendering concern and must never gate what the player is allowed to
 * ask for. `actionPending` stays, and is the only barrier — it holds
 * for one server round-trip, which is what guarantees the MP and the
 * cell this path is built on are the ones the server will validate
 * against.
 */
export function fightMovementPath(
  fight: Pick<
    FightState,
    "mode" | "isMyTurn" | "mp" | "actionPending" | "finishing"
  >,
  pathfinding: DofusPathfinding,
  from: number,
  destination: number
): number[] | null {
  if (
    fight.mode !== "fighting" ||
    !fight.isMyTurn ||
    fight.actionPending ||
    fight.finishing ||
    fight.mp <= 0
  ) {
    return null;
  }
  const path = pathfinding.findFightPath(from, destination);
  return path && path.length > 1 && path.length - 1 <= fight.mp ? path : null;
}
