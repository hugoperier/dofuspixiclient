import { IS_DEV_BUILD } from "./build-env";
import { getClientId } from "./client-id";
import { logBuffer } from "./logger";

/**
 * Drains the client log ring to disk, next to the server journals.
 *
 * The sink is a middleware on the **Vite dev server** (`clientLogSinkPlugin`
 * in `vite.config.ts`), not a route on the gateway. The gateway is the
 * production front door and is deliberately started without watch mode
 * because it must not restart; hanging a debug route off it would mean
 * bouncing every session to iterate on the logging. Vite is already running
 * whenever the client is (`scripts/dev.sh` runs `bun run hmr`), already has two
 * middleware plugins, and does not exist in a production build at all.
 *
 * Failure is not an error here: no sink (a desktop shell, a built bundle, the
 * dev server restarting) just means the entries stay in the ring, which is
 * where `window.__dumpLogs()` reads them from anyway.
 */

const ENDPOINT = "/__log";
const FLUSH_INTERVAL_MS = 2_000;
/** Cap on one POST, so a burst does not turn into a multi-megabyte body. */
const MAX_BATCH = 400;

let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

function body(entries: readonly unknown[]): string {
  return JSON.stringify({ clientId: getClientId(), entries });
}

async function flush(): Promise<void> {
  // One POST at a time: overlapping flushes could interleave a failed batch
  // back in front of a newer one and scramble the file's ordering.
  if (inFlight) {
    return;
  }

  const batch = logBuffer.drain(MAX_BATCH);

  if (batch.length === 0) {
    return;
  }

  inFlight = true;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body(batch),
      keepalive: true,
    });

    if (!res.ok) {
      logBuffer.unshift(batch);
    }
  } catch {
    // Sink down: keep the entries rather than losing them.
    logBuffer.unshift(batch);
  } finally {
    inFlight = false;
  }
}

/**
 * Last-gasp flush. `fetch` is not guaranteed to survive a page teardown;
 * `sendBeacon` is exactly the API for this, and the tail of the buffer is the
 * most interesting part when a session ends badly.
 */
function flushOnUnload(): void {
  const batch = logBuffer.drain(MAX_BATCH);

  if (batch.length === 0) {
    return;
  }

  try {
    const blob = new Blob([body(batch)], { type: "application/json" });

    if (!navigator.sendBeacon(ENDPOINT, blob)) {
      logBuffer.unshift(batch);
    }
  } catch {
    logBuffer.unshift(batch);
  }
}

export function startLogShipper(): void {
  if (!IS_DEV_BUILD || timer !== null) {
    return;
  }

  timer = setInterval(() => {
    void flush();
  }, FLUSH_INTERVAL_MS);

  globalThis.addEventListener?.("pagehide", flushOnUnload);
}

export function stopLogShipper(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }

  globalThis.removeEventListener?.("pagehide", flushOnUnload);
}

/** Forces a flush now — used by `window.__flushLogs()`. */
export function flushLogsNow(): Promise<void> {
  return flush();
}
