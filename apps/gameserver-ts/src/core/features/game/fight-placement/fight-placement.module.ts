import { FightPlacementHandler } from "@features/game/fight-placement/fight-placement.handler";
import { PlayerPresenceModule } from "@modules/player-presence/player-presence.module";
import { Module } from "@nestjs/common";

@Module({
  imports: [PlayerPresenceModule],
  providers: [FightPlacementHandler],
})
export class FightPlacementModule {}
