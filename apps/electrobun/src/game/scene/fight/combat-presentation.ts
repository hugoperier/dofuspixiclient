/** One ordered presentation stream per combat, shared by all network handlers. */
export interface PresentationScope {
  readonly actionId: number;
  readonly signal: AbortSignal;
  isCurrent(): boolean;
}

export interface PresentationPhases {
  impact: Promise<unknown>;
  finished: Promise<unknown>;
  cleanup?: Promise<unknown>;
}

type Present = (
  scope: PresentationScope
) => void | PresentationPhases | Promise<void | PresentationPhases>;
interface Step {
  present: Present;
  movement?: { actor: string; path: number[] };
}
interface Action {
  id: number;
  steps: Step[];
  lastMovement?: Step;
}

export class CombatPresentation {
  private controller = new AbortController();
  private open: Action | null = null;
  private tail: Promise<void> = Promise.resolve();
  private queued = 0;
  private readonly idle = new Set<() => void>();
  private syntheticId = -1;
  private openDeadline: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly onBusy: (busy: boolean) => void = () => {},
    private readonly onError: (error: unknown) => void = () => {}
  ) {}

  reset(): void {
    if (this.openDeadline !== null) {
      clearTimeout(this.openDeadline);
    }
    this.openDeadline = null;
    this.controller.abort();
    this.controller = new AbortController();
    this.open = null;
    this.queued = 0;
    this.tail = Promise.resolve();
    this.publish();
  }

  get busy(): boolean {
    return this.open !== null || this.queued > 0;
  }

  begin(id: number): void {
    // A malformed/unclosed action must not discard already received effects.
    if (this.open) {
      this.flush();
    }
    this.open = { id, steps: [] };
    this.openDeadline = setTimeout(() => {
      this.onError(
        new Error(`Action ${id}: GameActionsFinish absent après 15 secondes`)
      );
      this.flush();
    }, 15_000);
    this.publish();
  }

  finish(id: number): void {
    if (this.open?.id === id) {
      this.flush();
    }
  }

  enqueue(present: Present, options: { statistic?: boolean } = {}): void {
    if (this.open) {
      this.open.steps.push({ present });
      if (!options.statistic) {
        this.open.lastMovement = undefined;
      }
    } else {
      this.schedule({ id: this.syntheticId--, steps: [{ present }] });
    }
  }

  move(
    actor: string,
    path: readonly number[],
    present: (path: number[], scope: PresentationScope) => Promise<void>
  ): void {
    const previous = this.open?.lastMovement;
    if (
      previous?.movement?.actor === actor &&
      previous.movement.path[previous.movement.path.length - 1] === path[0]
    ) {
      previous.movement.path.push(...path.slice(1));
      return;
    }
    const movement = { actor, path: [...path] };
    const step: Step = {
      movement,
      present: (scope) => present(movement.path, scope),
    };
    if (this.open) {
      this.open.steps.push(step);
      this.open.lastMovement = step;
    } else {
      this.schedule({ id: this.syntheticId--, steps: [step] });
    }
  }

  whenIdle(): Promise<void> {
    return this.busy
      ? new Promise((resolve) => this.idle.add(resolve))
      : Promise.resolve();
  }

  private flush(): void {
    if (this.openDeadline !== null) {
      clearTimeout(this.openDeadline);
    }
    this.openDeadline = null;
    const action = this.open;
    this.open = null;
    if (action) {
      this.schedule(action);
    }
  }

  private schedule(action: Action): void {
    const controller = this.controller;
    this.queued++;
    this.publish();
    this.tail = this.tail
      .then(async () => {
        if (controller.signal.aborted) {
          return;
        }
        const actionController = new AbortController();
        const cancel = () => actionController.abort();
        controller.signal.addEventListener("abort", cancel, { once: true });
        let active = true;
        const scope: PresentationScope = {
          actionId: action.id,
          signal: actionController.signal,
          isCurrent: () => active && !actionController.signal.aborted,
        };
        const aborted = new Promise<never>((_, reject) => {
          actionController.signal.addEventListener(
            "abort",
            () => reject(new Error(`Action ${action.id} annulée`)),
            { once: true }
          );
        });
        // A broken clip must release the same presentation barrier as a missing asset.
        const deadline = setTimeout(() => {
          this.onError(
            new Error(
              `Action ${action.id}: présentation bloquée après 15 secondes`
            )
          );
          cancel();
        }, 15_000);
        const present = async () => {
          const blocking: Promise<unknown>[] = [];
          for (const step of action.steps) {
            if (!scope.isCurrent()) {
              return;
            }
            try {
              const phases = await step.present(scope);
              if (phases) {
                // Attach rejection handlers immediately, including to cleanup tails.
                blocking.push(phases.finished.catch(this.onError));
                void phases.cleanup?.catch(this.onError);
                await phases.impact;
              }
            } catch (error) {
              this.onError(error);
            }
          }
          await Promise.all(blocking);
        };
        try {
          await Promise.race([present(), aborted]);
        } catch (error) {
          if (!actionController.signal.aborted) {
            this.onError(error);
          }
        } finally {
          active = false;
          clearTimeout(deadline);
          controller.signal.removeEventListener("abort", cancel);
        }
      })
      .finally(() => {
        if (this.controller !== controller) {
          return;
        }
        this.queued--;
        this.publish();
      });
  }

  private publish(): void {
    this.onBusy(this.busy);
    if (!this.busy) {
      for (const resolve of this.idle) {
        resolve();
      }
      this.idle.clear();
    }
  }
}
