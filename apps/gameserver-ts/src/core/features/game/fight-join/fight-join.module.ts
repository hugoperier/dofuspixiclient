import { FightStartModule } from "@features/game/fight-start/fight-start.module";
import { ExchangeModule } from "@modules/exchange/exchange.module";
import { HarvestModule } from "@modules/harvest/harvest.module";
import { FightJoinHandler } from "@features/game/fight-join/fight-join.handler";
import { PlayerPresenceModule } from "@modules/player-presence/player-presence.module";
import { PlayersModule } from "@modules/players/players.module";
import { StatsModule } from "@modules/stats/stats.module";
import { Module } from "@nestjs/common";

@Module({
  imports: [FightStartModule, ExchangeModule, HarvestModule, PlayerPresenceModule, PlayersModule, StatsModule],
  providers: [FightJoinHandler],
})
export class FightJoinModule {}
