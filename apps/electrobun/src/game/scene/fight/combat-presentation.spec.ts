import { expect, jest, test } from "bun:test";

import { CombatPresentation } from "./combat-presentation";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const tick = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

test("different fighters never start movement together", async () => {
  const queue = new CombatPresentation();
  const first = deferred();
  const starts: string[] = [];
  queue.move("one", [200, 215], async () => {
    starts.push("one");
    await first.promise;
  });
  queue.move("two", [230, 245], async () => {
    starts.push("two");
  });
  await tick();
  expect(starts).toEqual(["one"]);
  first.resolve();
  await queue.whenIdle();
  expect(starts).toEqual(["one", "two"]);
});

test("damage follows impact, next action waits for blocking completion, cleanup may continue", async () => {
  const queue = new CombatPresentation();
  const impact = deferred(),
    finished = deferred(),
    cleanup = deferred();
  const events: string[] = [];
  queue.begin(1);
  queue.enqueue(() => ({
    impact: impact.promise,
    finished: finished.promise,
    cleanup: cleanup.promise,
  }));
  queue.enqueue(() => {
    events.push("damage");
  });
  queue.finish(1);
  queue.begin(2);
  queue.enqueue(() => {
    events.push("next");
  });
  queue.finish(2);
  await tick();
  expect(events).toEqual([]);
  impact.resolve();
  await tick();
  expect(events).toEqual(["damage"]);
  finished.resolve();
  await queue.whenIdle();
  expect(events).toEqual(["damage", "next"]);
  cleanup.resolve();
});

test("continuous steps merge across MP packets but a trap interrupts the path", async () => {
  const queue = new CombatPresentation();
  const paths: number[][] = [];
  const present = async (path: number[]) => {
    paths.push(path);
  };
  queue.begin(4);
  queue.move("one", [200, 215], present);
  queue.enqueue(() => {}, { statistic: true });
  queue.move("one", [215, 230], present);
  queue.move("one", [230, 245], present);
  queue.enqueue(() => {
    paths.push([]);
  }); // trap impact
  queue.move("one", [245, 260], present);
  queue.finish(3); // stale GAF
  await tick();
  expect(paths).toEqual([]);
  queue.finish(4);
  await queue.whenIdle();
  expect(paths).toEqual([[200, 215, 230, 245], [], [245, 260]]);
});

test("old callbacks cannot clear a new combat or present its pending steps", async () => {
  const queue = new CombatPresentation();
  const old = deferred();
  const events: string[] = [];
  queue.enqueue(async (scope) => {
    await old.promise;
    if (scope.isCurrent()) {
      events.push("stale");
    }
  });
  queue.enqueue(() => {
    events.push("old next");
  });
  await tick();
  queue.reset();
  queue.enqueue(() => {
    events.push("new");
  });
  await queue.whenIdle();
  old.resolve();
  await tick();
  expect(events).toEqual(["new"]);
  expect(queue.busy).toBe(false);
});

test("a failed animation releases the queue and invalidates its late callbacks", async () => {
  jest.useFakeTimers();
  const errors: unknown[] = [];
  const queue = new CombatPresentation(
    () => {},
    (error) => errors.push(error)
  );
  const hung = deferred();
  const events: string[] = [];
  try {
    queue.enqueue(async (scope) => {
      await hung.promise;
      if (scope.isCurrent()) {
        events.push("late");
      }
    });
    queue.enqueue(() => {
      events.push("next");
    });
    await tick();
    jest.advanceTimersByTime(15_000);
    await queue.whenIdle();
    hung.resolve();
    await tick();
    expect(errors).toHaveLength(1);
    expect(events).toEqual(["next"]);
  } finally {
    queue.reset();
    jest.useRealTimers();
  }
});
