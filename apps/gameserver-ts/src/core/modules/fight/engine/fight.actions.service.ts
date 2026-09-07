import type { Fight } from "@modules/fight/core/fight.entity";
import type { Fighter } from "@modules/fight/core/fight.fighter";
import type { Session } from "@shared/gateway-adapter/session-registry";
import { create } from "@bufbuild/protobuf";
import { clampFightDirection, getDirection } from "@dofus/grid";
import {
  ActionCriticalHitSchema,
  ActionCriticalMissSchema,
  ActionDirectionChangeSchema,
  ActionSpellLaunchSchema,
  GameActionSchema,
  GameActionsFinishSchema,
  GameActionsStartSchema,
  GameTurnMiddleSchema,
  TurnMiddleEntrySchema,
} from "@dofus/proto/game_pb";
import { DofusMessageSchema } from "@dofus/proto/server_messages_pb";
import { SpellCooldownSchema } from "@dofus/proto/spells_pb";
import {
  CastError,
  type CastResolution,
  CastSpellUseCase,
} from "@modules/fight/cast/fight.cast";
import { ActiveState } from "@modules/fight/core/fight.active-state";
import { EffectRegistry } from "@modules/fight/effects/fight.effect-registry";
import { Characteristic } from "@modules/fight/fight.types";
import { FightRegistryService } from "@modules/fight/registry/fight.registry";
import { SpellsService } from "@modules/spells/spells.service";
import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { GatewayFrameService } from "@shared/gateway-adapter/gateway-frame.service";

import { FightEndService } from "./fight.end.service";
import { FightFrameEmitter } from "./fight.frame-emitter";
import { moveFighter } from "./fight.movement";

@Injectable()
export class FightActionsService {
  private readonly casts: CastSpellUseCase;
  constructor(
    private readonly registry: FightRegistryService,
    private readonly frames: GatewayFrameService,
    spells: SpellsService,
    effects: EffectRegistry,
    private readonly emitter: FightFrameEmitter,
    private readonly end: FightEndService
  ) {
    this.casts = new CastSpellUseCase(
      { bySession: (session) => registry.getBySession(session) },
      spells,
      effects,
      emitter
    );
  }

  /** No reconnect/resume yet: a closed session forfeits through the same queue. */
  @OnEvent("session.closed")
  async onSessionClosed({
    session,
  }: {
    session: Pick<Session, "sessionId">;
  }): Promise<void> {
    const fight = this.registry.getBySession(session.sessionId);
    const fighter = fight
      ?.fighters()
      .find((entry) => entry.sessionId === session.sessionId);
    if (fight && fighter) {
      await this.abandon(fight, fighter);
    }
  }

  cast(fight: Fight, fighter: Fighter, params: string): Promise<void> {
    const epoch = fight.turnEpoch;
    return fight.runAction(async () => {
      this.assertTurn(fight, fighter, epoch);
      await this.applyCast(await this.casts.resolve(fighter.sessionId, params));
    });
  }

  abandon(fight: Fight, fighter: Fighter): Promise<void> {
    return fight.runAction(async () => {
      if (fight.ending || fighter.dead) {
        return;
      }
      fighter.markLeftFight();
      fighter.setLp(0);
      fight.fightMap.free(fighter.cell, fighter.id);
      this.emitter.emitDeath(fight, fighter.id);
      fight.modules.fireFighterDied(fight, fighter);
      await this.complete(fight, fighter);
    });
  }

  castFor(
    fight: Fight,
    fighter: Fighter,
    spellId: number,
    cell: number,
    rank: number,
    epoch: number
  ): Promise<void> {
    return fight.runAction(async () => {
      this.assertTurn(fight, fighter, epoch);
      await this.applyCast(
        await this.casts.resolveFor(fight, fighter, spellId, cell, rank)
      );
    });
  }

  move(
    fight: Fight,
    fighter: Fighter,
    cells: number[],
    epoch = fight.turnEpoch
  ): Promise<void> {
    return fight.runAction(async () => {
      this.assertTurn(fight, fighter, epoch);
      this.start(fight, fighter);
      moveFighter(fight, fighter, cells, {
        step: (from, to) => {
          this.emitter.emitMovement(fight, fighter.id, [from, to]);
          this.emitter.emitMPLoss(fight, fighter.id, fighter.id, 1);
        },
        tackled: (ap, mp) => {
          this.frames.broadcast(
            fight.allSessions(),
            create(DofusMessageSchema, {
              payload: {
                case: "gameAction",
                value: create(GameActionSchema, {
                  actionType: 104,
                  spriteId: String(fighter.id),
                }),
              },
            })
          );
          this.emitter.emitAPLoss(fight, fighter.id, fighter.id, ap);
          this.emitter.emitMPLoss(fight, fighter.id, fighter.id, mp);
        },
      });
      await this.complete(fight, fighter);
    });
  }

  reject(sessionId: string, fighterId: number, error: unknown): void {
    this.frames.broadcast(
      [sessionId],
      create(DofusMessageSchema, {
        payload: {
          case: "gameActionsFinish",
          value: create(GameActionsFinishSchema, {
            spriteId: String(fighterId),
            actionResultId: 0,
            rejectionCode:
              error instanceof CastError ? error.code : "action_failed",
            rejectionReason:
              error instanceof CastError
                ? error.message
                : "Cette action n’a pas pu être effectuée.",
          }),
        },
      })
    );
  }

  private assertTurn(fight: Fight, fighter: Fighter, epoch: number): void {
    if (
      fight.ending ||
      fighter.dead ||
      fight.turnEpoch !== epoch ||
      !(fight.state instanceof ActiveState) ||
      fight.state.turnList.current()?.id !== fighter.id
    ) {
      throw new CastError("not_your_turn", "Ce n’est pas votre tour.");
    }
  }

  private start(fight: Fight, fighter: Fighter): void {
    this.frames.broadcast(
      fight.allSessions(),
      create(DofusMessageSchema, {
        payload: {
          case: "gameActionsStart",
          value: create(GameActionsStartSchema, {
            spriteId: String(fighter.id),
          }),
        },
      })
    );
  }

  private async applyCast(resolution: CastResolution): Promise<void> {
    const { fight, caster, spell, spellId, targetCell, critical, failure } =
      resolution;
    this.start(fight, caster);
    const action = (
      data: Parameters<typeof create<typeof GameActionSchema>>[1]
    ) =>
      this.frames.broadcast(
        fight.allSessions(),
        create(DofusMessageSchema, {
          payload: {
            case: "gameAction",
            value: create(GameActionSchema, data),
          },
        })
      );
    if (targetCell !== caster.cell) {
      caster.direction = clampFightDirection(
        getDirection(caster.cell, targetCell, fight.fightMap.width)
      );
      action({
        actionType: 5,
        spriteId: String(caster.id),
        actionData: {
          case: "directionChange",
          value: create(ActionDirectionChangeSchema, {
            spriteId: String(caster.id),
            direction: caster.direction,
          }),
        },
      });
    }
    if (failure) {
      action({
        actionType: 302,
        spriteId: String(caster.id),
        actionData: {
          case: "criticalMiss",
          value: create(ActionCriticalMissSchema, { spellId }),
        },
      });
    } else {
      if (critical) {
        action({
          actionType: 301,
          spriteId: String(caster.id),
          actionData: {
            case: "criticalHit",
            value: create(ActionCriticalHitSchema, { spellId }),
          },
        });
      }
      action({
        actionType: 300,
        spriteId: String(caster.id),
        actionData: {
          case: "spellLaunch",
          value: create(ActionSpellLaunchSchema, {
            spellId,
            cellId: targetCell,
            param3: spell.visualGfxId,
            param4: spell.level,
            customSprite: -1,
            animation: "anim1",
          }),
        },
      });
    }
    this.casts.apply(resolution);
    this.emitter.emitAPLoss(fight, caster.id, caster.id, spell.apCost);
    this.sendCooldowns(fight, caster);
    await this.complete(fight, caster);
    if (!fight.ending && failure && spell.critFailureEndsTurn) {
      this.registry.getRunner(fight.id)?.requestEnd(caster.id);
    }
  }

  sendCooldowns(fight: Fight, fighter: Fighter): void {
    if (!fighter.sessionId) {
      return;
    }
    for (const [spellId, remainingTurns] of fight.spellUsage.cooldownsFor(
      fighter.id
    )) {
      this.frames.broadcast(
        [fighter.sessionId],
        create(DofusMessageSchema, {
          payload: {
            case: "spellCooldown",
            value: create(SpellCooldownSchema, { spellId, remainingTurns }),
          },
        })
      );
    }
  }

  snapshot(fight: Fight): void {
    this.frames.broadcast(
      fight.allSessions(),
      create(DofusMessageSchema, {
        payload: {
          case: "gameTurnMiddle",
          value: create(GameTurnMiddleSchema, {
            entries: fight.fighters().map((fighter) =>
              create(TurnMiddleEntrySchema, {
                spriteId: String(fighter.id),
                isDead: fighter.dead,
                cellNum: fighter.cell,
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
                states: [...fighter.states.snapshot().keys()],
              })
            ),
          }),
        },
      })
    );
  }

  private async complete(fight: Fight, fighter: Fighter): Promise<void> {
    for (const dead of fight.fighters().filter((entry) => entry.dead)) {
      fight.fightMap.free(dead.cell, dead.id);
    }
    this.snapshot(fight);
    this.frames.broadcast(
      fight.allSessions(),
      create(DofusMessageSchema, {
        payload: {
          case: "gameActionsFinish",
          value: create(GameActionsFinishSchema, {
            spriteId: String(fighter.id),
            actionResultId: 1,
          }),
        },
      })
    );
    if (fight.checkFightEnd().ended) {
      await this.end.endFight(fight);
    } else if (fighter.dead) {
      this.registry.getRunner(fight.id)?.requestEnd(fighter.id);
    }
  }
}
