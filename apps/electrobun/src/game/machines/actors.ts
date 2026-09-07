import { type Actor, createActor } from "xstate";

import { loginMachine } from "./login.machine";
import { mapTransitionMachine } from "./map-transition.machine";
import { spellCastMachine } from "./spell-cast.machine";
import { traceInspector } from "./trace-inspector";

/**
 * Process-wide actor instances for the orchestration machines. The fightActor
 * lives in stores/fight-store.ts so it can directly drive the store.
 */
export const loginActor: Actor<typeof loginMachine> = createActor(
  loginMachine,
  { inspect: traceInspector("login") }
);

// `mapTransitionActor` and `spellCastActor` below are NOT inspected, and that
// is deliberate: nothing sends either of them an event. Every spell-cast
// consumer imports the actor from `./spell-cast.machine` instead, and nothing
// at all consumes `mapTransitionActor`. Logging their transitions would print
// one `start →` line each and then stay silent forever, which reads as "the
// machine is fine" rather than "the machine is not wired up".
export const mapTransitionActor: Actor<typeof mapTransitionMachine> =
  createActor(mapTransitionMachine);
export const spellCastActor: Actor<typeof spellCastMachine> =
  createActor(spellCastMachine);

loginActor.start();
mapTransitionActor.start();
spellCastActor.start();
