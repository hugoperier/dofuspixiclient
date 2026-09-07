import { expect, test } from "bun:test";

import { readFightClock } from "./fight-clock";

test("gauges use the server duration, including after a throttled callback", () => {
  const startedAt = 1_000;
  const duration = 12_000;
  const deadline = startedAt + duration;
  expect(readFightClock(deadline, duration, startedAt).remainingFraction).toBe(
    1
  );
  expect(readFightClock(deadline, duration, startedAt + 6_000)).toEqual({
    seconds: 6,
    remainingFraction: 0.5,
  });
  // A background tab jumps straight to the real elapsed time.
  expect(readFightClock(deadline, duration, startedAt + 11_250)).toEqual({
    seconds: 1,
    remainingFraction: 0.0625,
  });
  expect(readFightClock(deadline, duration, deadline + 10_000)).toEqual({
    seconds: 0,
    remainingFraction: 0,
  });
});

test("placement and reset do not produce a turn gauge", () => {
  expect(readFightClock(46_000, 0, 1_000)).toEqual({
    seconds: 45,
    remainingFraction: undefined,
  });
  expect(readFightClock(0, 0, 1_000)).toEqual({
    seconds: 0,
    remainingFraction: undefined,
  });
  expect(readFightClock(46_000, -1, 1_000).remainingFraction).toBeUndefined();
});

test("a new turn starts full and the gauge never exceeds its bounds", () => {
  expect(readFightClock(31_000, 30_000, 31_000).remainingFraction).toBe(0);
  expect(readFightClock(51_000, 20_000, 31_000).remainingFraction).toBe(1);
  expect(readFightClock(51_000, 20_000, 30_000).remainingFraction).toBe(1);
});
