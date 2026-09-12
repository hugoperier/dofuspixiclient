import { SpellsFramesService } from "@modules/spells/spells.frames.service";
import { SpellsRepository } from "@modules/spells/spells.repository";
import { SpellsService } from "@modules/spells/spells.service";
import { Module } from "@nestjs/common";

/**
 * Imports nothing, still. The close-combat attack needs the equipped
 * weapon, but `PlayersModule` already imports this one and the
 * inventory depends on players — so reaching for `InventoryModule` here
 * would close a cycle. `SpellsRepository.findEquippedWeapon` reads the
 * one row directly instead, and the reverse direction (telling a client
 * its spell list changed when the weapon does) travels as a domain
 * event.
 */
@Module({
  providers: [SpellsRepository, SpellsService, SpellsFramesService],
  exports: [SpellsService, SpellsRepository, SpellsFramesService],
})
export class SpellsModule {}
