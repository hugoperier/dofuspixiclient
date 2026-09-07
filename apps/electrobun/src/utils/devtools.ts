import type { LogEntry } from "./log-buffer";
import type { TraceChannel, TraceState } from "./trace";
import { IS_DEV_BUILD } from "./build-env";
import { getClientId } from "./client-id";
import { flushLogsNow, startLogShipper } from "./log-shipper";
import { dumpLogs, logBuffer } from "./logger";
import { getTraceSnapshot, initTrace, setTrace, TRACE_CHANNELS } from "./trace";

/**
 * The console handles for a debugging session, and the one place that starts
 * the logging machinery.
 *
 * Everything here is dev-build only. Nothing was attached to `window` before
 * this, so none of these names can collide.
 *
 *   __trace("net,move")   arm channels (also `?trace=net,move` in the URL)
 *   __trace(false)        disarm everything
 *   __trace()             what is armed right now
 *   __dumpLogs()          the ring buffer, oldest first
 *   __flushLogs()         push it to /tmp/dofus-logs/client.log now
 *   __clearLogs()         drop the history
 *   __clientId()          the id that joins these logs to the server's
 */

interface DofusDevtools {
  __trace: (spec?: string | readonly TraceChannel[] | false) => TraceState;
  __dumpLogs: () => readonly LogEntry[];
  __flushLogs: () => Promise<void>;
  __clearLogs: () => void;
  __clientId: () => string;
  __traceChannels: readonly TraceChannel[];
}

export function installDevtools(): void {
  if (!IS_DEV_BUILD) {
    return;
  }

  initTrace();
  startLogShipper();

  const api: DofusDevtools = {
    __trace: (spec) =>
      spec === undefined ? getTraceSnapshot() : setTrace(spec),
    __dumpLogs: dumpLogs,
    __flushLogs: flushLogsNow,
    __clearLogs: () => {
      logBuffer.clear();
    },
    __clientId: getClientId,
    __traceChannels: TRACE_CHANNELS,
  };

  Object.assign(globalThis, api);
}
