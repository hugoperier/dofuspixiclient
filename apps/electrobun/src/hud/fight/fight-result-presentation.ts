import type { FightExperienceProgress, GameEnd } from "@dofus/proto/game_pb";

import { RESULT } from "./fight-result-theme";

export function durationLabel(durationMs: number): string {
  let seconds = Math.max(0, Math.floor(durationMs / 1000));
  if (!seconds) {
    return "-";
  }
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  return [
    [hours, "heure"],
    [minutes, "minute"],
    [seconds, "seconde"],
  ]
    .filter(([value]) => value !== 0)
    .map(([value, unit]) => `${value} ${unit}${Number(value) > 1 ? "s" : ""}`)
    .join(" ");
}

/** Integer arithmetic keeps cumulative int64 XP precise, even above 2^53. */
export function experiencePercent(progress: FightExperienceProgress): number {
  const upper = progress.nextLevelFloor;
  if (upper === undefined) {
    return 100;
  }
  const span = upper - progress.levelFloor;
  if (span <= 0n) {
    return 0;
  }
  const earned = progress.current - progress.levelFloor;
  const clamped = earned < 0n ? 0n : earned > span ? span : earned;
  return Number((clamped * 10000n) / span) / 100;
}

export function resultLayout(result: GameEnd, width: number, height: number) {
  const winners = result.results.filter(
    (entry) => entry.team === result.winnerTeam
  );
  const losers = result.results.filter(
    (entry) => entry.team !== result.winnerTeam
  );
  const rows =
    Math.min(winners.length, RESULT.visibleRows) +
    Math.min(losers.length, RESULT.visibleRows);
  const panelHeight = RESULT.fixedHeight + rows * RESULT.rowHeight;
  const scale = Math.max(
    0,
    Math.min(
      width / RESULT.referenceWidth,
      height / RESULT.referenceHeight,
      height / (panelHeight + RESULT.closeHeight + 24)
    )
  );
  return { winners, losers, panelHeight, scale };
}
