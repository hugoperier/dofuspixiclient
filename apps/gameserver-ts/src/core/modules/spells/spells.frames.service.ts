import { create } from "@bufbuild/protobuf";
import { DofusMessageSchema } from "@dofus/proto/server_messages_pb";
import { SpellListSchema } from "@dofus/proto/spells_pb";
import { SpellsService } from "@modules/spells/spells.service";
import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { GatewayFrameService } from "@shared/gateway-adapter/gateway-frame.service";

/**
 * The `SL` frame — the client's whole spell snapshot.
 *
 * There is no partial update for it: the hotbar, the grimoire and the
 * cast machine all read the same list, so anything that changes a
 * spell's numbers re-pushes the lot. Entering the game, raising a rank
 * and levelling out of a fight already did this by hand; changing
 * weapons is the fourth, and needed a shared method rather than a
 * fourth copy.
 */
@Injectable()
export class SpellsFramesService {
  constructor(
    private readonly spells: SpellsService,
    private readonly frames: GatewayFrameService
  ) {}

  async sendSpellList(sessionId: string, playerId: string): Promise<void> {
    const spells = await this.spells.buildSpellList(playerId);

    this.frames.broadcast(
      [sessionId],
      create(DofusMessageSchema, {
        payload: {
          case: "spellList",
          value: create(SpellListSchema, { spells }),
        },
      })
    );
  }

  /**
   * The close-combat entry carries the weapon's AP cost, range and
   * damage, so swapping weapons makes the client's copy wrong. The
   * inventory raises this rather than calling us, which is what keeps
   * the module edge one-way.
   */
  @OnEvent("player.weapon-changed")
  async onWeaponChanged({
    sessionId,
    playerId,
  }: {
    sessionId: string;
    playerId: string;
  }): Promise<void> {
    await this.sendSpellList(sessionId, playerId);
  }
}
