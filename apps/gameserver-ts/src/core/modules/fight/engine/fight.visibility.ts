import type { Fight } from "../core/fight.entity";
import type { Fighter } from "../core/fight.fighter";

export function canPerceive(fighter: Fighter, viewer?: Fighter): boolean {
  return (
    !fighter.invisible ||
    Boolean(
      viewer && (fighter.id === viewer.id || fighter.team === viewer.team)
    )
  );
}

export function visibleSessions(fight: Fight, fighter: Fighter): string[] {
  return fight.allSessions().filter((session) =>
    canPerceive(
      fighter,
      fight.fighters().find((viewer) => viewer.sessionId === session)
    )
  );
}

export function teamSessions(fight: Fight, team: number): string[] {
  return fight
    .fighters()
    .filter((f) => f.team?.side === team && f.sessionId)
    .map((f) => f.sessionId);
}
