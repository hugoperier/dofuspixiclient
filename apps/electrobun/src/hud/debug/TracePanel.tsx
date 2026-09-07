"use client";

import { useSyncExternalStore } from "react";

import type { TraceChannel } from "@/utils/trace";
import { cn } from "@/lib/utils";
import {
  getTraceSnapshot,
  subscribeTrace,
  TRACE_CHANNELS,
  toggleTrace,
} from "@/utils/trace";

/**
 * The trace channels, as toggles, inside the dev performance card.
 *
 * The same thing `?trace=net,move` and `window.__trace("net,move")` do, minus
 * the reload and minus remembering the names. It sits here rather than in
 * `DebugToolbox` because that component is not mounted anywhere — this card is
 * the only debug surface actually on screen.
 *
 * Everything armed here is verbose by design: per-frame network logging,
 * per-step animation logging. Leaving a channel on costs frames, which is
 * exactly why they are off by default and why the FPS reading sits directly
 * above them.
 */

const LABELS: Record<TraceChannel, string> = {
  net: "réseau",
  move: "déplac.",
  pick: "picking",
  render: "rendu",
  machines: "machines",
};

export function TracePanel() {
  const state = useSyncExternalStore(subscribeTrace, getTraceSnapshot);

  return (
    <section className="pointer-events-auto flex flex-col gap-1.5">
      <span className="font-sans text-[10px] font-semibold tracking-[0.18em] text-neutral-500 uppercase">
        Trace
      </span>

      <div className="flex flex-wrap gap-1">
        {TRACE_CHANNELS.map((channel) => (
          <button
            key={channel}
            type="button"
            onClick={() => toggleTrace(channel, !state[channel])}
            className={cn(
              "rounded border px-1.5 py-0.5 text-[10px] transition-colors",
              state[channel]
                ? "border-amber-400/60 bg-amber-400/20 text-amber-200"
                : "border-white/10 text-neutral-500 hover:text-neutral-300"
            )}
            title={`log.trace("${channel}", …)`}
          >
            {LABELS[channel]}
          </button>
        ))}
      </div>
    </section>
  );
}
