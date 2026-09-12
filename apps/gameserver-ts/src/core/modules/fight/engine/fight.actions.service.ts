import type { Fight } from "@modules/fight/core/fight.entity";
import type { Fighter } from "@modules/fight/core/fight.fighter";
import type { Session } from "@shared/gateway-adapter/session-registry";
import { create } from "@bufbuild/protobuf";
import { clampFightDirection, getDirection } from "@dofus/grid";
import {
  ActionCloseCombatSchema,
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
import { Characteristic, FighterKind } from "@modules/fight/fight.types";
import { FightRegistryService } from "@modules/fight/registry/fight.registry";
import { LangsService } from "@modules/langs/langs.service";
import { SpellsService } from "@modules/spells/spells.service";
import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { GatewayFrameService } from "@shared/gateway-adapter/gateway-frame.service";

import { killFighter, revealFighter } from "../effects/fight.effect-lifecycle";
import { FightEndService } from "./fight.end.service";
import { FightFrameEmitter } from "./fight.frame-emitter";
import { moveFighter } from "./fight.movement";
import { canPerceive, visibleSessions } from "./fight.visibility";

@Injectable()
export class FightActionsService {
  get effectEmitter(): FightFrameEmitter {
    return this.emitter;
  }
  spellLevel(id: number, rank: number) {
    return this.casts.getSpellLevel(id, rank);
  }
  private readonly casts: CastSpellUseCase;
  constructor(
    private readonly registry: FightRegistryService,
    private readonly frames: GatewayFrameService,
    spells: SpellsService,
    effects: EffectRegistry,
    private readonly emitter: FightFrameEmitter,
    private readonly end: FightEndService,
    private readonly langs: LangsService
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
      this.registry.getRunner(fight.id)?.notifyDisconnected(session.sessionId);
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
      killFighter({ fight, emitter: this.emitter }, fighter);
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
      moveFighter(fight, fighter, cells, {
        start: () => this.start(fight, fighter),
        emitter: this.emitter,
        step: (from, to) => {
          this.emitter.emitMovement(fight, fighter.id, [from, to]);
          this.emitter.emitMPLoss(fight, fighter.id, fighter.id, 1, true);
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
          this.emitter.emitAPLoss(fight, fighter.id, fighter.id, ap, true);
          this.emitter.emitMPLoss(fight, fighter.id, fighter.id, mp, true);
        },
      });
      await this.complete(fight, fighter);
    });
  }

  reject(sessionId: string, fighterId: number, error: unknown): void {
    const fight = this.registry.getBySession(sessionId);
    this.frames.broadcast(
      fight?.activeActionId ? fight.allSessions() : [sessionId],
      create(DofusMessageSchema, {
        payload: {
          case: "gameActionsFinish",
          value: create(GameActionsFinishSchema, {
            actionId: fight?.activeActionId ?? 0,
            fightId: fight?.id ?? 0,
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
    if (fight) {
      fight.activeActionId = null;
    }
  }

  private assertTurn(fight: Fight, fighter: Fighter, epoch: number): void {
    if (
      fight.ending ||
      !fight.turnOpen ||
      fighter.dead ||
      fight.turnEpoch !== epoch ||
      !(fight.state instanceof ActiveState) ||
      fight.state.turnList.current()?.id !== fighter.id
    ) {
      throw new CastError("not_your_turn", "Ce n’est pas votre tour.");
    }
  }

  private start(fight: Fight, fighter: Fighter): void {
    fight.activeActionId = ++fight.actionSequence;
    this.frames.broadcast(
      fight.allSessions(),
      create(DofusMessageSchema, {
        payload: {
          case: "gameActionsStart",
          value: create(GameActionsStartSchema, {
            actionId: fight.activeActionId,
            fightId: fight.id,
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
    const effect = (critical ? spell.criticalEffects : spell.effects)[0];
    if (
      !failure &&
      effect &&
      caster.invisible &&
      (critical ? spell.criticalEffects : spell.effects).some(
        (e) =>
          e.duration <= 0 &&
          ((e.id >= 91 && e.id <= 100) || e.id === 82 || e.id === 672)
      )
    ) {
      revealFighter(
        { ...resolution, target: null, effect, emitter: this.emitter },
        caster
      );
    }
    const action = (
      data: Parameters<typeof create<typeof GameActionSchema>>[1],
      targets = visibleSessions(fight, caster)
    ) =>
      this.frames.broadcast(
        targets,
        create(DofusMessageSchema, {
          payload: {
            case: "gameAction",
            value: create(GameActionSchema, {
              ...data,
              sequenceId: fight.activeActionId ?? 0,
            }),
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
      // A weapon swing is its own verb on the wire — `GA;303`, not
      // `GA;300` with spell 0 — because the client plays the weapon's
      // pose instead of a spell visual, and 1.29 tells the two apart
      // exactly here. Nothing about it is hidden from a viewer, so it
      // goes out once rather than per session.
      if (resolution.closeCombat) {
        action({
          actionType: 303,
          spriteId: String(caster.id),
          actionData: {
            case: "closeCombat",
            value: create(ActionCloseCombatSchema, {
              targetCell,
              weaponTemplateId: resolution.closeCombat.weaponTemplateId,
              // `anim0` is the melee pose in every player's atlas, and
              // the only value 1.29 ever sends for a weapon swing — the
              // client switches on exactly this string to play ATTACK
              // instead of the CAST pose a fireball uses. It is not the
              // item's own `animationId`: that one says how the sprite
              // *holds* the weapon while walking around.
              animation: "anim0",
            }),
          },
        });
        fight.modules.fireCloseCombat(fight, caster);
      } else {
        for (const session of visibleSessions(fight, caster)) {
          const viewer = fight.fighters().find((f) => f.sessionId === session);
          const hidesTrap =
            spell.effects.some((e) => e.id === 400) &&
            viewer?.team !== caster.team;
          action(
            {
              actionType: 300,
              spriteId: String(caster.id),
              actionData: {
                case: "spellLaunch",
                value: create(ActionSpellLaunchSchema, {
                  spellId,
                  // The viewer can only name the spells its own
                  // SpellList carried, so a monster's cast would read
                  // as a bare id in its combat log without this.
                  name: this.langs.getSpellSync(spellId)?.name ?? "",
                  cellId: hidesTrap ? -1 : targetCell,
                  param3: spell.visualGfxId,
                  param4: spell.level,
                  customSprite: -1,
                  animation: "anim1",
                }),
              },
            },
            [session]
          );
        }
      }
    }
    this.casts.apply(resolution);
    this.emitter.emitAPLoss(fight, caster.id, caster.id, spell.apCost, true);
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
    for (const session of fight.allSessions()) {
      const viewer = fight.fighters().find((f) => f.sessionId === session);
      this.frames.broadcast(
        [session],
        create(DofusMessageSchema, {
          payload: {
            case: "gameTurnMiddle",
            value: create(GameTurnMiddleSchema, {
              entries: fight.fighters().map((fighter) =>
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
              ),
            }),
          },
        })
      );
    }
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
            actionId: fight.activeActionId ?? 0,
            fightId: fight.id,
          }),
        },
      })
    );
    fight.activeActionId = null;
    if (fight.checkFightEnd().ended) {
      await this.end.endFight(fight);
    } else if (fighter.dead) {
      this.registry.getRunner(fight.id)?.requestEnd(fighter.id);
    }
  }
}
