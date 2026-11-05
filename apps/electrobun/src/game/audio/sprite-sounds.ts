export interface SpriteSoundCue {
  frame: number;
  soundId: string;
}
type SpriteSoundIndex = Record<string, Record<string, SpriteSoundCue[]>>;
let loading: Promise<SpriteSoundIndex> | null = null;
/** One cached fetch for all character, monster and rider timelines. */
export function loadSpriteSounds(): Promise<SpriteSoundIndex> {
  loading ??= fetch("/assets/sound/sprite-sounds.json")
    .then(async (res) =>
      res.ok ? ((await res.json()) as SpriteSoundIndex) : {}
    )
    .catch(() => ({}));
  return loading;
}
/** All cues on a frame must fire; different simultaneous sounds are distinct. */
export function playFrameSounds(
  cues: readonly SpriteSoundCue[],
  frame: number,
  play: (name: string) => void
): void {
  for (const cue of cues) {
    if (cue.frame === frame) {
      play(cue.soundId);
    }
  }
}
