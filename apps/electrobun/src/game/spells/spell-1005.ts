import { IndependentTimelineSpell } from "../scene/fight/independent-timeline-spell";
import timeline from "./spell-1005-timeline.json";

/** Parent/child AS2 timelines extracted with tools/combat-exporter/bin/extract-610. */
export class Spell1005 extends IndependentTimelineSpell {
  readonly spellId = 1005;
  protected readonly timeline = timeline;
  protected readonly childStartRange = 90;
  protected readonly childStartOffset = 1;
  protected readonly childStopFrame = 147;
  protected readonly hitFrame = 99;
  protected readonly endFrame = 153;
  protected readonly childSound = { frame: 90, id: "crockette_1005" };
  protected readonly randomChildTransform = true;
}
