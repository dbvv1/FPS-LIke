# KayKit authoritative reload snapshot adapter (candidate only)

Based on 770f604. `syncKayKitGameAction` reads GameState for one actor and samples
only the verified rifle/two-hand and pistol/one-hand reload clips. Source clip
phase is normalized to the simulation weapon reload duration, not wall-clock
frame time. Repeated snapshots hold pose; rewind and clip switches reset mixer
clamp state. Cancellation, death, missing actor, round-over, mismatched weapon,
and completion restore rest pose. No simulation state is written.

This is an adapter, not View registration or a default character replacement.
No idle, locomotion, firing or death animation is invented. Rest pose outside
reload is not an accepted visual solution. Existing slot loader/fallback and
all default entry points are unchanged.

Validation: 442 CPU tests pass; typecheck, sim build and web build pass. New
Game/Three test exercises actual rifle/pistol reload, switch cancellation and
completion; death/round-over/absent actor use copied snapshots, not full match
proof. Fixed SHA-256 GLBs pass 10 absolute phase samples against independent
elapsed-time evaluation, including 1 to 0.25 rewind and both clips. Existing
173-frame / 642868 bounds-vertex / 3114 skin-vertex checks pass. No texture
decode, browser, GPU, smoke, visual quality or performance claim. No website or
scorecard increase. Remaining gate: opted-in scene consumer, renderer smoke,
fixed-camera images and non-author assessment before adoption.

## Native stationary rifle window

`syncKayKitNativeAction` is separately opted in. For the fixed Knight source it
holds `2H_Ranged_Aiming` at its **last** frame, not frame zero. The source begins
with a raise-to-aim sequence: the hand-slot distance is 1.006644m at zero versus
0.567991m at the held pose. Replaying that pre-roll on every accepted shot was
not a usable held-rifle selection, even though the mixer reproduced the source.

Shoot starts at normalized .25 (8/30s of the 32/30s source), matching the final
aim pose to <1e-6 across bone world matrices. The remaining .8s plays at original
speed, then returns to held aim. This is a fixed-source window, not general
retargeting, crossfade, or weapon-contact acceptance. Reload retains its complete
source window and original simulation-duration mapping. Default/reload-only
callers and source clips are unchanged.

Reproduce with `npm run check:kaykit -- <fixed-sample-directory>`: it verifies
held aim and the source join in addition to the existing real Game snapshot and
native-skin checks. 457 tests, build and fixed-source command passed; independent
41-bone recomputation measured join error 4.33e-7. No View, browser, visual
transition, gun fit, coverage or quality-score claim. Attach the actual rifle and
verify those remaining gates before promoting this candidate.
