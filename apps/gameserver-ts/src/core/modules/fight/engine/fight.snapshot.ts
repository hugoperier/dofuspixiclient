import { create } from "@bufbuild/protobuf";
import { TurnMiddleEntrySchema } from "@dofus/proto/game_pb";
import type { Fight } from "../core/fight.entity";
import type { Fighter } from "../core/fight.fighter";
import { Characteristic, FighterKind } from "../fight.types";
import { canPerceive } from "./fight.visibility";

/** Used by the live turn stream and initial snapshots; never expose hidden cells. */
export function fightTurnEntries(fight: Fight, viewer?: Fighter) {
  return fight.fighters().map((fighter) =>
                create(TurnMiddleEntrySchema, {
                  spriteId: String(fighter.id),
                  isDead: fighter.dead,
                  cellNum: canPerceive(fighter, viewer) ? fighter.cell : -1,
                  invisible: fighter.invisible,
                  hidden: !canPerceive(fighter, viewer),
                  carryingId:
                    fighter.carryingId === null
                      ? ""
                      : String(fighter.carryingId),
                  carriedById:
                    fighter.carriedById === null
                      ? ""
                      : String(fighter.carriedById),
                  appearanceGfx:
                    fighter.appearanceGfx ??
                    fighter.player?.gfx ??
                    fighter.monsterGfx,
                  maxSummons: Math.max(
                    0,
                    1 + fighter.stats.get(Characteristic.MaxSummons)
                  ),
                  staticFighter: fighter.kind === FighterKind.Static,
                  resurrectable:
                    fighter.dead &&
                    !fighter.hasLeftFight &&
                    fighter.revivedById === null &&
                    (!fighter.isInvocation() ||
                      fight
                        .fighters()
                        .some(
                          (owner) =>
                            owner.id === fighter.invocatorId && !owner.dead
                        )),
                  lp: fighter.lp,
                  lpMax: fighter.lpMax,
                  ap: fighter.ap,
                  mp: fighter.mp,
                  apMax: Math.max(
                    0,
                    fighter.stats.get(Characteristic.ActionPoints)
                  ),
                  mpMax: Math.max(
                    0,
                    fighter.stats.get(Characteristic.MovementPoints)
                  ),
                  rangeBonus: fighter.stats.get(Characteristic.Range),
                  states: [...fighter.states.snapshot().keys()].filter(
                    (id) => id >= 0
                  ),
                })
              );
}
