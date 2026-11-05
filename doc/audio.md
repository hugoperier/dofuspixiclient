# Audio

Music and ambient sound work the way the retail 1.29 client did: every map
carries two ids, and both index the `audio` lang bundle, which is the only
thing that knows what the ids mean.

```
maps.music_id ─┐                            ┌─→ AUM[id].f ─→ sound/musics/<f>
               ├─→ GameMapData ─→ client ──┤
maps.ambiance_id ┘        AudioManager      └─→ AUA[id]    ─→ sound/effects/<f>
```

## Where the ids come from

Nowhere but the retail client. The StarLoco dump does not carry them, because
the original never sent them over the wire — it read them from the map's own
SWF (`MapsServersManager.as:135-136`). `just import-map-swf <Client/data/maps>`
parses all 9 209 map SWFs and fills `maps.music_id` / `maps.ambiance_id`:

| | |
|---|---|
| Maps with music | 7 062 |
| Maps with an ambiance | 7 506 |
| Distinct music ids | 33 |
| Distinct ambiance ids | 17 |

`0` (stored as NULL) means the map has none, and the client then **keeps
playing whatever is already playing** — that is the retail behaviour
(`DofusBattlefield.as:130-136` only calls the players when the id is `> 0`), and
it is why walking into a house does not cut the area's theme.

Three music ids the maps reference — 100, 102 and 111, on maps 6150, 1489,
1687 and 1689 — are absent from the lang bundle. The client logs a warning and
leaves the current track alone. Every other id, and all 17 ambiances including
each effect they layer, resolves to a file that exists.

## The lang bundle

`apps/electrobun/public/assets/langs/<locale>/audio.json`, under `data`:

| Key | Contents |
|---|---|
| `AUM` | 42 musics — `{f: file, v: base volume 0-100, l: loop, o: start offset}` |
| `AUE` | 766 sound effects, same shape |
| `AUA` | 20 ambiances — `{bg: [effect ids], n: [effect ids], mind, maxd}` |
| `AUMC`, `AUEC`, `AUAC` | Name → id constants (`PLACE_AMAKNA: 115`) |

An ambiance is a continuous bed (`bg`, looped forever) with one-shot noises
(`n`) fired over it every `mind + round(rand × maxd)` seconds. That is what
makes a forest sound like a forest: a wind loop plus occasional birds.

## The files

`apps/electrobun/public/assets/sound/{musics,effects}/<name>.mp3` — 48 musics
and 905 effects, extracted from `audio/musics.swf` and `audio/effects.swf`.
Both SWFs contain `DefineSound` tags (MP3, format 2) paired with
`ExportAssets` symbol names. Most filenames match the lang `f` field. Twelve
lang entries omit `.mp3` and three speaking-item names have different casing;
the generated `effect-files.ts` catalog resolves those against actual files.

The published files originally carried an extraction index (`1_loc_kwistmas.
mp3.mp3`); they were renamed to their canonical symbol name so the lang `f`
field is a URL directly. The rename was injective — 953 files, no collisions.

Two caveats:

- The published set is **larger** than what this particular client holds
  (48 musics vs 36 in its `musics.swf`), so it came from a different build.
  Re-extracting from the client on this machine would *lose* 6 musics that the
  lang bundle references. Do not overwrite the published files with a naive
  re-extract.
- 139 of the 905 effects are not in `AUE` at all. They are addressed by symbol
  name rather than id (`AudioManager.playSound` → `getElementFromLinkname`),
  which is how sprite animations trigger their own sounds. `playSound` now
  falls back to this published catalog when `AUEC` has no entry.

## The client side

`apps/electrobun/src/game/audio/audio-manager.ts` mirrors
`dofus.sounds.AudioManager`: `playMusic(id, saveOld?)`, `backToOldMusic()`,
`playEnvironment(id)`, `playEffect(id)`, `playSound(linkname)`, with a
4-second cross-fade between tracks and three independent channels (music /
environment / effects) each with its own volume and mute.

`playSound` is the by-name door: a sound an animation triggers names itself
by its SWF symbol (`cassage_bois`, `flotteur`), which retail folds into the
lang bundle's keyname — spaces, accents and dashes out, upper case — and looks
up in `AUEC`, then falls back to a published MP3 with the same folded symbol.
Unknown symbols are reported once per session; no guessed substitutions are
used. All 766 `AUE` entries resolve to published files. Empty AS arrays emitted
as `{}` are normalized, including Otomaï ambiances 18–20.

`WorldAudio` owns exploration/combat transitions. Placement keeps the map
theme; combat start chooses from `MA.sa[subareaId].m` in the maps lang bundle.
Joining an active fight as spectator follows the same path. Some subareas
(including Incarnam) intentionally use their exploration theme in combat.
When the final spell, movements and deaths finish, the destination map theme
plays again, as in `GameManager.terminateFight`. The low-level
`saveOld`/`backToOldMusic` position API remains available, but fight exit uses
the reference client's map selection rather than restoring a playback offset.
Maps with music id 0 inherit the last exploration theme; missing AUM ids fall
back to the theme playing before combat. Asynchronous loads cannot resurrect
combat music after fight exit or disconnection.

Every `HTMLAudioElement` touch lives in `sound.ts` behind a `Sound` interface,
and the timers are injected, so `audio-manager.spec.ts` drives fades and the
random noise scheduler on a fake clock with no DOM.

All live effects, ambient beds and outgoing crossfade tracks remain owned by
the manager until completion. Volume/mute changes apply immediately to every
voice; stopping also cancels fades, ambient scheduling and pending loads.

### Spells and sprite animations

Spell runtimes receive `playSound`, including generated TypeScript spells and
the generic pre-rendered fallback. Simultaneous cues on one frame are distinct.
Critical-hit protocol markers are consumed once by the matching caster/spell,
so critical branches receive the correct flag.

`sprite-sounds.json` supplies frame-indexed SOMA calls for characters, monsters
and riders. `CharacterSpriteLoader` attaches the cues to the loaded animation;
the sprite controller plays them when entering a frame, repeats them on a new
loop, and avoids replay on a direction change or a held final frame. Harvest
animations keep the existing per-job audio ownership to avoid double sounds.

Regenerate metadata after publishing sprite assets (MP3s are never overwritten):

```sh
bun scripts/generate-audio-catalog.ts
php -d memory_limit=1G tools/assets-exporter/bin/extract-sprite-sounds \
  --input /path/to/matching/client/clips/sprites \
  --fallback-input assets/sources/clips/sprites
php tools/assets-exporter/tests/sprite-sounds.php
```

The extractor checks published DASF animation lengths against the available
SWF timelines, follows nested clip placement, and handles the retired atlas
pipeline's integer frame resampling. Newer Retro clips are needed for some
published sprites; the 1.29 sources alone do not match every strip. Unmatched
animations, unresolved symbols (with cue counts), and parsing errors are
recorded in the adjacent `.report.json`.
This extracts literal frame calls, not arbitrary ActionScript execution.

The published index contains 18,802 cues across 11,939 animations for 833
sprite/rider ids. All cues fit their published animation bounds. Thirty-two
sprite symbols have no corresponding sound in either available effects SWF;
the report lists them under `missingSymbols`. Most unmatched exports are the
unused `_liaison_` helper; a few animations and newer sprite variants also
need matching source clips. These remain explicit gaps, not guessed timings.

Eight spell symbols are absent from the published files and both available
sound libraries: `aute_1102`, `aute_1103`, `autre_1101`, `autre_1104`,
`autre_1105`, `autre_1107`, `lakam_402`, `licrounch_1002`. Their callbacks are
wired but remain silent until matching source audio is supplied.

### Interface and alerts

The HUD audio button opens three independent volume/mute controls plus toggles
for your turn, the final five seconds, and notifications. Settings persist in
`localStorage` under `dofus.audio.v1`; unavailable storage does not prevent
session adjustments. Visible whispers/events, incoming invitations, guild
collector attacks, errors, map flags and interface clicks use the reference
`AudioEvents.as` symbols. Its counterintuitive critical mappings are preserved:
`BIP` for critical hit and `COUP_CRITIQUE` for critical miss.
New action sounds are skipped while the window is unfocused; turn/timer and
notification alerts may still play, as in the reference client's focus bypass.

### Harvesting

1.29 has no harvest sound *event*: `GA;501` only loops the tool animation, and
what you hear comes from the clips. Only fishing got that treatment — every
fishing spot plays `flotteur` when taken and `fish_out` when it gives — while
the axe animation `anim17` and every tree are silent.

`harvest-sounds.ts` extends that deliberately, with 1.29's own effects: one
pair per gathering job, fishing keeping the pair its spots already play. The
job is read off the *resource* (`SK[skill].j`, through the gfx on the cell),
so a bystander hears the same thing as the harvester. The swing rings on the
looping animation's `applyEnd` frame — the canonical "the action lands here" —
once per cycle, and stops when the animation does; the outcome rings on `GDF`
frame 3, and only for a harvest this client saw start. See
`doc/issues/audio/QA-147-la-recolte-est-muette.md`.

### Autoplay

Browsers refuse to start audio before the page has been interacted with.
`createHtmlSound` retries blocked looping music/ambiance on a click or key
press. Blocked one-shots are discarded so old events do not all sound at once.
Stopping a sound removes both load and gesture listeners.

### Verification

The audio tests cover crossfades, live volume/mute, pending loads, browser
autoplay/disposal, map/fight transitions, critical marker routing, sprite
frame cues, and resolution of every published AUE entry. The complete client
suite and TypeScript check accompany this change. Browser verification checks
real HTMLAudioElement `playing` events for Amakna exploration → battle →
exploration, a packed monster effect and Otomaï ambiance, plus the settings UI.
