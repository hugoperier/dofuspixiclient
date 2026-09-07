import { describe, expect, test } from "bun:test";

import { createActor } from "xstate";

import { logBuffer } from "@/utils/logger";

import { mapTransitionMachine } from "./map-transition.machine";
import { traceInspector } from "./trace-inspector";

function machineLines(): string[] {
  return logBuffer
    .snapshot()
    .filter((entry) => entry.tag === "Machine")
    .map((entry) => entry.msg);
}

describe("traceInspector", () => {
  test("names the initial state once, as a start rather than a transition", () => {
    logBuffer.clear();

    const actor = createActor(mapTransitionMachine, {
      inspect: traceInspector("mapTransition"),
    });

    actor.start();

    expect(machineLines()).toEqual(["machine=mapTransition start → idle"]);

    actor.stop();
  });

  test("logs one line per state change, naming the event", () => {
    logBuffer.clear();

    const actor = createActor(mapTransitionMachine, {
      inspect: traceInspector("mapTransition"),
    });

    actor.start();
    actor.send({ type: "BEGIN_TRANSITION", mapId: 7412 });

    expect(machineLines()).toEqual([
      "machine=mapTransition start → idle",
      "machine=mapTransition idle --BEGIN_TRANSITION--> loadingMap",
    ]);

    actor.stop();
  });

  test("says nothing for an event that transitions nowhere", () => {
    logBuffer.clear();

    const actor = createActor(mapTransitionMachine, {
      inspect: traceInspector("mapTransition"),
    });

    actor.start();
    // `idle` has no handler for this: XState still emits a snapshot, and
    // logging it would bury the real transitions under the events that did
    // nothing.
    actor.send({ type: "MAP_ACTORS_READY", mapId: 7412, generation: 1 });

    expect(machineLines()).toEqual(["machine=mapTransition start → idle"]);

    actor.stop();
  });

  test("two actors of the same machine keep separate histories", () => {
    logBuffer.clear();

    const a = createActor(mapTransitionMachine, {
      inspect: traceInspector("a"),
    });
    const b = createActor(mapTransitionMachine, {
      inspect: traceInspector("b"),
    });

    a.start();
    b.start();
    a.send({ type: "BEGIN_TRANSITION", mapId: 1 });

    expect(machineLines()).toEqual([
      "machine=a start → idle",
      "machine=b start → idle",
      "machine=a idle --BEGIN_TRANSITION--> loadingMap",
    ]);

    a.stop();
    b.stop();
  });
});
