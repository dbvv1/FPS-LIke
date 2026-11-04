# Match cue candidates

Four original synthesized sound sources for the training match: weapon switch,
menu confirmation, round win and round loss. They are editable listening
candidates only. Nothing here is wired into the game, audio graph, HUD,
simulation or build, and no runtime file is replaced.

| ID | File | Duration | Peak | Character |
|---|---|---|---|---|
| `weapon-switch` | `weapon-switch.wav` | 0.130 s | -12.001 dBFS | Low-energy mechanical latch: filtered click, small low body, one quieter spring tick. |
| `menu-confirm` | `menu-confirm.wav` | 0.090 s | -12.001 dBFS | One soft pulse with a single attack and decay. |
| `round-win` | `round-win.wav` | 0.460 s | -12.001 dBFS | Two ascending tones, C5 to G5. |
| `round-loss` | `round-loss.wav` | 0.460 s | -12.001 dBFS | Two descending tones, G4 to C4, slower decay. |

All files are 48 kHz, mono, PCM16 WAV. Every cue has a 5 ms linear attack and
release. The whole batch is generated at a -9 dBFS first-pass peak, then
regenerated with a -3 dB batch gain for a final peak of -12.001 dBFS, below the
-12 dBFS ceiling. Durations, per-cue seeds, sample counts and event identity are
unchanged by that revision; only amplitude and the resulting quantization
change.

## Rebuild and test

Python 3 standard library only; no packages, network, audio device or GPU.

```sh
python asset-pipeline/match-cues/generate.py
python asset-pipeline/match-cues/test_generate.py
```

`generate.py` reads `recipe.json` and rewrites the four WAV files plus
`manifest.json` in this directory. `--out` redirects a build elsewhere. The
recipe is validated in full, and every cue is synthesized and level-checked,
before any file is written: a recipe missing `batchId`, `baseRef`, `license`
or `origin`, or whose default first-pass peak plus revision gain would exceed
the -12 dBFS ceiling, exits with status 2 and leaves existing outputs
untouched. `--gain-db 0` reproduces the pre-revision batch (-9 dBFS) for an
amplitude comparison; it is not the final candidate because its peak is above
the -12 dBFS ceiling. Any explicit gain override other than the default -3 dB
is a revision/comparison build: overrides above -3 dB exceed the -12 dBFS
ceiling, while overrides at or below -3 dB stay within it. Only the default
-3 dB build is the final candidate.

The tests check WAV format, duration limits, peak, first/last samples, the 5 ms
envelope, cue shape, deterministic bytes, the -3 dB amplitude-only revision,
invalid recipes and CLI inputs, manifest hashes, and the event bindings.

## Sound design

These four recipes do not reuse the existing shot, reload, bolt, step, hit,
head, kill or plant recipes. The switch is noise-led rather than a weapon
report; the menu and result cues use single-pulse and two-tone forms distinct
from the short hit overlays.

- The weapon switch uses two short mechanical attacks rather than a tonal
  report; its RMS is the lowest of the four. It is intended to sit under a
  weapon transition, not to read as a shot.
- The menu cue has one pulse and no second attack, so it does not resemble a
  two-tone result.
- Round win and round loss use original two-note intervals. Win ascends and
  sits in the upper register; loss descends and sits lower with a slower decay.
- Noise comes from a per-cue seeded xorshift32 stream. The generator does not
  read the clock, use Python's `random` module or depend on platform state.

## Event bindings and future priority

`manifest.json` is the authoritative mapping. In summary:

| Cue | Actual event source |
|---|---|
| `weapon-switch` | A simulation-accepted weapon change: `src/sim/game.ts:116`, training route `src/candidates/offline-training-v1/sim/game.ts:125`. Input is queued at `src/input/controls.ts:42`; keydown alone is not the event. |
| `menu-confirm` | The start/next/restart `onclick` handlers in `src/ui/hud.ts:22`, training route `src/candidates/offline-training-v1/ui/hud.ts:23`, each guarded by `settings.canPlay()`. These are the only trigger points. `resume()` / `next()` / `restart()` in the client modules are downstream handlers, not extra hook points: `next()` itself calls `resume()` at its end, and the training `next()` calls `restart()` instead once `match.summary.complete` (`src/candidates/offline-training-v1/client.ts:62`), so hooking the client functions would play the cue twice for one click. Hover, focus, menu open/close and settings range input are excluded. |
| `round-win` | Authoritative round end with `state.phase === 'over'` and `state.result.team === localPlayer.team`: `Game.finish` in `src/sim/game.ts:218-221` and the training route. |
| `round-loss` | The same authoritative round end with `state.result.team !== localPlayer.team`. |

Win/loss must be read from `state.result.team`, never from `menu-title`,
`menu-description`, localized copy or screenshot OCR. The manifest records both
the positive bindings and the forbidden UI-text sources.

Future priority is intent only. Gunfire and threat sounds (`shot`, `reload`,
`step`, `hit`, `head`, `kill`, `plant`, bomb warning, explosion, damage) keep
priority. These four cues belong to a lower UI/round tier: they must not duck,
delay, replace or schedule around combat audio, and a cue should be skipped
rather than raised over a threat. Actual mix levels remain open; this batch
only fixes file peak.

## Listening questions

No one has listened to these files yet. CPU tests prove format, level, shape
and determinism, not perceived quality.

**First, listen to the files directly.** Open `weapon-switch.wav`,
`menu-confirm.wav`, `round-win.wav` and `round-loss.wav` in any local audio
player. They are complete 48 kHz mono PCM16 WAV files with the -3 dB revision
already baked in, so this needs no build, no game integration and no runtime
audio change.

**Then, once wired into a listening harness, check the combat overlap cases:**

1. **Switch under gunfire.** During a rifle shot tail or an active reload, is
   the switch click readable, or does it blur into `reload-out` / `bolt`? Does
   switching after every kill become fatiguing?
2. **Menu pulse under combat.** Is the single soft pulse audible at all under a
   shot, or is it correctly skipped? It should not be raised just to compete.
3. **Result and menu cues against hit confirmation.** The menu pulse sits at
   880 Hz and the win motif has energy around 784/1568 Hz; the existing hit and
   head cues use 1000 Hz and 1600 Hz. Check that a menu or result cue is not
   mistaken for a hit marker or headshot, especially when several land close
   together.
4. **Win/loss direction.** Under a gunfire tail, at low volume and in mono, can
   you tell win from loss by the up/down direction rather than only by loudness
   or register?
5. **-3 dB result level.** After the batch revision, do the result cues still
   read at the intended mix level, or are they too quiet relative to shots and
   threat sounds? If too quiet, fix the future mix or rework the cue rather
   than silently restoring the pre-revision peak.
6. **Repetition.** Switch spam, menu spam and repeated round results should not
   become annoying or mask a necessary warning.

## Boundaries

- No listening test, CS2 comparison, browser playback, game integration or
  device check has been run.
- No sound card, audio device, GUI or browser is opened by this pipeline.
- No commercial game audio, samples, recordings or model-generated audio are
  used.
- This source batch does not change weapon timing, simulation rules, existing
  cues, `quality.md` or mix defaults.

## License

Original synthesis recipe and generated waveforms in this directory may be
reused under CC0-1.0. The recipe is the editable master; do not replace it with
an opaque recording.
