import {
  type Application,
  BlurFilter,
  type Container,
  type Filter,
  RenderTexture,
  Sprite,
  Ticker,
} from "pixi.js";

import { createLogger } from "@/utils/logger";

const log = createLogger("MapTransition");

/**
 * Smooth map-to-map transition using snapshot + crossfade blur.
 *
 * Flow:
 *  1. `startTransition()` — captures mapContainer into a snapshot.
 *
 *  2. `reveal()` — called when new map + actors are ready.
 *     The snapshot fades out while the new map unblurs. Both stay in place.
 */
export class MapTransition {
  private generation = 0;
  private app: Application;
  private mapContainer: Container;

  private snapshot: Sprite | null = null;
  private snapshotTexture: RenderTexture | null = null;
  private snapshotBlur: BlurFilter | null = null;
  private mapBlur: BlurFilter | null = null;

  private transitioning = false;
  private transitionStartTime = 0;

  /** Persistent filters on mapContainer that must survive transitions */
  private baseFilters: Filter[] = [];

  /** Cancel handles for running animations */
  private activeAnimations: (() => void)[] = [];

  // Tuning
  private readonly MAX_BLUR = 8;
  private readonly BLUR_UP_MS = 150;
  private readonly MIN_COVER_MS = 100;
  private readonly REVEAL_MS = 200;

  constructor(
    app: Application,
    mapContainer: Container,
    baseFilters: Filter[] = []
  ) {
    this.app = app;
    this.mapContainer = mapContainer;
    this.baseFilters = baseFilters;
  }

  /**
   * Capture snapshot and start loading animation. Non-blocking.
   */
  startTransition(): void {
    this.cleanup();

    // Nothing to snapshot on first load
    if (this.mapContainer.children.length === 0) {
      return;
    }

    const bounds = this.mapContainer.getBounds();

    if (bounds.width === 0 || bounds.height === 0) {
      return;
    }

    this.transitioning = true;
    this.transitionStartTime = performance.now();

    const pad = Math.ceil(this.MAX_BLUR) + 4;

    const origX = this.mapContainer.x;
    const origY = this.mapContainer.y;
    try {
      this.snapshotTexture = RenderTexture.create({
        width: this.app.screen.width + pad * 2,
        height: this.app.screen.height + pad * 2,
      });
      this.mapContainer.position.set(origX + pad, origY + pad);
      this.app.renderer.render({
        container: this.mapContainer,
        target: this.snapshotTexture,
      });
    } catch (error) {
      // The snapshot is cosmetic; a GPU failure must not abort the map load.
      log.error("Map snapshot failed; continuing without transition", error);
      this.cleanup();
      return;
    } finally {
      this.mapContainer.position.set(origX, origY);
    }

    this.snapshot = new Sprite(this.snapshotTexture);
    this.snapshot.label = "map-transition-snapshot";
    this.snapshot.position.set(-pad, -pad);

    const mapIndex = this.app.stage.getChildIndex(this.mapContainer);
    this.app.stage.addChildAt(this.snapshot, mapIndex + 1);

    this.snapshotBlur = new BlurFilter({ strength: 0, quality: 3 });
    this.snapshot.filters = [this.snapshotBlur];

    this.startAnimation(this.BLUR_UP_MS, (t) => {
      if (this.snapshotBlur) {
        this.snapshotBlur.strength = t * this.MAX_BLUR;
      }
    });
  }

  /**
   * Reveal the new map with a stationary crossfade.
   */
  async reveal(): Promise<void> {
    if (!this.transitioning) {
      return;
    }

    const generation = this.generation;
    const elapsed = performance.now() - this.transitionStartTime;
    const remaining = this.MIN_COVER_MS - elapsed;

    if (remaining > 0) {
      await this.delay(remaining);
    }

    if (generation !== this.generation) {
      return;
    }
    this.cancelAnimations();

    await this.revealWithCrossfade();
    if (generation === this.generation) {
      this.finishTransition();
    }
  }

  isTransitioning(): boolean {
    return this.transitioning;
  }

  cleanup(): void {
    this.generation++;
    this.cancelAnimations();
    this.removeSnapshot();
    this.removeMapBlur();
    this.transitioning = false;
  }

  destroy(): void {
    this.cleanup();
  }

  /**
   * Snapshot fades out while mapContainer unblurs.
   */
  private async revealWithCrossfade(): Promise<void> {
    this.mapBlur = new BlurFilter({
      strength: this.MAX_BLUR,
      quality: 3,
    });
    this.mapBlur.padding = this.MAX_BLUR + 4;
    this.mapContainer.filters = [...this.baseFilters, this.mapBlur];

    await this.animateAsync(this.REVEAL_MS, (t) => {
      if (this.mapBlur) {
        this.mapBlur.strength = this.MAX_BLUR * (1 - t);
      }

      if (this.snapshot) {
        this.snapshot.alpha = 1 - t;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private finishTransition(): void {
    this.removeSnapshot();
    this.removeMapBlur();
    this.transitioning = false;
  }

  private removeSnapshot(): void {
    if (this.snapshot) {
      this.snapshot.filters = null;
      this.snapshot.parent?.removeChild(this.snapshot);
      this.snapshot.destroy();
      this.snapshot = null;
    }

    this.snapshotBlur = null;

    if (this.snapshotTexture) {
      this.snapshotTexture.destroy(true);
      this.snapshotTexture = null;
    }
  }

  private removeMapBlur(): void {
    if (this.mapBlur) {
      this.mapContainer.filters =
        this.baseFilters.length > 0 ? this.baseFilters : null;
      this.mapBlur = null;
    }
  }

  private cancelAnimations(): void {
    for (const cancel of this.activeAnimations) {
      cancel();
    }

    this.activeAnimations = [];
  }

  /** Fire-and-forget animation (for blur-up during load) */
  private startAnimation(
    durationMs: number,
    onTick: (t: number) => void
  ): void {
    const ticker = Ticker.shared;
    let elapsed = 0;

    const tick = () => {
      elapsed += ticker.deltaMS;
      const raw = Math.min(elapsed / durationMs, 1);
      onTick(this.easeOut(raw));

      if (raw >= 1) {
        ticker.remove(tick);
        this.activeAnimations = this.activeAnimations.filter(
          (c) => c !== cancel
        );
      }
    };

    const cancel = () => ticker.remove(tick);
    this.activeAnimations.push(cancel);
    ticker.add(tick);
  }

  /** Awaitable animation for the reveal crossfade */
  private animateAsync(
    durationMs: number,
    onTick: (t: number) => void
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const ticker = Ticker.shared;
      let elapsed = 0;

      const tick = () => {
        elapsed += ticker.deltaMS;
        const raw = Math.min(elapsed / durationMs, 1);
        onTick(this.easeInOut(raw));

        if (raw >= 1) {
          ticker.remove(tick);
          this.activeAnimations = this.activeAnimations.filter(
            (c) => c !== cancel
          );
          resolve();
        }
      };

      const cancel = () => {
        ticker.remove(tick);
        resolve();
      };

      this.activeAnimations.push(cancel);
      ticker.add(tick);
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private easeOut(t: number): number {
    return 1 - (1 - t) ** 2;
  }

  private easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  }
}
