# Optional round-result sound candidate

The offline training client can consume the two existing original CC0 result
WAVs after an authoritative round result. No new sound is generated and no
simulation, client loop, HUD, weapon event, or source waveform changes.

This is a code/build candidate, not a deployed or listening-approved update.
The default remains unchanged. On a build containing this change, append
`matchAudio=result-cues-v1` to the existing training URL, for example:

`/?gameplay=offline-training-v1&match=complete-v1&matchAudio=result-cues-v1`

Exactly one known `matchAudio` value opts in; missing, unknown or repeated
values use baseline. The setting is not persisted. The ordinary sound toggle
still controls all sound.

## Actual consumer and lifecycle

The existing client calls `Soundscape.update(game.state, player, ...)` after
simulation advances. `settledResultCue` accepts only `phase === 'over'` with a
non-null result, then compares `result.team` to the local player's `team`.
It never infers victory from attack/defend, score, menu text or a screenshot.
This preserves the meaning after the third-round side swap.

The round/time/team/reason identity is consumed once before checking audio
availability. Muted, not-yet-decoded, unavailable-device and combat-overlap
results are skipped permanently for that result. Loading success or unmute
cannot play an old result later. Existing combat voices win; this candidate
does not duck, replace, wait for or schedule around gunfire/hit feedback.
A result on a finishing shot can therefore intentionally be silent.

The existing user-gesture `unlock()` uses the Soundscape's one AudioContext.
Only the opt-in starts two sample fetches. Concurrent unlocks share loading;
partial success is retained, and the next gesture may retry missing samples.
The client already starts audio without awaiting it before pointer lock, so
sample loading does not delay input acquisition. HTTP/decode failure is optional
and has no fallback synthetic cue.

Existing `next()` and successful `restart()` call `sound.reset()`, stopping
voices and clearing result identity while retaining decoded immutable samples.
`dispose()` aborts owned fetches, clears samples, closes that context and ignores
late fetch/decode completion. Later unlock/update cannot recreate a disposed
soundscape. Each voice disconnects its source and gain on completion.
The candidate gain is 0.18, a conservative starting value, not a listening result.

## Unchanged source assets

Source: [accepted match-cue package at ecb53c7](https://github.com/dbvv1/FPS-Like/tree/ecb53c7464e4ccb8daba4353b94fc5bc9b8ef94a/asset-pipeline/match-cues).
Both files are 48 kHz mono PCM16, 22,080 samples (0.460 seconds), 44,204 bytes.
The source recipe and waveforms are CC0-1.0; their existing README and manifest
explain the historical source-only delivery status in the generator manifest. This document records the
later optional consumer, not a retrospective rewrite of that receipt.

| Source | SHA-256 |
|---|---|
| `round-win.wav` | `a0c148a84b3e6f51c9419461dcc27d63fb8b63041ede626845bd60379c6ae611` |
| `round-loss.wav` | `61b94e07702df7a9176487f19c99e04e80c4d3c7d27dd87ee00c181a17171b88` |

Vite's emitted `round-win-ChM5PLzR.wav` and `round-loss-6a2eEVEi.wav` were compared
to those source bytes and were identical. There is no conversion, normalization,
new copy of the source package, or change to its license. Other six prepared
MOBA/FPS cues remain outside this change and are not repackaged here.

## Verification, 2026-11-06 UTC

Base: `fa8740de3bf2f4ffaaabec5c8df09d9f4c9088c8`.
Node 24.22.1, existing lock-matching dependencies. No installation was needed.

- `node --import tsx --test tests/offline-training-v1/round-result-audio.test.ts`:
  14/14 passed. Uses real Game settlement and six rounds with side swap, real
  WAV file bytes, a mocked fetch and Web Audio context. Also covers baseline,
  mute, load failure, late completion, competing combat, reset and disposal.
- `npm test`: 444/444 passed, including existing simulation tapes and actual
  client lifecycle/complete-match regression tests.
- `npm run typecheck` and `npm run build`: passed.
- Existing source package `test_generate.py`: 26/26 passed.
- Python `wave`/SHA-256 inspection confirmed source metadata and emitted bytes.
- Independent non-author code/source review passed; it separately reran the
  14 result tests plus 10 existing feedback/shot-cycle checks.
- Public text/identity scan and staged whitespace checks passed.

The Web Audio test double checks event routing/ownership, not actual browser
WAV decoding, loudness, perceived distinction or device behavior. No browser,
audio output device, GUI, GPU or human listening was run. Existing browser
startup socket restrictions were not retried or bypassed. No quality score
changes, default switch, main integration or website deployment are implied.

## Existing batch acceptance, before adopting

In an authorized working browser, start the opt-in training route with one
user gesture. Confirm the two WAV requests succeed and audio failure never
blocks play. Complete a quiet timeout and a finishing-shot round; the former
should play once, the latter should skip when combat is still active. Continue
through the side swap, pause/mute, next round and restart, ensuring no stale
result replays. Check the baseline route without the query remains unchanged.

Then add this candidate to the existing grouped human listening session:
win/loss direction at ordinary/low volume and mono, confusion with hit/head
feedback, repeated-result fatigue, and whether skipped combat-overlap results
remain clear through the existing visual result. Single-file listening does
not replace actual match overlap. Until then, retain the baseline mix.
