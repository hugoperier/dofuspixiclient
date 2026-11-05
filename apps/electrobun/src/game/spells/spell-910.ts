/**
 * Visual 910 — Flèche Explosive (sort 179, Crâ).
 *
 * Hand-ported against the SpellClip / SpellRuntime composition runtime.
 * Canonical AS source: tools/combat-exporter/output/spell-anims/910/scripts/scripts/
 *
 * displayType=31 (ProjectileBallisticAlt) — `sorts.spriteInfos` "31,…",
 * the only spell on this visual (QA-181). The SWF exports no `move`, so
 * the arc of VisualEffectHandler.as:139-168 runs with nothing drawn; at
 * landing the harness attaches `shoot` on the target and calls `end()`
 * (signalHit). The module used to attach `shoot` itself at once and signal
 * the hit on its first frame, written against a guessed TargetCell.
 *
 * Canonical AS layout:
 *   - DefineSprite_15_shoot/frame_1/DoAction.as:
 *       SOMA.playSound("explosion");
 *   - DefineSprite_15_shoot/frame_1/DoAction_2.as:
 *       _rotation = 0;
 *   - DefineSprite_15_shoot/frame_70/DoAction.as:
 *       _parent.removeMovieClip(); stop();
 *
 * The harness (displayType=11) attaches `shoot` at the target cell.
 * shoot's frame_1 plays the explosion sound and resets rotation to 0.
 * At frame_70 the outer mc is removed and the spell completes.
 *
 * signalHit is fired at frame_1 (impact frame — the first visible
 * explosion frame), which is canonical for TargetCell impact spells.
 *
 * Library symbols: none (shoot has authored SVG frames, no runtime
 * attachMovie calls).
 *
 * Main timeline: no explicit frame_1 DoAction on the outer timeline;
 * sound is fired from inside shoot's frame_1. No onSpellStart override
 * needed beyond the default no-op.
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

const SHOOT_BOUNDS = {
  width: 205.1,
  height: 133.45,
  offsetX: -102.5,
  offsetY: -71.85,
};

export class Spell910 extends RuntimeSpell {
  readonly spellId = 910;
  readonly displayType = SpellDisplayType.ProjectileBallisticAlt;

  private playExplosionSound?: () => void;

  protected registerSymbols(
    textures: SpellTextureProvider,
    context: SpellContext,
  ): void {
    const shootAnchor = calculateAnchor(SHOOT_BOUNDS);

    // ---- shoot — 84-frame impact explosion at target cell --------
    // Attached on the target by the ballistic harness at landing, which
    // also signals the hit. Its frame_1 scripts fire on attach.
    const shootSym: SymbolDefinition = {
      name: "shoot",
      totalFrames: 84,
      frames: textures.getFrames("shoot"),
      anchorX: shootAnchor.x,
      anchorY: shootAnchor.y,
      frameScripts: new Map([
        [
          0,
          (clip) => {
            // AS: DefineSprite_15_shoot/frame_1/DoAction.as
            // SOMA.playSound("explosion");
            if (this.playExplosionSound) {
              this.playExplosionSound();
            }
            // AS: DefineSprite_15_shoot/frame_1/DoAction_2.as
            // _rotation = 0;  (upright, whatever the landing velocity)
            clip.rotation = 0;
          },
        ],
        [
          69,
          (clip) => {
            // AS: DefineSprite_15_shoot/frame_70/DoAction.as
            // _parent.removeMovieClip(); stop();
            clip.parent?.remove();
            clip.stop();
            this.runtime.complete();
          },
        ],
      ]),
    };

    this.registry.register(shootSym);
  }

  protected onSpellStart(
    callbacks: SpellCallbacks,
    _context: SpellContext,
  ): void {
    // Capture the sound callback for shoot's frame_1 (the canonical
    // SOMA.playSound("explosion")). Nothing to attach: the harness lands
    // `shoot` on the target.
    this.playExplosionSound = () => {
      callbacks.playSound("explosion");
    };
  }
}
