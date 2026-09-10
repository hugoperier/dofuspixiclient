import type { GameAction } from "@dofus/proto/game_pb";
import type { Fight } from "@modules/fight/core/fight.entity";
import type { Fighter } from "@modules/fight/core/fight.fighter";
import type { Buff } from "@modules/fight/effects/fight.buff";
import type { Emitter } from "@modules/fight/effects/fight.effect-registry.types";
import { create } from "@bufbuild/protobuf";
import { CharacterColorsSchema, SpriteType } from "@dofus/proto/common_pb";
import {
  ActionAPChangeSchema,
  ActionCarrySchema,
  ActionDamageSchema,
  ActionDeathSchema,
  ActionEffectApplySchema,
  ActionGlyphSchema,
  ActionInvisibilitySchema,
  ActionMovementSchema,
  ActionMPChangeSchema,
  ActionReduceDamageSchema,
  ActionRemoveEffectsSchema,
  ActionReturnDamageSchema,
  ActionReturnSpellSchema,
  ActionSpritePositionSchema,
  ActionStateChangeSchema,
  ActionStealGoldSchema,
  ActionSummonSchema,
  ActionThrowSchema,
  ActionUncarrySchema,
  GameActionSchema,
  GameActionType,
  GameTurnListSchema,
  GameZoneData_Operation,
  GameZoneDataSchema,
  SpriteMovementEntrySchema,
} from "@dofus/proto/game_pb";
import { DofusMessageSchema } from "@dofus/proto/server_messages_pb";
import { Injectable } from "@nestjs/common";
import { GatewayFrameService } from "@shared/gateway-adapter/gateway-frame.service";

import { ActiveState } from "../core/fight.active-state";
import { canPerceive, teamSessions, visibleSessions } from "./fight.visibility";

@Injectable()
export class FightFrameEmitter implements Emitter {
  private readonly trapAudiences = new WeakMap<Fight, Map<number, string[]>>();
  constructor(private readonly frames: GatewayFrameService) {}

  private targets(fight: Fight, fighterId?: number): string[] {
    const fighter = fight.fighters().find((f) => f.id === fighterId);
    if (fighter) {
      return visibleSessions(fight, fighter);
    }
    return fight.allSessions();
  }

  private action(
    fight: Fight,
    casterId: number,
    actionType: number,
    actionData: GameAction["actionData"],
    targets = fight.allSessions()
  ): void {
    this.frames.broadcast(
      targets,
      create(DofusMessageSchema, {
        payload: {
          case: "gameAction",
          value: create(GameActionSchema, {
            sequenceId: fight.activeActionId ?? 0,
            spriteId: String(casterId),
            actionType,
            actionData,
          }),
        },
      })
    );
  }

  emitSummon(fight: Fight, casterId: number, fighter: Fighter): void {
    const spriteData = create(SpriteMovementEntrySchema, {
      spriteId: String(fighter.id),
      spriteType: fighter.player ? SpriteType.CHARACTER : SpriteType.MONSTER,
      operation: 0,
      cellId: fighter.cell,
      direction: fighter.direction,
      gfxId: fighter.appearanceGfx ?? fighter.player?.gfx ?? fighter.monsterGfx,
      name: fighter.name,
      nameId: fighter.monsterTemplateId,
      level: fighter.level,
      scaleX: 100,
      scaleY: 100,
      lp: fighter.lp,
      lpMax: fighter.lpMax,
      ap: fighter.ap,
      mp: fighter.mp,
      team: fighter.team?.side ?? 0,
      isSummoned: fighter.isInvocation(),
      summonerId: fighter.invocatorId ? String(fighter.invocatorId) : "",
      colors: create(CharacterColorsSchema, {
        color1: fighter.player?.color1 ?? fighter.monsterColor1,
        color2: fighter.player?.color2 ?? fighter.monsterColor2,
        color3: fighter.player?.color3 ?? fighter.monsterColor3,
      }),
    });
    this.action(fight, casterId, fighter.revivedById !== null ? 780 : 181, {
      case: "summon",
      value: create(ActionSummonSchema, {
        spriteData,
        cellId: fighter.cell,
        resurrected: fighter.revivedById !== null,
      }),
    });
  }

  emitRoster(fight: Fight): void {
    if (!(fight.state instanceof ActiveState)) {
      return;
    }
    this.frames.broadcast(
      fight.allSessions(),
      create(DofusMessageSchema, {
        payload: {
          case: "gameTurnList",
          value: create(GameTurnListSchema, {
            spriteIds: fight.state.turnList.fighters().map((f) => String(f.id)),
          }),
        },
      })
    );
  }

  emitState(
    fight: Fight,
    targetId: number,
    stateId: number,
    active: boolean
  ): void {
    if (stateId < 0) {
      return;
    }
    this.action(fight, targetId, 950, {
      case: "stateChange",
      value: create(ActionStateChangeSchema, {
        spriteId: String(targetId),
        stateId,
        active,
      }),
    });
  }

  emitVisibility(fight: Fight, fighter: Fighter): void {
    for (const session of fight.allSessions()) {
      const viewer = fight.fighters().find((f) => f.sessionId === session);
      this.action(
        fight,
        fighter.id,
        150,
        {
          case: "invisibility",
          value: create(ActionInvisibilitySchema, {
            spriteId: String(fighter.id),
            turns:
              fighter.buffs.all().find((b) => b.effectId === 150)?.remaining ??
              0,
            visibility: fighter.invisible
              ? canPerceive(fighter, viewer)
                ? 1
                : 2
              : 0,
          }),
        },
        [session]
      );
    }
    if (!fighter.invisible) {
      this.emitTeleport(fight, fighter.id, fighter.cell, fighter.cell);
    }
  }

  emitAppearance(fight: Fight, fighter: Fighter): void {
    this.action(
      fight,
      fighter.id,
      149,
      {
        case: "effectApply",
        value: create(ActionEffectApplySchema, {
          effectId: 149,
          targetSpriteId: String(fighter.id),
          value:
            fighter.appearanceGfx ?? fighter.player?.gfx ?? fighter.monsterGfx,
        }),
      },
      visibleSessions(fight, fighter)
    );
  }

  emitCarry(fight: Fight, carrier: Fighter, carried: Fighter): void {
    this.action(fight, carrier.id, 50, {
      case: "carry",
      value: create(ActionCarrySchema, { carriedSpriteId: String(carried.id) }),
    });
  }

  emitUncarry(
    fight: Fight,
    carrier: Fighter,
    carried: Fighter,
    thrown: boolean
  ): void {
    this.action(
      fight,
      carrier.id,
      thrown ? 51 : 52,
      thrown
        ? {
            case: "throwCarried",
            value: create(ActionThrowSchema, { cellId: carried.cell }),
          }
        : {
            case: "uncarry",
            value: create(ActionUncarrySchema, {
              spriteId: String(carried.id),
              cellId: carried.cell,
            }),
          }
    );
  }

  emitDispel(fight: Fight, targetId: number): void {
    this.action(fight, targetId, 132, {
      case: "removeEffects",
      value: create(ActionRemoveEffectsSchema, { targetId: String(targetId) }),
    });
  }

  emitReduction(fight: Fight, targetId: number, amount: number): void {
    this.action(fight, targetId, 105, {
      case: "reduceDamage",
      value: create(ActionReduceDamageSchema, {
        spriteId: String(targetId),
        amount,
      }),
    });
  }

  emitReflection(
    fight: Fight,
    targetId: number,
    amount: number,
    spell: boolean
  ): void {
    this.action(
      fight,
      targetId,
      spell ? 106 : 107,
      spell
        ? {
            case: "returnSpell",
            value: create(ActionReturnSpellSchema, {
              spriteId: String(targetId),
              success: true,
            }),
          }
        : {
            case: "returnDamage",
            value: create(ActionReturnDamageSchema, {
              spriteId: String(targetId),
              amount,
            }),
          }
    );
  }

  emitGold(
    fight: Fight,
    casterId: number,
    targetId: number,
    amount: number
  ): void {
    this.action(fight, casterId, 130, {
      case: "stealGold",
      value: create(ActionStealGoldSchema, {
        spriteId: String(targetId),
        amount,
      }),
    });
  }

  emitDamage(
    fight: Fight,
    attackerId: number,
    targetId: number,
    amount: number,
    element: number
  ): void {
    const elementActionId = [100, 97, 99, 96, 98][element] ?? 100;

    this.frames.broadcast(
      this.targets(fight),
      create(DofusMessageSchema, {
        payload: {
          case: "gameAction",
          value: create(GameActionSchema, {
            sequenceId: elementActionId,
            actionType: elementActionId,
            spriteId: String(attackerId),
            actionData: {
              case: "damage",
              value: create(ActionDamageSchema, {
                spriteId: String(targetId),
                amount,
                element,
              }),
            },
          }),
        },
      })
    );
  }

  emitHeal(
    fight: Fight,
    healerId: number,
    targetId: number,
    amount: number
  ): void {
    this.frames.broadcast(
      this.targets(fight),
      create(DofusMessageSchema, {
        payload: {
          case: "gameAction",
          value: create(GameActionSchema, {
            sequenceId: 108,
            actionType: 108,
            spriteId: String(healerId),
            actionData: {
              case: "damage",
              value: create(ActionDamageSchema, {
                spriteId: String(targetId),
                amount: -amount,
                element: 0,
              }),
            },
          }),
        },
      })
    );
  }

  emitDeath(fight: Fight, targetId: number): void {
    this.frames.broadcast(
      this.targets(fight),
      create(DofusMessageSchema, {
        payload: {
          case: "gameAction",
          value: create(GameActionSchema, {
            sequenceId: 103,
            actionType: 103,
            spriteId: String(targetId),
            actionData: {
              case: "death",
              value: create(ActionDeathSchema, {
                spriteId: String(targetId),
              }),
            },
          }),
        },
      })
    );
  }

  /**
   * `cost` marks the loss as the price of the actor's own action — a
   * spell's AP, a tackle — rather than AP a spell effect took from a
   * target. The client needs the distinction to keep the combat log
   * free of one line per cast: `attackerId === targetId` cannot carry
   * it, since a self-targeted buff has that shape too.
   */
  emitAPLoss(
    fight: Fight,
    attackerId: number,
    targetId: number,
    amount: number,
    cost = false
  ): void {
    this.frames.broadcast(
      this.targets(fight),
      create(DofusMessageSchema, {
        payload: {
          case: "gameAction",
          value: create(GameActionSchema, {
            sequenceId: 102,
            actionType: 102,
            spriteId: String(attackerId),
            actionData: {
              case: "apChange",
              value: create(ActionAPChangeSchema, {
                spriteId: String(targetId),
                delta: -amount,
                used: amount,
                cost,
              }),
            },
          }),
        },
      })
    );
  }

  /** See `emitAPLoss` for what `cost` means. */
  emitMPLoss(
    fight: Fight,
    attackerId: number,
    targetId: number,
    amount: number,
    cost = false
  ): void {
    this.frames.broadcast(
      this.targets(fight),
      create(DofusMessageSchema, {
        payload: {
          case: "gameAction",
          value: create(GameActionSchema, {
            sequenceId: 127,
            actionType: 127,
            spriteId: String(attackerId),
            actionData: {
              case: "mpChange",
              value: create(ActionMPChangeSchema, {
                spriteId: String(targetId),
                delta: -amount,
                cost,
              }),
            },
          }),
        },
      })
    );
  }

  emitBuff(fight: Fight, casterId: number, targetId: number, buff: Buff): void {
    this.frames.broadcast(
      this.targets(fight),
      create(DofusMessageSchema, {
        payload: {
          case: "gameAction",
          value: create(GameActionSchema, {
            sequenceId: buff.effectId,
            actionType: buff.effectId,
            spriteId: String(casterId),
            rawParams: `${targetId},${buff.value},${buff.remaining}`,
            actionData: {
              case: "effectApply",
              value: create(ActionEffectApplySchema, {
                effectId: buff.effectId,
                targetSpriteId: String(targetId),
                value: buff.value,
                duration: buff.remaining,
                buffId: buff.id,
                spellId: buff.spellId ?? 0,
              }),
            },
          }),
        },
      })
    );
  }

  emitTeleport(
    fight: Fight,
    targetId: number,
    _fromCell: number,
    toCell: number
  ): void {
    this.frames.broadcast(
      this.targets(fight, targetId),
      create(DofusMessageSchema, {
        payload: {
          case: "gameAction",
          value: create(GameActionSchema, {
            sequenceId: 4,
            actionType: 4,
            spriteId: String(targetId),
            actionData: {
              case: "spritePosition",
              value: create(ActionSpritePositionSchema, {
                spriteId: String(targetId),
                cellId: toCell,
              }),
            },
          }),
        },
      })
    );
  }

  private emitZone(
    fight: Fight,
    operation: GameZoneData_Operation,
    cell: number,
    size: number,
    color: number,
    areaKind: number,
    targets = this.targets(fight)
  ): void {
    this.frames.broadcast(
      targets,
      create(DofusMessageSchema, {
        payload: {
          case: "gameZoneData",
          value: create(GameZoneDataSchema, {
            operation,
            cellId: cell,
            size,
            color,
            areaKind,
          }),
        },
      })
    );
  }

  emitTrapAdd(
    fight: Fight,
    casterId: number,
    cell: number,
    size: number,
    color: number,
    areaKind: number
  ): void {
    const team = fight.fighters().find((f) => f.id === casterId)?.team?.side;
    const teams =
      fight.fightMap.objects
        .atCell(cell)
        .find((object) => object.casterId === casterId)?.visibleToTeams ??
      new Set([team ?? 0]);
    const targets = [
      ...new Set([...teams].flatMap((side) => teamSessions(fight, side))),
    ];
    let audiences = this.trapAudiences.get(fight);
    if (!audiences) {
      audiences = new Map();
      this.trapAudiences.set(fight, audiences);
    }
    audiences.set(cell, targets);
    this.emitZone(
      fight,
      GameZoneData_Operation.ADD,
      cell,
      size,
      color,
      areaKind,
      targets
    );
  }

  emitGlyphAdd(
    fight: Fight,
    _casterId: number,
    cell: number,
    size: number,
    color: number,
    areaKind: number
  ): void {
    this.emitZone(
      fight,
      GameZoneData_Operation.ADD,
      cell,
      size,
      color,
      areaKind
    );
  }

  emitTrapRemove(fight: Fight, cell: number): void {
    const audiences = this.trapAudiences.get(fight);
    this.emitZone(
      fight,
      GameZoneData_Operation.REMOVE,
      cell,
      0,
      0,
      0,
      audiences?.get(cell) ?? []
    );
    audiences?.delete(cell);
  }

  emitGlyphRemove(fight: Fight, cell: number): void {
    this.emitZone(fight, GameZoneData_Operation.REMOVE, cell, 0, 0, 0);
  }

  emitGlyphTrigger(
    fight: Fight,
    casterId: number,
    cell: number,
    spellId: number,
    visualGfxId = 0,
    rank = 1,
    hiddenPositionOwnerId?: number
  ): void {
    this.frames.broadcast(
      hiddenPositionOwnerId === undefined
        ? this.targets(fight)
        : this.targets(fight, hiddenPositionOwnerId),
      create(DofusMessageSchema, {
        payload: {
          case: "gameAction",
          value: create(GameActionSchema, {
            sequenceId: GameActionType.ACTION_GLYPH_EFFECT,
            actionType: GameActionType.ACTION_GLYPH_EFFECT,
            spriteId: String(casterId),
            actionData: {
              case: "glyph",
              value: create(ActionGlyphSchema, {
                spriteId: String(casterId),
                cellId: cell,
                param1: spellId,
                param2: visualGfxId,
                param3: rank,
              }),
            },
          }),
        },
      })
    );
  }

  emitMovement(fight: Fight, fighterId: number, pathCells: number[]): void {
    this.frames.broadcast(
      this.targets(fight, fighterId),
      create(DofusMessageSchema, {
        payload: {
          case: "gameAction",
          value: create(GameActionSchema, {
            sequenceId: 1,
            actionType: GameActionType.ACTION_MOVEMENT,
            spriteId: String(fighterId),
            actionData: {
              case: "movement",
              value: create(ActionMovementSchema, { pathCells }),
            },
          }),
        },
      })
    );
  }
}
