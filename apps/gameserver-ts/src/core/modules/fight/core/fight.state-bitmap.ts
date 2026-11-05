export class FightStateBitmap {
  // Catalogue states are not limited to the named engine constants.
  private active = new Map<number, number>();

  set(id: number, rounds: number): void {
    this.active.set(id, rounds);
  }

  clear(id: number): void {
    this.active.delete(id);
  }

  has(id: number): boolean {
    return this.active.has(id);
  }

  snapshot(): Map<number, number> {
    return new Map(this.active);
  }

  tickDown(): number[] {
    const expired: number[] = [];
    for (const [id, rounds] of this.active) {
      if (rounds < 0) {
        continue;
      }
      if (rounds === 0) {
        this.active.delete(id);
        expired.push(id);
        continue;
      }
      this.active.set(id, rounds - 1);
    }
    return expired;
  }

  clearAll(): void {
    this.active.clear();
  }
}
