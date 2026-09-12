export class SpellUsageTracker {
  private cooldowns = new Map<number, Map<number, number>>();

  cooldownsFor(fighterId: number): ReadonlyMap<number, number> {
    return this.cooldowns.get(fighterId) ?? new Map();
  }

  remaining(fighterId: number, spellId: number): number {
    return this.cooldowns.get(fighterId)?.get(spellId) ?? 0;
  }
  private perTurn = new Map<number, Map<number, number>>();
  private perTarget = new Map<number, Map<number, Map<number, number>>>();

  recordCast(
    fighterId: number,
    spellId: number,
    targetId: number,
    cooldown = 0
  ): void {
    let cooldowns = this.cooldowns.get(fighterId);
    if (!cooldowns) {
      cooldowns = new Map();
      this.cooldowns.set(fighterId, cooldowns);
    }
    cooldowns.set(spellId, cooldown);
    let bySpell = this.perTurn.get(fighterId);
    if (!bySpell) {
      bySpell = new Map();
      this.perTurn.set(fighterId, bySpell);
    }
    bySpell.set(spellId, (bySpell.get(spellId) ?? 0) + 1);

    let bySpellTarget = this.perTarget.get(fighterId);
    if (!bySpellTarget) {
      bySpellTarget = new Map();
      this.perTarget.set(fighterId, bySpellTarget);
    }
    let byTarget = bySpellTarget.get(spellId);
    if (!byTarget) {
      byTarget = new Map();
      bySpellTarget.set(spellId, byTarget);
    }
    byTarget.set(targetId, (byTarget.get(targetId) ?? 0) + 1);
  }

  canCast(
    fighterId: number,
    spellId: number,
    targetId: number,
    castPerTurn: number,
    castPerTarget: number
  ): boolean {
    if (this.remaining(fighterId, spellId) > 0) {
      return false;
    }
    if (castPerTurn > 0) {
      const count = this.perTurn.get(fighterId)?.get(spellId) ?? 0;
      if (count >= castPerTurn) {
        return false;
      }
    }
    if (castPerTarget > 0) {
      const count =
        this.perTarget.get(fighterId)?.get(spellId)?.get(targetId) ?? 0;
      if (count >= castPerTarget) {
        return false;
      }
    }
    return true;
  }

  resetTurn(fighterId: number): void {
    for (const [spellId, turns] of this.cooldowns.get(fighterId) ?? []) {
      this.cooldowns.get(fighterId)?.set(spellId, Math.max(0, turns - 1));
    }
    this.perTurn.delete(fighterId);
    this.perTarget.delete(fighterId);
  }

  clear(): void {
    this.cooldowns.clear();
    this.perTurn.clear();
    this.perTarget.clear();
  }
}
