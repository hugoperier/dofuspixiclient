import type { MouseEvent } from "react";

import { playAudioEvent } from "@/game/audio/audio-events";
/** One delegated handler prevents nested button/label clicks from doubling. */
export function audioClick(event: MouseEvent<HTMLElement>): void {
  if (!(event.target instanceof Element)) {
    return;
  }
  const control = event.target.closest(
    "button, [role=button], [role=tab], input[type=checkbox]"
  );
  // React also bubbles clicks from HUD menus rendered through a portal.
  if (!control) {
    return;
  }
  if (control.matches(":disabled, [aria-disabled=true]")) {
    return;
  }
  const name = control.closest("[data-audio]")?.getAttribute("data-audio");
  if (name === "off") {
    return;
  }
  playAudioEvent(name === "click2" || name === "click3" ? name : "click");
}
