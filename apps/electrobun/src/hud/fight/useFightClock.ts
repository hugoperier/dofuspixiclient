import { useEffect, useReducer } from "react";

import { readFightClock } from "./fight-clock";

/** Both gauges derive progress from the same server deadline, even after a
 * background tab throttles callbacks. Ticks never advance the fight locally. */
export function useFightClock(deadline: number, turnDurationMs: number) {
  const [, tick] = useReducer((revision: number) => revision + 1, 0);
  useEffect(() => {
    if (deadline <= Date.now()) {
      return;
    }
    const timer = setInterval(() => {
      tick();
      if (Date.now() >= deadline) {
        clearInterval(timer);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [deadline]);

  return readFightClock(deadline, turnDurationMs, Date.now());
}
