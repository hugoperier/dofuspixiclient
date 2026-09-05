import { AdminModule } from "@features/game/admin/admin.module";
import { SelectCharacterHandler } from "@features/game/select-character/select-character.handler";
import { SelectCharacterRepository } from "@features/game/select-character/select-character.repository";
import { StatsModule } from "@modules/stats/stats.module";
import { Module } from "@nestjs/common";

@Module({
  imports: [AdminModule, StatsModule],
  providers: [SelectCharacterHandler, SelectCharacterRepository],
})
export class SelectCharacterModule {}
