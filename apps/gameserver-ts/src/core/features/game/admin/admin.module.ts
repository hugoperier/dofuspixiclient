import { InventoryModule } from "@modules/inventory/inventory.module";
import { MapsModule } from "@modules/maps/maps.module";
import { PlayerPresenceModule } from "@modules/player-presence/player-presence.module";
import { SpellsModule } from "@modules/spells/spells.module";
import { StatsModule } from "@modules/stats/stats.module";
import { Module } from "@nestjs/common";

import { AdminHandler } from "./admin.handler";
import { AdminRepository } from "./admin.repository";
import { AdminService } from "./admin.service";

@Module({
  imports: [
    InventoryModule,
    MapsModule,
    PlayerPresenceModule,
    SpellsModule,
    StatsModule,
  ],
  providers: [AdminRepository, AdminService, AdminHandler],
  exports: [AdminService],
})
export class AdminModule {}
