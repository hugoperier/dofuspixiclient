/** Placement has a deadline but no turn duration, so it has no turn gauge. */
export function readFightClock(
  deadline: number,
  turnDurationMs: number,
  now: number
) {
  const remainingMs = Math.max(0, deadline - now);
  return {
    seconds: Math.ceil(remainingMs / 1000),
    remainingFraction:
      deadline > 0 && turnDurationMs > 0
        ? Math.min(1, remainingMs / turnDurationMs)
        : undefined,
  };
}
