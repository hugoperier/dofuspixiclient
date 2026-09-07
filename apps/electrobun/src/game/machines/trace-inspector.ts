import type { InspectionEvent } from "xstate";

import { createLogger } from "@/utils/logger";

const log = createLogger("Machine");

/**
 * Logs every state change of an XState actor.
 *
 * The machines were the one part of the client that said nothing at all: a
 * `mapTransition` stuck in `loadingActors`, or a `fight` that never left
 * `placement`, looked exactly like a client that had stopped responding to
 * clicks, with no way to tell the two apart after the fact.
 *
 * Pass it at creation — `createActor(m, { inspect: traceInspector("fight") })`.
 * The name is given rather than read off the actor because XState numbers the
 * root actor `x:0`, which says nothing in a journal. Invoked children keep
 * their own id, appended.
 *
 * The line is:
 *
 *   machine=fight idle --TURN_START--> playing
 *
 * Only actual changes are logged. XState emits a snapshot for every event an
 * actor receives, including the ones that transition nowhere; logging those
 * would bury the transitions that matter under the events that did nothing.
 */

/** Last state value seen per actor, so a no-op event does not print a line. */
const lastValue = new WeakMap<object, string>();

function describeValue(snapshot: unknown): string | undefined {
  if (typeof snapshot !== "object" || snapshot === null) {
    return undefined;
  }

  const value = (snapshot as { value?: unknown }).value;

  if (value === undefined) {
    return undefined;
  }

  return typeof value === "string" ? value : JSON.stringify(value);
}

/** XState's generated ids — `x:0`, `x:1` — carry no meaning worth printing. */
const GENERATED_ID = /^x:\d+$/;

function label(name: string, event: InspectionEvent): string {
  const id = (event.actorRef as { id?: unknown }).id;

  if (typeof id !== "string" || GENERATED_ID.test(id)) {
    return name;
  }

  return `${name}/${id}`;
}

export function traceInspector(name: string): (event: InspectionEvent) => void {
  return (event) => {
    if (event.type !== "@xstate.snapshot") {
      return;
    }

    const next = describeValue(event.snapshot);

    if (next === undefined) {
      return;
    }

    const ref = event.actorRef as object;
    const previous = lastValue.get(ref);

    lastValue.set(ref, next);

    // The first snapshot has no predecessor: that is the initial state, not a
    // transition, and it is worth exactly one line saying so.
    if (previous === undefined) {
      log.info(`machine=${label(name, event)} start → ${next}`);
      return;
    }

    if (previous === next) {
      return;
    }

    log.info(
      `machine=${label(name, event)} ${previous} ` +
        `--${event.event.type}--> ${next}`
    );
  };
}
