import type { ChatSegment } from "@/game/stores/chat-store";
import { appendInfoMessage } from "@/game/stores/chat-store";

/**
 * The one place combat lines are worded.
 *
 * Every line is built from plain strings and emphasised runs, then
 * flattened once: the store keeps the flat text for filtering and the
 * runs for rendering, so no call site has to think about either.
 */

/** A combatant's name — bold and underlined, so it reads out of the log. */
export function combatant(name: string): ChatSegment {
  return { text: name, bold: true, underline: true };
}

/** A spell or weapon name — bold, as 1.29 words it. */
export function emphasis(text: string): ChatSegment {
  return { text, bold: true };
}

export function fightLog(...parts: (string | ChatSegment)[]): void {
  const segments = parts.map((part) =>
    typeof part === "string" ? { text: part } : part
  );

  appendInfoMessage(segments.map((segment) => segment.text).join(""), segments);
}
