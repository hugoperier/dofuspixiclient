import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import { DiscoveryModule } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { Test } from "@nestjs/testing";
import { AppConfigModule } from "@shared/config/config.module";
import { DatabaseModule } from "@shared/db/db.module";
import { GatewayAdapterModule } from "@shared/gateway-adapter/gateway-adapter.module";
import { WsRouter } from "@shared/gateway-adapter/ws-router";

/**
 * Resolves `WsRouter` through the **real** module graph.
 *
 * `ws-router.spec.ts` builds its own testing module and imports
 * `ClsModule.forRoot()` into it by hand. That is fine for testing dispatch, and
 * it is exactly what hid a boot failure: `WsRouter` gained a `ClsService`
 * dependency, every unit test passed, and both cores then died on startup with
 * "Nest can't resolve dependencies of the WsRouter […] ClsService at index [3]"
 * — because `ClsModule.forRoot()` is mounted inside `DatabaseModule` and was
 * not declared `global`, so nothing outside that module could see it.
 *
 * So this test imports the modules the application imports and nothing else.
 * A provider that only resolves because a spec supplied its own imports is not
 * actually wired.
 */

const ENV = {
  MODE: "game",
  DATABASE_URL: "postgres://dofus:dofus@127.0.0.1:5432/dofus",
  NODE_ENV: "test",
};

describe("GatewayAdapterModule", () => {
  test("resolves WsRouter with only the app's own imports", async () => {
    const previous = { ...process.env };

    Object.assign(process.env, ENV);

    try {
      // No `ClsModule` here on purpose: it has to arrive through
      // `DatabaseModule`, which is how the running application gets it.
      const mod = await Test.createTestingModule({
        imports: [
          AppConfigModule,
          EventEmitterModule.forRoot({ wildcard: true, delimiter: "." }),
          DiscoveryModule,
          DatabaseModule,
          GatewayAdapterModule,
        ],
      }).compile();

      await mod.init();

      expect(mod.get(WsRouter)).toBeInstanceOf(WsRouter);

      await mod.close();
    } finally {
      process.env = previous;
    }
  });
});
