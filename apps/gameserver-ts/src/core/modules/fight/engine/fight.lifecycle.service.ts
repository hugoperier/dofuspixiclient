import type { Fight } from "@modules/fight/core/fight.entity";
import { create } from "@bufbuild/protobuf";
import {
  GameStartToPlaySchema,
  GameTurnFinishSchema,
  GameTurnListSchema,
  GameTurnStartSchema,
  GameZoneData_Operation,
  GameZoneDataSchema,
} from "@dofus/proto/game_pb";
import { DofusMessageSchema } from "@dofus/proto/server_messages_pb";
import { ActiveState } from "@modules/fight/core/fight.active-state";
import { MonsterAI } from "@modules/fight/engine/fight.ai";
import { FightEndService } from "@modules/fight/engine/fight.end.service";
import { Runner } from "@modules/fight/engine/fight.runner";
import { StateName } from "@modules/fight/fight.types";
import { FightRegistryService } from "@modules/fight/registry/fight.registry";
import { Injectable, Logger } from "@nestjs/common";
import { GatewayFrameService } from "@shared/gateway-adapter/gateway-frame.service";
import { match } from "ts-pattern";

import { FightActionsService } from "./fight.actions.service";

@Injectable()
export class FightLifecycleService {
  private readonly logger = new Logger(FightLifecycleService.name);

  constructor(
    private readonly fightRegistry: FightRegistryService,
    private readonly fightEnd: FightEndService,
    private readonly frames: GatewayFrameService,
    private readonly actions: FightActionsService
  ) {}

  startFight(fight: Fight): void {
    if (fight.ending || fight.state.name !== StateName.Placement) {
      return;
    }
    fight.cancelPlacementTimer();
    const targets = this.fightSessions(fight);

    // GS — Game Start
    this.frames.broadcast(
      targets,
      create(DofusMessageSchema, {
        payload: {
          case: "gameStartToPlay",
          value: create(GameStartToPlaySchema, {}),
        },
      })
    );

    // Transition to Active state
    const active = new ActiveState();
    fight.transition(active);

    // Start the turn loop runner with monster AI
    const frameSink = this.createFrameSink(fight);
    const runner = new Runner(fight, active, frameSink, 30_000);

    const ai = new MonsterAI(
      (fighterId, epoch) => {
        void fight.runAction(() => {
          if (fight.turnEpoch === epoch) {
            runner.requestEnd(fighterId);
          }
        });
      },
      (fightObj, caster, spellId, targetCell, level, epoch) =>
        this.actions.castFor(
          fightObj,
          caster,
          spellId,
          targetCell,
          level,
          epoch
        ),
      (fightObj, fighter, pathCells, epoch) =>
        this.actions.move(fightObj, fighter, pathCells, epoch)
    );
    runner.setObserver(ai);
    this.fightRegistry.addRunner(fight.id, runner);
    runner.start();

    this.logger.log(`Fight ${fight.id} entered active state`);
  }

  private createFrameSink(fight: Fight) {
    return {
      broadcast: (_fight: Fight, messageId: string, payload: unknown) => {
        const targets = this.fightSessions(fight);

        match(messageId)
          .with("GTL", () => {
            const p = payload as { spriteIds: string[] };
            this.frames.broadcast(
              targets,
              create(DofusMessageSchema, {
                payload: {
                  case: "gameTurnList",
                  value: create(GameTurnListSchema, { spriteIds: p.spriteIds }),
                },
              })
            );
          })
          .with("GTS", () => {
            const p = payload as {
              spriteId: string;
              timeMs: number;
              tableTurnNum: number;
            };
            this.frames.broadcast(
              targets,
              create(DofusMessageSchema, {
                payload: {
                  case: "gameTurnStart",
                  value: create(GameTurnStartSchema, {
                    spriteId: p.spriteId,
                    timeMs: p.timeMs,
                    tableTurnNum: p.tableTurnNum,
                  }),
                },
              })
            );
          })
          .with("GTF", () => {
            const p = payload as { spriteId: string };
            this.frames.broadcast(
              targets,
              create(DofusMessageSchema, {
                payload: {
                  case: "gameTurnFinish",
                  value: create(GameTurnFinishSchema, { spriteId: p.spriteId }),
                },
              })
            );
          })
          .with("GDZ", () => {
            // A deployed object expired. The client keys its zone
            // overlay by cell, so erasing the disc it drew needs
            // nothing more than the cell.
            const p = payload as { cellId: number };
            this.frames.broadcast(
              targets,
              create(DofusMessageSchema, {
                payload: {
                  case: "gameZoneData",
                  value: create(GameZoneDataSchema, {
                    operation: GameZoneData_Operation.REMOVE,
                    cellId: p.cellId,
                  }),
                },
              })
            );
          })
          .with("GTM", () => {
            this.actions.snapshot(fight);
            for (const fighter of fight.fighters()) {
              this.actions.sendCooldowns(fight, fighter);
            }
          })
          .with("GE", () => {
            this.fightEnd.endFight(fight).catch((err) => {
              this.logger.error(`Failed to end fight ${fight.id}:`, err);
            });
          })
          .otherwise(() => {});
      },
      sendTo: (sessionId: string, _messageId: string, _payload: unknown) => {
        this.logger.debug(`sendTo ${sessionId} ${_messageId}`);
      },
    };
  }

  private fightSessions(fight: Fight): string[] {
    return fight.allSessions();
  }
}
