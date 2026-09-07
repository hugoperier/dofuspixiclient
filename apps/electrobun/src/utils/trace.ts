import { IS_DEV_BUILD } from "./build-env";

/**
 * Trace channels — the verbose instrumentation that is *off* by default
 * because leaving it on would cost the client real frames.
 *
 * Everything cheap enough to run permanently lives in the ordinary logger
 * (`./logger`) instead; this module is only for the sondes that fire on a hot
 * path: every network frame, every animation step, every hit-test.
 *
 * The contract that makes them free when off: a channel is a boolean read,
 * and `log.trace(channel, () => …)` never evaluates its thunk unless the
 * channel is armed. Building the message eagerly and letting the logger drop
 * it — which is what `log.debug(`…${x}…`)` does — is precisely what these
 * channels exist to avoid.
 *
 * Dev builds only. In a production bundle `isTraceOn` is a constant `false`
 * and nothing here can be turned on.
 */

/** Every channel, in the order the debug toolbox lists them. */
export const TRACE_CHANNELS = [
  "net",
  "move",
  "pick",
  "render",
  "machines",
] as const;

export type TraceChannel = (typeof TRACE_CHANNELS)[number];

export type TraceState = Readonly<Record<TraceChannel, boolean>>;

const STORAGE_KEY = "dofus:trace";

const NONE: TraceState = Object.freeze({
  net: false,
  move: false,
  pick: false,
  render: false,
  machines: false,
});

function isChannel(raw: string): raw is TraceChannel {
  return (TRACE_CHANNELS as readonly string[]).includes(raw);
}

/**
 * Parses the wire form used by both the query string and localStorage:
 * a comma-separated channel list, or `all` / `1` for every channel.
 *
 * Unknown names are ignored rather than fatal — a typo in a URL should cost
 * you that channel, not the page.
 */
export function parseTraceSpec(raw: string | null | undefined): TraceState {
  if (raw === null || raw === undefined) {
    return NONE;
  }

  const trimmed = raw.trim();

  if (trimmed.length === 0 || trimmed === "0" || trimmed === "false") {
    return NONE;
  }

  const next: Record<TraceChannel, boolean> = { ...NONE };

  if (trimmed === "all" || trimmed === "1" || trimmed === "true") {
    for (const channel of TRACE_CHANNELS) {
      next[channel] = true;
    }

    return Object.freeze(next);
  }

  for (const part of trimmed.split(",")) {
    const name = part.trim();

    if (isChannel(name)) {
      next[name] = true;
    }
  }

  return Object.freeze(next);
}

/** The inverse of `parseTraceSpec`, for persistence. */
export function formatTraceSpec(state: TraceState): string {
  return TRACE_CHANNELS.filter((channel) => state[channel]).join(",");
}

let current: TraceState = NONE;
const listeners = new Set<() => void>();

function readStored(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    // Private mode, or a shell without localStorage at all.
    return null;
  }
}

function writeStored(spec: string): void {
  try {
    if (spec.length === 0) {
      globalThis.localStorage?.removeItem(STORAGE_KEY);
    } else {
      globalThis.localStorage?.setItem(STORAGE_KEY, spec);
    }
  } catch {
    // Not being able to remember the setting is not worth an exception.
  }
}

function readQuery(): string | null {
  try {
    const search = globalThis.location?.search;

    if (search === undefined) {
      return null;
    }

    return new URLSearchParams(search).get("trace");
  } catch {
    return null;
  }
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Reads the armed channels from the URL, falling back to what was stored.
 *
 * A `?trace=` in the URL wins *and* is written back, so arming a channel to
 * reproduce something survives the reloads that reproducing usually takes.
 */
export function initTrace(): void {
  if (!IS_DEV_BUILD) {
    return;
  }

  const fromQuery = readQuery();

  if (fromQuery !== null) {
    current = parseTraceSpec(fromQuery);
    writeStored(formatTraceSpec(current));
  } else {
    current = parseTraceSpec(readStored());
  }

  notify();
}

/**
 * Whether `channel` is armed. The hot-path guard — keep it a plain property
 * read, and keep every caller's message construction behind it.
 */
export function isTraceOn(channel: TraceChannel): boolean {
  return IS_DEV_BUILD && current[channel];
}

/** True when at least one channel is armed. */
export function isAnyTraceOn(): boolean {
  return IS_DEV_BUILD && TRACE_CHANNELS.some((channel) => current[channel]);
}

/**
 * Arms channels. Accepts the same spec as the query string, a channel array,
 * or `false` to disarm everything.
 */
export function setTrace(
  spec: string | readonly TraceChannel[] | false
): TraceState {
  if (!IS_DEV_BUILD) {
    return NONE;
  }

  if (spec === false) {
    current = NONE;
  } else if (typeof spec === "string") {
    current = parseTraceSpec(spec);
  } else {
    current = parseTraceSpec(spec.join(","));
  }

  writeStored(formatTraceSpec(current));
  notify();

  return current;
}

/** Arms or disarms a single channel, leaving the others alone. */
export function toggleTrace(channel: TraceChannel, on: boolean): TraceState {
  const next: Record<TraceChannel, boolean> = { ...current, [channel]: on };

  return setTrace(formatTraceSpec(Object.freeze(next)));
}

/** `useSyncExternalStore` pair, for the debug toolbox. */
export function subscribeTrace(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function getTraceSnapshot(): TraceState {
  return current;
}
