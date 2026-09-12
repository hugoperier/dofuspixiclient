import { IndependentTimelineSpell } from "../scene/fight/independent-timeline-spell";
import timeline from "./spell-2112-timeline.json";

/** Parent/child AS2 timelines extracted with tools/combat-exporter/bin/extract-610. */
export class Spell2112 extends IndependentTimelineSpell {
  readonly spellId = 2112;
  protected readonly timeline = timeline;
  protected readonly childStartRange = 15;
  protected readonly childStopFrame = 39;
  protected readonly hitFrame = 6;
  protected readonly endFrame = 93;
  protected readonly hitSound = "dodge_610";
}
