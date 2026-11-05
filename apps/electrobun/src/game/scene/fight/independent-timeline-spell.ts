import {
  calculateAnchor,
  type FrameScript,
  RuntimeSpell,
  type SpellCallbacks,
  type SpellContext,
  SpellDisplayType,
  type SpellTextureProvider,
  type SymbolDefinition,
} from "@dofus/spell-runtime";
import { Matrix } from "pixi.js";

interface Timeline {
  childName: string;
  depths: number[];
  bounds: Record<
    string,
    {
      frameCount: number;
      width: number;
      height: number;
      offsetX: number;
      offsetY: number;
    }
  >;
  placements: { depth: number; matrix: number[]; alpha: number }[][];
}

/** Authored placement, child playhead and child transforms have separate owners. */
export abstract class IndependentTimelineSpell extends RuntimeSpell {
  readonly displayType = SpellDisplayType.TargetCell;
  protected abstract readonly timeline: Timeline;
  protected abstract readonly childStartRange: number;
  protected readonly childStartOffset: number = 0;
  protected abstract readonly childStopFrame: number;
  protected abstract readonly hitFrame: number;
  protected abstract readonly endFrame: number;
  protected readonly hitSound?: string;
  protected readonly childSound?: { frame: number; id: string };
  protected readonly randomChildTransform: boolean = false;
  private playSound?: (id: string) => void;

  protected registerSymbols(textures: SpellTextureProvider): void {
    const timeline = this.timeline;
    for (const [name, bounds] of Object.entries(timeline.bounds)) {
      const anchor = calculateAnchor(bounds);
      const scripts = new Map<number, FrameScript>();
      if (name === timeline.childName) {
        scripts.set(this.childStopFrame, (clip) => clip.stop());
        if (this.childSound) {
          scripts.set(this.childSound.frame, () =>
            this.playSound?.(this.childSound!.id)
          );
        }
      }
      this.registry.register({
        name,
        totalFrames: bounds.frameCount,
        frames: textures.getFrames(name),
        anchorX: anchor.x,
        anchorY: anchor.y,
        frameScripts: scripts,
        onLoad:
          name === timeline.childName
            ? (clip, context) => {
                const start =
                  Math.floor(Math.random() * this.childStartRange) +
                  this.childStartOffset;
                clip.gotoAndPlay(start);
                // gotoAndPlay lands on the target frame before the next runtime tick.
                scripts.get(start)?.(clip, context);
                if (this.randomChildTransform) {
                  clip.scaleX = clip.scaleY =
                    (10 + Math.floor(Math.random() * 60)) / 100;
                  clip.alpha = (30 + Math.floor(Math.random() * 70)) / 100;
                }
              }
            : undefined,
      });
    }
    const child = this.registry.resolve(timeline.childName);
    if (!child) {
      throw new Error(`${this.spellId}: ${timeline.childName} missing`);
    }
    const placementSymbol: SymbolDefinition = {
      name: "placement",
      totalFrames: 1,
      frames: [],
      anchorX: 0,
      anchorY: 0,
      onLoad: (clip, context) => {
        clip.attach(child, "drawing", 1, context);
      },
    };
    const scripts = new Map<number, FrameScript>();
    const totalFrames = timeline.placements.length * 3;
    for (let frame = 0; frame < totalFrames; frame++) {
      scripts.set(frame, (clip, context) => {
        const placements = timeline.placements[Math.floor(frame / 3)] ?? [];
        const present = new Set(
          placements.map((placement) => `particle_${placement.depth}`)
        );
        for (const [name, child] of clip.children) {
          if (name.startsWith("particle_") && !present.has(name)) {
            child.remove();
          }
        }
        for (const placement of placements) {
          const name = `particle_${placement.depth}`;
          const wrapper =
            clip.children.get(name) ??
            clip.attach(placementSymbol, name, placement.depth, context);
          const m = placement.matrix;
          wrapper.container.setFromMatrix(
            new Matrix(m[0], m[1], m[2], m[3], m[4], m[5])
          );
          wrapper.alpha = placement.alpha;
        }
        if (frame === this.hitFrame) {
          this.runtime.signalHit();
          if (this.hitSound) {
            this.playSound?.(this.hitSound);
          }
        }
        if (frame === this.endFrame) {
          clip.remove();
          this.runtime.complete();
        }
      });
    }
    this.registry.register({
      name: "parent",
      totalFrames,
      frames: [],
      anchorX: 0,
      anchorY: 0,
      onLoad: (clip, context) => {
        clip.container.sortableChildren = true;
        for (const depth of timeline.depths) {
          const symbol = this.registry.resolve(`depth_${depth}`);
          if (symbol) {
            clip.attach(symbol, `depth_${depth}`, depth, context);
          }
        }
      },
      frameScripts: scripts,
    });
  }

  protected onSpellStart(
    callbacks: SpellCallbacks,
    context: SpellContext
  ): void {
    this.playSound = callbacks.playSound;
    const parent = this.registry.resolve("parent");
    if (parent) {
      this.root.attach(parent, "parent", 1, context);
    }
  }
}
