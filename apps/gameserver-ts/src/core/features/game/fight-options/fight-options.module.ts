import { FightOptionsHandler } from "@features/game/fight-options/fight-options.handler";
import { Module } from "@nestjs/common";

@Module({
  providers: [FightOptionsHandler],
})
export class FightOptionsModule {}
