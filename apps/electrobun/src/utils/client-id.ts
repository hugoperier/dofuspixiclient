/**
 * A short id for this browser tab, minted once and kept for the tab's life.
 *
 * It exists for one reason: the gateway mints the `sessionId` and never sends
 * it to the client (it is stripped from the envelope before the WebSocket
 * write, `gateway/session-registry.ts`), and no client-facing protobuf carries
 * a correlation field. Without a shared token, a client log line and a server
 * log line about the same click cannot be joined.
 *
 * So the client brings its own: the id rides the WebSocket query string, the
 * gateway logs the `clientId` ↔ `sessionId` pair once per connection, and a
 * single `grep` then stitches the two journals together.
 *
 * `sessionStorage`, not `localStorage`: two tabs are two players, and they must
 * not share an id. It survives a reload — which reproducing a bug usually
 * takes — and dies with the tab.
 */

const STORAGE_KEY = "dofus:clientId";

function mint(): string {
  // Short enough to read in a log line, wide enough not to collide across the
  // handful of tabs a dev session ever has open.
  return Math.random().toString(36).slice(2, 8);
}

let cached: string | null = null;

export function getClientId(): string {
  if (cached !== null) {
    return cached;
  }

  try {
    const stored = globalThis.sessionStorage?.getItem(STORAGE_KEY);

    if (stored !== null && stored !== undefined && stored.length > 0) {
      cached = stored;
      return cached;
    }
  } catch {
    // Private mode, or a shell without sessionStorage: fall through and mint
    // a per-load id rather than failing.
  }

  cached = mint();

  try {
    globalThis.sessionStorage?.setItem(STORAGE_KEY, cached);
  } catch {
    // Not remembering it costs correlation across a reload, nothing more.
  }

  return cached;
}
