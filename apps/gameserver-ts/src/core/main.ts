import "reflect-metadata";

import type { AuthEnv, Env, GameEnv } from "@shared/config/env.schema";
import { AppModule } from "@core/app.module";
import { Logger, ShutdownSignal } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { GatewayFrameService } from "@shared/gateway-adapter/gateway-frame.service";
import { CoreLogger, resolveLogLevel } from "@shared/logging/core-logger";
import { match } from "ts-pattern";

async function bootstrap() {
  // `MODE` decides which feature modules load and which socket is served; it
  // also names this process in every log line. Read from the environment
  // directly because the logger has to exist before the injector does — the
  // ConfigService that validates it is built by the container we are creating.
  const component = process.env.MODE === "auth" ? "authd" : "gamed";

  // Used to be the frozen array `["log", "warn", "error"]`, which silently
  // discarded every `logger.debug()` in the core — about thirty of them, all
  // written and none reachable. `LOG_LEVEL` was already set in `.env` and read
  // only by the gateway; now it reaches here too.
  const logger = new CoreLogger(
    component,
    resolveLogLevel(process.env.LOG_LEVEL, process.env.NODE_ENV)
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger,
  });

  app.enableShutdownHooks([ShutdownSignal.SIGINT, ShutdownSignal.SIGTERM]);

  await app.init();

  const boot = new Logger(component);
  const mode = app.get(ConfigService<Env, true>).get("MODE", { infer: true });

  match(mode)
    .with("game", () => {
      const config = app.get(ConfigService<GameEnv, true>);
      const sock = config.get("CORE_SOCK", { infer: true });
      const version = config.get("CORE_VERSION", { infer: true });

      app.get(GatewayFrameService).listen(sock);
      boot.log(`listening on ${sock} (version=${version})`);
    })
    .with("auth", () => {
      const config = app.get(ConfigService<AuthEnv, true>);
      const sock = config.get("AUTH_SOCK", { infer: true });

      app.get(GatewayFrameService).listen(sock);
      boot.log(`listening on ${sock}`);
    })
    .exhaustive();
}

void bootstrap();
