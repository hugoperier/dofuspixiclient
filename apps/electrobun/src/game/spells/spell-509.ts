/**
 * Visual 509 — Sablier de Xélor (sort 100).
 *
 * Hand-ported against the SpellClip / SpellRuntime composition runtime.
 * Canonical AS source: tools/combat-exporter/output/spell-anims/509/scripts/scripts/
 *
 * Canonical displayType=51 (`sorts.spriteInfos` "51,1,1", sent by the
 * server — QA-181); the module's own TargetCell is only the fallback.
 * The clip moves itself onto `_parent.cellTo` at frame_4, which holds
 * under either. The spell has a single authored sprite
 * (DefineSprite_14) with no library symbols and no attachMovie calls.
 * The animation is a self-contained 120-frame timeline anchored at the
 * target cell. The manifest's `animations` list contains only "anim1"
 * (no `librarySymbols` entries), confirming there are no dynamically
 * attached children.
 *
 * DefineSprite_14 script summary:
 *   frame_4  (index 3):  position self at _parent.cellTo
 *   frame_55 (index 54): SOMA.playSound("many_509")
 *   frame_61 (index 60): this.end() → signalHit
 *   frame_94 (index 93): SOMA.playSound("many_load2")
 *   frame_115(index 114): _parent.removeMovieClip() → spell complete
 *
 * The single symbol "anim1" is registered as a container timeline
 * that drives the above frame scripts. There are no CLIPACTIONRECORD
 * onLoad/onEnterFrame behaviors — the animation is purely timeline-
 * driven with explicit frame scripts.
 *
 * Main timeline: attaches anim1 at root from onSpellStart (no sound on
 * the main timeline itself; sounds are emitted from within anim1's
 * frameScripts).
 */

import type {
  SpellCallbacks,
  SpellContext,
  SpellTextureProvider,
  SymbolDefinition,
} from "@dofus/spell-runtime";
import {
  RuntimeSpell,
  SpellDisplayType,
  calculateAnchor,
} from "@dofus/spell-runtime";

const ANIM1_BOUNDS = {
  width: 181.3,
  height: 156.15,
  offsetX: -85.5,
  offsetY: -110.3,
};

export class Spell509 extends RuntimeSpell {
  readonly spellId = 509;
  readonly displayType = SpellDisplayType.WorldAbsoluteAlt;

  private anim1Sym!: SymbolDefinition;
  private playSound!: (id: string) => void;

  protected registerSymbols(
    textures: SpellTextureProvider,
    _context: SpellContext,
  ): void {
    const anim1Anchor = calculateAnchor(ANIM1_BOUNDS);

    // ---- anim1 — 120-frame target-anchored timeline --------------
    // This is the sole animation for spell 509. It is driven entirely
    // by timeline frame scripts; no dynamic particles or attachMovie
    // calls are present.
    this.anim1Sym = {
      name: "anim1",
      totalFrames: 120,
      frames: textures.getFrames("anim1"),
      anchorX: anim1Anchor.x,
      anchorY: anim1Anchor.y,
      frameScripts: new Map([
        [
          3,
          (clip) => {
            // AS: DefineSprite_14/frame_4/DoAction.as
            // _X = _parent.cellTo.x;
            // _Y = _parent.cellTo.y;
            // root.vars.cellTo is in the container's space (QA-182): the
            // literal translation lands on the target whether the server
            // says 51 (canonical) or the module's own 11. Frames 1-3 are
            // empty, so nothing shows before this move.
            const root = clip.parent;
            const cellTo = root?.vars.cellTo as
              | { x: number; y: number }
              | undefined;
            if (cellTo) {
              clip.x = cellTo.x;
              clip.y = cellTo.y;
            }
          },
        ],
        [
          54,
          () => {
            // AS: DefineSprite_14/frame_55/DoAction.as
            // SOMA.playSound("many_509");
            this.playSound?.("many_509");
          },
        ],
        [
          60,
          () => {
            // AS: DefineSprite_14/frame_61/DoAction.as
            // this.end() — canonical hit signal (damage popup).
            this.runtime.signalHit();
          },
        ],
        [
          93,
          () => {
            // AS: DefineSprite_14/frame_94/DoAction.as
            // SOMA.playSound("many_load2");
            this.playSound?.("many_load2");
          },
        ],
        [
          114,
          (clip) => {
            // AS: DefineSprite_14/frame_115/DoAction.as
            // _parent.removeMovieClip() — ends the spell.
            clip.parent?.remove();
            this.runtime.complete();
          },
        ],
      ]),
    };

    this.registry.register(this.anim1Sym);
  }

  protected onSpellStart(
    callbacks: SpellCallbacks,
    context: SpellContext,
  ): void {
    // Capture playSound for use inside frameScripts (sounds are fired
    // from within the anim1 timeline, not the main timeline).
    this.playSound = callbacks.playSound;

    // Attach the single authored timeline at depth 1. It starts at the
    // container origin; frame_4 moves it onto the target.
    this.root.attach(this.anim1Sym, "anim1", 1, context);
  }
}
