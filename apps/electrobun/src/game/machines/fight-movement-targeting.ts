import type { DofusPathfinding } from "@dofus/grid";

import type { FightState } from "@/game/stores/fight-store";

/** The exact path accepted by both hover and click; never a truncated prefix. */
export function fightMovementPath(
  fight: Pick<
    FightState,
    | "mode"
    | "isMyTurn"
    | "mp"
    | "actionPending"
    | "presentationPending"
    | "finishing"
  >,
  pathfinding: DofusPathfinding,
  from: number,
  destination: number
): number[] | null {
  if (
    fight.mode !== "fighting" ||
    !fight.isMyTurn ||
    fight.actionPending ||
    fight.presentationPending ||
    fight.finishing ||
    fight.mp <= 0
  ) {
    return null;
  }
  const path = pathfinding.findFightPath(from, destination);
  return path && path.length > 1 && path.length - 1 <= fight.mp ? path : null;
}
