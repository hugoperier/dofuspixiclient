import type { Message } from "@bufbuild/protobuf";
import type { InstanceWrapper } from "@nestjs/core/injector/instance-wrapper";
import type { CoreClsStore } from "@shared/logging/core-log-context";
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import {
  MESSAGE_HANDLER_METADATA,
  type MessageHandlerMeta,
} from "@shared/gateway-adapter/message-handler.decorator";
import { SessionRegistry } from "@shared/gateway-adapter/session-registry";
import { ClsService } from "nestjs-cls";

export type HandlerContext = { sessionId: string };

export type HandlerFn<M extends Message = Message> = (
  ctx: HandlerContext,
  msg: M
) => Promise<void> | void;

// typeName → [handler, ...] dispatch table, built once at boot from
// @MessageHandler-decorated methods. Multiple handlers may claim the same
// proto typeName (e.g. each GameActionRequest sub-type gets its own slice).
// Dispatch fans out; slices self-filter on the discriminator they care about.

@Injectable()
export class WsRouter implements OnModuleInit {
  private readonly logger = new Logger(WsRouter.name);
  private readonly handlers = new Map<string, HandlerFn[]>();
  /** Distinguishes two frames of the same type from the same session. */
  private nextReqId = 0;

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
    private readonly cls: ClsService<CoreClsStore>,
    private readonly sessions: SessionRegistry
  ) {}

  onModuleInit() {
    this.build();
  }

  build() {
    this.handlers.clear();

    for (const wrapper of this.discovery.getProviders()) {
      this.registerProvider(wrapper);
    }

    const total = Array.from(this.handlers.values()).reduce(
      (sum, list) => sum + list.length,
      0
    );

    this.logger.log(
      `registered ${total} message handler(s) across ${this.handlers.size} type(s)`
    );
  }

  private registerProvider(wrapper: InstanceWrapper) {
    const { instance } = wrapper;

    if (!instance || typeof instance !== "object") {
      return;
    }

    const proto = Object.getPrototypeOf(instance);

    if (!proto) {
      return;
    }

    for (const method of this.scanner.getAllMethodNames(proto)) {
      const fn = (instance as Record<string, unknown>)[method];

      if (typeof fn !== "function") {
        continue;
      }

      const meta = this.reflector.get<MessageHandlerMeta | undefined>(
        MESSAGE_HANDLER_METADATA,
        fn
      );

      if (!meta) {
        continue;
      }

      const bound = (fn as HandlerFn).bind(instance);
      const list = this.handlers.get(meta.typeName) ?? [];

      list.push(bound);
      this.handlers.set(meta.typeName, list);
    }
  }

  async dispatch<M extends Message>(
    ctx: HandlerContext,
    msg: M
  ): Promise<void> {
    // One CLS context per inbound frame. Everything logged underneath — in the
    // handler, in the modules it calls, however deep the await chain goes —
    // then carries the session, and `grep sid=…` reads one player's whole
    // session out of a shared journal. `ClsModule.forRoot()` is already global
    // (shared/db/db.module.ts) for the transactional plugin; this rides on it.
    return this.cls.run(() => {
      this.cls.set("sessionId", ctx.sessionId);
      this.cls.set("reqId", ++this.nextReqId);
      this.cls.set("msg", msg.$typeName);

      // Read per frame rather than cached when the session opens: a session
      // starts without a character and gains one at select-character, so
      // caching would leave every later line unattributed.
      const characterId = this.sessions.get(ctx.sessionId)?.characterId;

      if (characterId !== undefined && characterId.length > 0) {
        this.cls.set("characterId", characterId);
      }

      return this.dispatchInContext(ctx, msg);
    });
  }

  private async dispatchInContext<M extends Message>(
    ctx: HandlerContext,
    msg: M
  ): Promise<void> {
    const list = this.handlers.get(msg.$typeName);

    if (!list || list.length === 0) {
      this.logger.warn(
        `no handler for ${msg.$typeName} (session=${ctx.sessionId})`
      );
      return;
    }

    for (const handler of list) {
      try {
        await handler(ctx, msg);
      } catch (err) {
        this.logger.error(`handler ${msg.$typeName} threw`, err as Error);
      }
    }
  }
}
