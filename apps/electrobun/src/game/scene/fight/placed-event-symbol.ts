import type { SymbolDefinition } from "@dofus/spell-runtime";

/**
 * A PlaceObject clip event executes on the placed child, with the authored
 * DefineSprite as its parent. Keep that parent when an exported module puts
 * the event handlers and the child's drawing on a single symbol. In particular,
 * `_parent.removeMovieClip()` removes this instance, never the spell timeline.
 */
export function withClipEventParent(child: SymbolDefinition): SymbolDefinition {
  return {
    name: child.name,
    totalFrames: 1,
    frames: [],
    anchorX: 0,
    anchorY: 0,
    onLoad(parent, context) {
      parent.attach(child, "placed", 1, context);
    },
  };
}
