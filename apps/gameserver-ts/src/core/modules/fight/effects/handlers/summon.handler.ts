import { Injectable } from "@nestjs/common";

import type { Scope } from "../fight.effect-registry.types";
import { ActiveState } from "../../core/fight.active-state";
import { Fighter } from "../../core/fight.fighter";
import { Characteristic, FighterKind, FightStateId } from "../../fight.types";
import { EffectHandler } from "../fight.effect-handler.decorator";

export function lastResurrectableAlly(
  scope: Pick<Scope, "fight" | "caster">
): Fighter | undefined {
  const eligible = scope.fight
    .fighters()
    .filter(
      (f) =>
        f.dead &&
        f.team === scope.caster.team &&
        !f.hasLeftFight &&
        f.revivedById === null &&
        (!f.isInvocation() ||
          scope.fight
            .fighters()
            .some((owner) => owner.id === f.invocatorId && !owner.dead))
    );
  return eligible.sort(
    (a, b) =>
      Number(Boolean(b.player)) - Number(Boolean(a.player)) ||
      b.deathOrder - a.deathOrder
  )[0];
}

export function summonLimitReached(
  scope: Pick<Scope, "fight" | "caster">
): boolean {
  return (
    scope.fight
      .fighters()
      .filter(
        (f) =>
          !f.dead &&
          f.invocatorId === scope.caster.id &&
          f.kind !== FighterKind.Static
      ).length >=
    Math.max(0, 1 + scope.caster.stats.get(Characteristic.MaxSummons))
  );
}

@Injectable()
export class SummonEffectHandler {
  @EffectHandler(181, 185)
  handleSummon(scope: Scope): void {
    const { fight, caster, targetCell, effect } = scope;
    const template = scope.summonCache?.get(`${effect.min}:${effect.max}`);
    if (
      !template ||
      !caster.team ||
      !fight.fightMap.isFree(targetCell) ||
      !fight.fightMap.isWalkable(targetCell)
    ) {
      return;
    }
    if (effect.id !== 185 && summonLimitReached(scope)) {
      return;
    }
    const factor = caster.player ? 1 + caster.level / 100 : 1;
    const summon = new Fighter(
      fight.allocateSummonId(),
      effect.id === 185 ? FighterKind.Static : FighterKind.Invocation,
      template.name,
      Math.floor(template.life * factor),
      template.ap,
      template.mp,
      caster.direction
    );
    for (const [id, value] of Object.entries(template.stats)) {
      const stat = Number(id) as Characteristic;
      summon.stats.setBase(
        stat,
        Math.floor(
          value * ([10, 11, 12, 13, 14, 15].includes(stat) ? factor : 1)
        )
      );
    }
    summon.monsterTemplateId = template.templateId;
    summon.monsterGfx = template.gfx;
    [summon.monsterColor1, summon.monsterColor2, summon.monsterColor3] =
      template.colors;
    summon.monsterLevel = template.level;
    summon.summonGrade = template.grade;
    summon.aiProfile = template.ai;
    summon.monsterSpells = template.spells.map((spell) => ({ ...spell }));
    summon.invocatorId = caster.id;
    if (effect.id === 185) {
      summon.states.set(FightStateId.Rooted, -1);
    }
    this.place(scope, summon);
  }

  @EffectHandler(180)
  handleDouble(scope: Scope): void {
    if (
      !scope.caster.team ||
      summonLimitReached(scope) ||
      !scope.fight.fightMap.isFree(scope.targetCell)
    ) {
      return;
    }
    const caster = scope.caster;
    const double = new Fighter(
      scope.fight.allocateSummonId(),
      FighterKind.Double,
      caster.name,
      caster.lpMax,
      caster.stats.get(Characteristic.ActionPoints),
      caster.stats.get(Characteristic.MovementPoints),
      caster.direction
    );
    for (const id of Object.values(Characteristic)) {
      double.stats.setBase(id, caster.stats.get(id));
    }
    double.monsterGfx =
      caster.appearanceGfx ?? caster.player?.gfx ?? caster.monsterGfx;
    double.monsterColor1 = caster.player?.color1 ?? caster.monsterColor1;
    double.monsterColor2 = caster.player?.color2 ?? caster.monsterColor2;
    double.monsterColor3 = caster.player?.color3 ?? caster.monsterColor3;
    double.monsterLevel = caster.level;
    double.invocatorId = caster.id;
    double.aiProfile = 100; // Blocks the nearest perceived enemy without offensive spells.
    this.place(scope, double);
  }

  @EffectHandler(780)
  handleRevive(scope: Scope): void {
    const target = lastResurrectableAlly(scope);
    if (!target || !scope.fight.fightMap.isFree(scope.targetCell)) {
      return;
    }
    target.revive(Math.floor((target.lpMax * scope.effect.min) / 100));
    target.revivedById = scope.caster.id;
    this.place(scope, target, true);
  }

  private place(scope: Scope, fighter: Fighter, resurrected = false): void {
    const { fight, caster, targetCell } = scope;
    if (!resurrected) {
      caster.team?.add(fighter);
    }
    fighter.cell = targetCell;
    fight.fightMap.occupy(targetCell, fighter.id);
    if (
      fight.state instanceof ActiveState &&
      fighter.kind !== FighterKind.Static
    ) {
      fight.state.turnList.insertAfter(caster.id, fighter);
    }
    scope.emitter.emitSummon?.(fight, caster.id, fighter);
    scope.emitter.emitRoster?.(fight);
    fight.fightMap.fireArrivalTriggers(fight, fighter, targetCell);
  }
}
