/**
 * Spell harness — clean TS port of `ank.battlefield.VisualEffectHandler`
 * `onLoadInit(mc)` (assets/sources/client-code/ank/battlefield/
 * VisualEffectHandler.as:56-232). The canonical Flash code dispatched
 * on the spell's `displayType` (an enum stored on the outer movie
 * clip) to do one of five things to the root clip + its children:
 *
 *   10/12  CasterCell        : root anchored at caster cell
 *   11     TargetCell        : root anchored at target cell
 *   20/21  ProjectileLinear  : root at caster, "shoot" attached at
 *                              target-relative offset, container
 *                              rotated to face target
 *   30/31  ProjectileBallistic: root at caster (-10 px y), "move"
 *                              attached + drives a parabolic arc to
 *                              target, then "shoot" attached at impact
 *   40/41  BeamLine          : root at caster, periodic "duplicate"
 *                              clips dropped along caster→target line
 *   50/51  WorldAbsolute     : root at world origin (0,0); per-spell
 *                              scripts position children using
 *                              `_parent.cellFrom` / `_parent.cellTo`
 *
 * The harness's responsibility is the SHARED logic — spawning the
 * canonical "move" / "shoot" / "duplicate" symbols, driving the
 * parabolic / linear motion loops, exposing `cellFrom`/`cellTo`/
 * `angle` on the root for displayType 50/51 spells. Per-spell modules
 * register their library symbols (baton, baton2, effet, cercle, …)
 * and the harness orchestrates them at the displayType level.
 */

import { SpellDisplayType } from "../spell-interface.ts";

import type { SpellRuntime } from "./runtime.ts";

export interface HarnessSetup {
  runtime: SpellRuntime;
  displayType: number;
  /** Caster cell screen position in world pixels. */
  caster: { x: number; y: number };
  /** Target cell screen position in world pixels. */
  target: { x: number; y: number };
  /** Spell level (1-6). Forwarded to root.vars.level. */
  level: number;
  /**
   * Names of the canonical projectile-motion symbols. Defaults to
   * the AS conventions ("move" + "shoot" + "duplicate"). Per-spell
   * registries must register these symbols before calling configure().
   */
  symbols?: {
    move?: string;
    shoot?: string;
    duplicate?: string;
  };
}

const DEFAULT_SYMBOLS = {
  move: "move",
  shoot: "shoot",
  duplicate: "duplicate",
};

/**
 * Configure a runtime's root clip per its displayType. Called once
 * by the per-spell module right after it registers its library
 * symbols. After this returns, the runtime is ready to start ticking.
 *
 * The runtime root is positioned by the spell-view at the canonical
 * displayType anchor in WORLD coords (see `resolveAnchor`). This
 * function then operates entirely in CONTAINER-LOCAL coords — root
 * stays at (0,0) for every displayType, and projectile motion / line
 * dropping happens in deltas relative to that anchor.
 *
 * Mirrors VisualEffectHandler.as:85-232 verbatim, just expressed in
 * idiomatic TS (radians / decimal scale / 0-1 alpha) rather than
 * Flash units.
 */
export function configureHarness(setup: HarnessSetup): void {
  const { runtime, displayType, caster, target, level } = setup;
  const symbols = { ...DEFAULT_SYMBOLS, ...setup.symbols };
  const root = runtime.root;

  // The container origin equals the displayType anchor in WORLD
  // coords (set by spell-view). All cell-relative deltas computed
  // below are in container-LOCAL coords.
  const anchor = resolveAnchor(displayType, caster, target);
  const casterLocal = { x: caster.x - anchor.x, y: caster.y - anchor.y };
  const targetLocal = { x: target.x - anchor.x, y: target.y - anchor.y };

  // Always populate root.vars with the canonical _parent properties
  // — per-spell scripts read these regardless of displayType.
  //
  // `cellFrom` / `cellTo` are in the CONTAINER's space, not the world's.
  // That is what they are in 1.29: `mc.cellFrom = {x: sprite.mc._x, …}`
  // is set only for 50/51 (VisualEffectHandler.as:224), where `mc` sits
  // at the battlefield origin, so a script's `_X = _parent.cellTo.x`
  // lands on the target. Handing out world coordinates under any other
  // anchor put that same script at anchor + target — twice the target's
  // position, which is where Horloge drew itself (QA-182). Under 50/51
  // the anchor is (0,0) and nothing changes.
  root.vars.level = level;
  root.vars.cellFrom = casterLocal;
  root.vars.cellTo = targetLocal;
  // AS stored angle in DEGREES; the runtime API uses RADIANS, so
  // expose both. Compiler-emitted code reads `_parent.angle` in
  // degrees so we mirror that convention.
  root.vars.angle =
    (Math.atan2(target.y - caster.y, target.x - caster.x) * 180) / Math.PI;

  switch (displayType) {
    case SpellDisplayType.CasterCell:
    case SpellDisplayType.CasterCellAlt:
    case SpellDisplayType.TargetCell:
      // Root already at container origin (0,0). Per-spell module
      // attaches its content at root and it lands at the anchor.
      return;

    case SpellDisplayType.ProjectileLinear:
    case SpellDisplayType.ProjectileLinearAlt: {
      // VisualEffectHandler.as:96-104:
      //   mc.rotate._rotation = mc.angle;
      //   shoot = mc.attachMovie("shoot","shoot",10);
      //   shoot._x = dx; shoot._y = dy;
      // Only the SWF's `rotate` instance turns toward the target; `shoot`
      // sits on `mc` itself, UNROTATED, on the target. The exported
      // main-timeline composite is that `rotate` content, so the root
      // turns — and `shoot`, its child, is counter-rotated onto the
      // target: R(-θ)·(dx, dy) = (|d|, 0), rotation -θ. It used to be
      // placed at (dx, dy) inside the turned root, i.e. off the target
      // whenever the angle was not zero (QA-181).
      const dx = targetLocal.x - casterLocal.x;
      const dy = targetLocal.y - casterLocal.y;
      const angle = Math.atan2(dy, dx);
      const distance = Math.hypot(dx, dy);
      root.rotation = angle;
      // cellFrom / cellTo stay in the root's own frame, now turned (as
      // for the anchor, QA-182): caster at the origin, target straight
      // ahead. `angle` stays the world angle, as `mc.angle` is in 1.29 —
      // clips inside the counter-turned `shoot` read it in world space.
      // A main-timeline clip that turns itself (`_rotation =
      // _parent.angle`, 406's sprite22) must subtract `root.rotation`, or
      // it faces the target twice over.
      root.vars.cellFrom = { x: 0, y: 0 };
      root.vars.cellTo = { x: distance, y: 0 };
      attachIfRegistered(
        runtime,
        symbols.shoot,
        "shoot",
        10,
        distance,
        0,
        -angle
      );
      return;
    }

    case SpellDisplayType.ProjectileBallistic:
    case SpellDisplayType.ProjectileBallisticAlt: {
      // The classic "throwable" path. Mirror VisualEffectHandler.as:
      // 110-170 maths, expressed as a TS onEnterFrame on the root.
      // Root stays at (0,0); "move" starts at (0,0) and parabolas
      // toward (xDest, yDest) in container-local coords.
      attachIfRegistered(runtime, symbols.move, "move", 2, 0, 0);

      const arcFactor =
        displayType === SpellDisplayType.ProjectileBallisticAlt ? 0.9 : 0.5;
      // Canonical AS speeds for displayType=30 / 31, divided by 3
      // because we tick at the TRIPLEFRAMERATE 60 fps rate (see
      // FLASH_FPS in runtime.ts). VisualEffectHandler.as:117 does the
      // same `if (TRIPLEFRAMERATE) speed /= 3` adjustment so the
      // absolute wall speed stays at the canonical 13.5 t-units/sec.
      const speed =
        displayType === SpellDisplayType.ProjectileBallisticAlt
          ? 0.5 / 3
          : 0.675 / 3;
      const halfPi = Math.PI / 2;
      // Caster is at (0,0) within the container (anchor was resolved
      // to caster.y-10 by resolveAnchor for displayType 30/31). The
      // target's container-local position is targetLocal.
      const dx = targetLocal.x;
      const dy = targetLocal.y;
      const xDest = Math.abs(dx);
      const yDest = dy;
      const launchAngle =
        (Math.atan2(yDest, xDest) + halfPi) * arcFactor - halfPi;
      const g = 9.81;
      const halfg = g / 2;
      const denom = Math.max(
        Math.abs(yDest - Math.tan(launchAngle) * xDest),
        0.001
      );
      const vx = Math.sqrt((halfg * xDest * xDest) / denom);
      const vy = Math.tan(launchAngle) * vx;
      const xSign = Math.sign(dx || 1);
      let t = 0;

      // The arc runs whether or not the SWF has a `move` symbol: in
      // VisualEffectHandler.as:139-168 `this.move._x = x` on a missing
      // clip is a no-op, and the landing branch still attaches `shoot`
      // and calls `this.end()`. Waiting for `move` meant a visual without
      // one (gfx 1100 under Désinvocation's 31) never signalled its hit.
      root.onEnterFrame = (clip, _ctx) => {
        const move = clip.children.get(symbols.move);
        const vyi = vy + g * t;
        const x = t * vx;
        const y = halfg * t * t + vy * t;
        t += speed;
        if ((Math.abs(y) >= Math.abs(yDest) && x >= xDest) || x > xDest) {
          // LANDED. Attach "shoot" at target offset, signal hit, kill
          // the move clip + onEnterFrame loop.
          //
          // Canonical VisualEffectHandler.as:156-159:
          //   this.attachMovie("shoot","shoot",2);
          //   this.shoot._x = xDest;
          //   this.shoot._y = yDest;
          //   this.shoot._rotation = Math.atan(vyi/vx) * 180/PI;
          //
          // Of the 53 shoot symbols across all spells, 33 reset
          // `_rotation = 0` in their own frame_1 (canonical
          // override → upright thorns) and 20 don't (canonical keeps
          // the velocity angle for arrow / linear-projectile shoots).
          // We pass the rotation via the `transform` param so
          // attach() applies it BEFORE running shoot's frame_1, which
          // matches canonical execution order.
          move?.remove();
          attachIfRegistered(
            runtime,
            symbols.shoot,
            "shoot",
            2,
            xSign * xDest,
            yDest,
            Math.atan2(vyi, xSign * vx)
          );
          runtime.signalHit();
          clip.onEnterFrame = null;
        } else if (move) {
          move.x = xSign * x;
          move.y = y;
          move.rotation = Math.atan2(vyi, xSign * vx);
        }
      };
      return;
    }

    case SpellDisplayType.BeamLine:
    case SpellDisplayType.BeamLineAlt: {
      // Periodic "duplicate" drops along the caster→target line in
      // container-local coords. Caster sits at (0,0) within the
      // container (BeamLine anchor = caster); target's local pos is
      // targetLocal.
      const dxB = targetLocal.x;
      const dyB = targetLocal.y;
      const rot = Math.atan2(dyB, dxB);
      const fullDist = Math.sqrt(dxB * dxB + dyB * dyB);
      const dropEvery = 20; // canonical _loc24_ = 20
      // Caster on the target (fullDist 0) made this 0/0 = NaN in 1.29 too,
      // and `dist > fullDist` then never held: the beam never ended. A
      // degenerate line arrives at once.
      const steps = Math.floor(fullDist / dropEvery);
      const interval = steps > 0 ? fullDist / steps : Number.POSITIVE_INFINITY;
      let dist = 0;
      let inc = 1;
      const altType = displayType === SpellDisplayType.BeamLineAlt;
      root.onEnterFrame = (clip) => {
        dist += interval;
        if (dist > fullDist) {
          if (altType) {
            attachIfRegistered(
              runtime,
              symbols.shoot,
              "shoot",
              10,
              dxB,
              dyB
            );
          }
          runtime.signalHit();
          clip.onEnterFrame = null;
          return;
        }
        const dup = attachIfRegistered(
          runtime,
          symbols.duplicate,
          `duplicate${inc}`,
          inc,
          dist * Math.cos(rot),
          dist * Math.sin(rot)
        );
        if (dup) {
          dup.rotation = rot;
        }
        inc++;
      };
      return;
    }

    case SpellDisplayType.WorldAbsolute:
    case SpellDisplayType.WorldAbsoluteAlt:
      // Anchor is (0,0); container is at world origin; per-spell
      // scripts position children via _parent.cellFrom /
      // _parent.cellTo, which here coincide with world coords.
      return;

    default:
      // Unknown displayType — leave root at (0,0); spell-view's
      // resolveAnchor() falls back to TargetCell so the container is
      // already at the target.
      return;
  }
}

/**
 * Resolve the canonical screen anchor for a per-spell child relative
 * to the spell container origin. Per-spell modules use this for
 * displayType 11 / 50 / 51 visuals where the spell positions its own
 * children explicitly.
 */
export function resolveAnchor(
  displayType: number,
  caster: { x: number; y: number },
  target: { x: number; y: number }
): { x: number; y: number } {
  switch (displayType) {
    case SpellDisplayType.CasterCell:
    case SpellDisplayType.CasterCellAlt:
    case SpellDisplayType.ProjectileLinear:
    case SpellDisplayType.ProjectileLinearAlt:
    case SpellDisplayType.BeamLine:
    case SpellDisplayType.BeamLineAlt:
      return caster;
    case SpellDisplayType.ProjectileBallistic:
    case SpellDisplayType.ProjectileBallisticAlt:
      return { x: caster.x, y: caster.y - 10 };
    case SpellDisplayType.WorldAbsolute:
    case SpellDisplayType.WorldAbsoluteAlt:
      return { x: 0, y: 0 };
    case SpellDisplayType.TargetCell:
    default:
      return target;
  }
}

function attachIfRegistered(
  runtime: SpellRuntime,
  symbolName: string,
  instanceName: string,
  depth: number,
  x: number,
  y: number,
  rotation?: number
) {
  const sym = runtime.registry.resolve(symbolName);
  if (!sym) {
    return null;
  }
  // Pass transform via attach() so onLoad + frame_1 see the canonical
  // post-attach _x/_y/_rotation values BEFORE running. Per-spell
  // frame_1 scripts can override these (e.g. shoot's `_rotation = 0`).
  return runtime.root.attach(sym, instanceName, depth, runtime.context, {
    x,
    y,
    ...(rotation !== undefined ? { rotation } : {}),
  });
}
