import { IndependentTimelineSpell } from "../scene/fight/independent-timeline-spell";
import timeline from "./spell-610-timeline.json";

/** Parent/child AS2 timelines extracted with tools/combat-exporter/bin/extract-610. */
export class Spell610 extends IndependentTimelineSpell {
  readonly spellId = 610;
  protected readonly timeline = timeline;
  protected readonly childStartRange = 30;
  protected readonly childStopFrame = 39;
  protected readonly hitFrame = 6;
  protected readonly endFrame = 93;
  protected readonly hitSound = "dodge_610";
}
