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
