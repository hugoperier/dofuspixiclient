import type { ClsStore } from "nestjs-cls";
import { ClsServiceManager } from "nestjs-cls";

/**
 * What a core log line carries besides its message, so that a line from gamed
 * and a line from the client can be recognised as being about the same click.
 *
 * The gateway mints `sessionId` and never sends it to the client — it is
 * stripped from the envelope before the WebSocket write — so the join runs the
 * other way: the client brings a `clientId` on the WebSocket query string, the
 * gateway logs the pair once, and from there `sessionId` identifies the player
 * in every core line.
 */
export interface CoreClsStore extends ClsStore {
  sessionId?: string;
  characterId?: string;
  /** Monotonic per-frame id, so two clicks a second apart never blur together. */
  reqId?: number;
  /** The protobuf message type that opened this context. */
  msg?: string;
}

/**
 * Reads the correlation of the frame being handled.
 *
 * `nestjs-cls` is already a dependency and `ClsModule.forRoot()` is already
 * global (`shared/db/db.module.ts` mounts it for the transactional plugin), so
 * this costs nothing new. `ClsServiceManager.getClsService()` is the documented
 * way to reach it outside of DI — which the logger has to be, since Nest builds
 * it before the injector exists.
 */
export function readLogContext(): CoreClsStore {
  const cls = ClsServiceManager.getClsService<CoreClsStore>();

  if (!cls.isActive()) {
    return {};
  }

  return {
    sessionId: cls.get("sessionId"),
    characterId: cls.get("characterId"),
    reqId: cls.get("reqId"),
    msg: cls.get("msg"),
  };
}

/** `sid=1a2b3c4d cid=42 req=17` — empty string when nothing is known. */
export function formatLogContext(ctx: CoreClsStore): string {
  const parts: string[] = [];

  if (ctx.sessionId !== undefined) {
    // The first segment of the UUID is plenty to correlate by, and keeps the
    // line readable in a terminal.
    parts.push(`sid=${ctx.sessionId.slice(0, 8)}`);
  }

  if (ctx.characterId !== undefined) {
    parts.push(`cid=${ctx.characterId}`);
  }

  if (ctx.reqId !== undefined) {
    parts.push(`req=${ctx.reqId}`);
  }

  return parts.join(" ");
}
