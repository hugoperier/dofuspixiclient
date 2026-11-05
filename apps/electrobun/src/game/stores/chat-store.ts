import { ChatChannel } from "@dofus/proto/common_pb";

import {
  SIDE_CHAT_CHANNEL,
  SIDE_CHAT_CHANNEL_COLORS,
  SIDE_CHAT_FILTER_CHANNELS,
  type SideChatChannel,
} from "@/components/ui/side-chat-panel.channels";
import { playAudioEvent } from "@/game/audio/audio-events";
import { cooldownMsFor, styleFor } from "@/game/chat/chat-channels";

import { ExternalStore } from "./game-store";

type Side = "left" | "right";

/**
 * Single chat entry.
 *
 * `channel` is the wire channel — it decides the colour and the `(Canal)` label.
 * `filter` is the checkbox bucket it hides behind, denormalised at append time so
 * rendering never has to reach back into the channel registry. `player` and
 * `time` are absent for locally generated lines (errors, system notices).
 */
/**
 * A run of text with its own emphasis inside one chat line.
 *
 * The chat has no rich-text renderer and needs none: every line that
 * wants emphasis is one we build ourselves, so a list of typed runs is
 * cheaper and safer than parsing the `<b>` markup the retail lang
 * bundles ship. `ChatEntry.text` stays the flat concatenation, so
 * filters, tests and the fallback render keep working unchanged.
 */
export interface ChatSegment {
  text: string;
  bold?: boolean;
  underline?: boolean;
}

export interface ChatEntry {
  id: string;
  channel?: ChatChannel;
  filter?: SideChatChannel;
  /** Zero-padded `HH:MM`. */
  time?: string;
  player?: string;
  text: string;
  /**
   * Emphasis for `text`, when the line was built rather than received.
   * Absent means "render `text` as-is"; when present the runs must
   * concatenate back to `text`.
   */
  segments?: ChatSegment[];
  /** Overrides the channel colour — used by locally generated error lines. */
  color?: string;
}

export interface ChatState {
  /** Infos pane entries (always shown at the top regardless of filters). */
  infos: ChatEntry[];
  /** Main chat log entries. Filtered by `visibleChannels` at render time. */
  messages: ChatEntry[];
  /** Filter buckets the user has toggled on in the checkbox row. */
  visibleChannels: Set<SideChatChannel>;
  /** Which side of the screen the (retired) side panel docks to. */
  side: Side;
  /** Channel a message with no slash command goes to — set by the star button. */
  activeChannel: ChatChannel;
  /** Channel → epoch ms at which it may be used again. */
  cooldowns: Partial<Record<ChatChannel, number>>;
  /** Is the chat currently visible? */
  isOpen: boolean;
  /**
   * Text to put in the input, and a token that changes every time it is
   * set.
   *
   * The input keeps its own draft — it has to, since it is typed into —
   * so this is a one-shot push rather than the value itself. The counter
   * is what makes "set the same prefill twice" reach the field twice:
   * without it, asking for `/w Bellegosse ` again after the player has
   * cleared the box would be a no-op.
   */
  draft: { text: string; nonce: number };
}

const DEFAULT_VISIBLE_CHANNELS = new Set<SideChatChannel>(
  SIDE_CHAT_FILTER_CHANNELS
);

// Retail buffer caps (dofus/managers/ChatManager.as:12-22). Without them the
// arrays grow for the whole session.
const MAX_MESSAGES = 150;
const MAX_INFOS = 50;

const initialState: ChatState = {
  infos: [],
  messages: [],
  visibleChannels: DEFAULT_VISIBLE_CHANNELS,
  side: "right",
  activeChannel: ChatChannel.GENERAL,
  cooldowns: {},
  isOpen: true,
  draft: { text: "", nonce: 0 },
};

export const chatStore = new ExternalStore<ChatState>(initialState);

let nextId = 1;
function makeId(): string {
  return `c${nextId++}`;
}

function tail(entries: ChatEntry[], cap: number): ChatEntry[] {
  return entries.length > cap ? entries.slice(entries.length - cap) : entries;
}

export function appendChatMessage(entry: Omit<ChatEntry, "id">): void {
  const { messages } = chatStore.getSnapshot();

  chatStore.setState({
    messages: tail([...messages, { id: makeId(), ...entry }], MAX_MESSAGES),
  });
}

/**
 * `Im` — the server saying why nothing happened.
 *
 * It lands in **both** buckets, and the main log is the one that matters:
 * `infos` was only ever read by `SideChatPanel`, which no screen mounts, so
 * every refusal the server took the trouble to word — the harvest's eleven
 * (QA-123), the workbench's (QA-159) — reached the client and was shown to
 * nobody. A message the player cannot see is the silence those tables exist
 * to end. The `infos` entry is kept so the side panel needs no second call
 * site the day it comes back.
 */
export function appendInfoMessage(
  text: string,
  segments?: ChatSegment[]
): void {
  const { infos } = chatStore.getSnapshot();
  const entry = {
    filter: SIDE_CHAT_CHANNEL.INFOS,
    text,
    ...(segments ? { segments } : {}),
  };

  chatStore.setState({
    infos: tail([...infos, { id: makeId(), ...entry }], MAX_INFOS),
  });

  appendChatMessage({
    ...entry,
    color: SIDE_CHAT_CHANNEL_COLORS[SIDE_CHAT_CHANNEL.INFOS],
  });
}

/**
 * A locally generated failure — a refused command, a flood countdown, a server
 * rejection. Rendered in the retail error red and never hidden by a filter.
 */
export function appendErrorMessage(text: string): void {
  playAudioEvent("error");
  appendChatMessage({
    text,
    color: "var(--color-side-chat-channel-errors)",
  });
}

export function clearChat(): void {
  chatStore.setState({ messages: [], infos: [] });
}

export function setChannelVisible(
  channel: SideChatChannel,
  visible: boolean
): void {
  const { visibleChannels } = chatStore.getSnapshot();
  const next = new Set(visibleChannels);

  if (visible) {
    next.add(channel);
  } else {
    next.delete(channel);
  }

  chatStore.setState({ visibleChannels: next });
}

export function isFilterVisible(filter: SideChatChannel): boolean {
  return chatStore.getSnapshot().visibleChannels.has(filter);
}

export function setChatSide(side: Side): void {
  chatStore.setState({ side });
}

export function setActiveChannel(channel: ChatChannel): void {
  chatStore.setState({ activeChannel: channel });
}

/**
 * Put text in the chat input, replacing whatever is there.
 *
 * Used by the buttons that write *to* somebody — a co-operative craft's
 * "Message privé" — rather than sending on the player's behalf: the
 * whisper is theirs to write, and prefilling `/w <name> ` is the whole of
 * what the button can honestly do for them.
 */
export function setChatDraft(text: string): void {
  chatStore.setState({
    draft: { text, nonce: chatStore.getSnapshot().draft.nonce + 1 },
    isOpen: true,
  });
}

export function toggleChatOpen(): void {
  const { isOpen } = chatStore.getSnapshot();

  chatStore.setState({ isOpen: !isOpen });
}

/** Seconds still to wait on a channel; 0 when it is clear. */
export function remainingCooldown(
  channel: ChatChannel,
  now = Date.now()
): number {
  const until = chatStore.getSnapshot().cooldowns[channel];

  return until && until > now ? Math.ceil((until - now) / 1000) : 0;
}

/** Arms the local mirror of the server's cooldown after an accepted send. */
export function armCooldown(channel: ChatChannel, now = Date.now()): void {
  const cooldown = cooldownMsFor(channel);

  if (cooldown === 0) {
    return;
  }

  setCooldown(channel, cooldown / 1000, now);
}

/**
 * Realigns the local mirror on the server's answer. The server is the
 * authority — a clock drift or a reconnect can leave the two disagreeing, and
 * this is how the client catches up.
 */
export function setCooldown(
  channel: ChatChannel,
  seconds: number,
  now = Date.now()
): void {
  const { cooldowns } = chatStore.getSnapshot();

  chatStore.setState({
    cooldowns: { ...cooldowns, [channel]: now + seconds * 1000 },
  });
}

/** The colour a rendered entry should use. */
export function entryColor(entry: ChatEntry): string | undefined {
  if (entry.color) {
    return entry.color;
  }

  return entry.channel !== undefined
    ? styleFor(entry.channel).color
    : undefined;
}
