import type { Env } from "@shared/config/env.schema";
import { Global, Inject, Module, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ClsPluginTransactional } from "@nestjs-cls/transactional";
import { TransactionalAdapterKysely } from "@nestjs-cls/transactional-adapter-kysely";
import { createDatabase, type Database } from "@shared/db/database";
import { ClsModule } from "nestjs-cls";

export const DATABASE = Symbol.for("dofus:database");

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Database =>
        createDatabase(config.get("DATABASE_URL", { infer: true })),
    },
  ],
  exports: [DATABASE],
})
export class KyselyInstanceModule implements OnModuleDestroy {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async onModuleDestroy() {
    await this.db.destroy();
  }
}

@Global()
@Module({
  imports: [
    KyselyInstanceModule,
    // `global: true` so `ClsService` can be injected outside this module —
    // `WsRouter` opens a CLS context per inbound frame to carry the session
    // into every log line underneath it. Without it, only the transactional
    // plugin (which reaches CLS through its own module) could see the store,
    // and the router's constructor cannot be resolved at all.
    ClsModule.forRoot({
      global: true,
      plugins: [
        new ClsPluginTransactional({
          imports: [KyselyInstanceModule],
          adapter: new TransactionalAdapterKysely({
            kyselyInstanceToken: DATABASE,
          }),
        }),
      ],
    }),
  ],
  exports: [KyselyInstanceModule],
})
export class DatabaseModule {}
