# Relay Yard synthesized sound kit

Original procedural audio; no samples, recordings or third-party game assets.
Editable source: `src/render/synth.ts`; runtime consumer: `src/render/audio.ts`.

The industrial palette uses a short noise crack, a descending low body and a small mechanical tail. Rifle and pistol use separate body pitch and crack duration. Reload-out, magazine-in and bolt-close cues follow the existing reload clock. Hit, head and elimination confirmation are quieter, spectrally distinct overlays; only real local shot results trigger them. Enemy sound remains restricted to the simulation's audible event IDs.

This repository's original synthesis recipe and generated waveforms may be reused under CC0-1.0. Changing a cue does not change weapon timing or simulation rules. The source is the editable master; do not replace it with an opaque recording.
