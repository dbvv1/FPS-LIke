# Full courtyard materials default decision — 2026-11-13

Adopt the existing `ai-courtyard-full-v1` material set, not the later whole-scene proposal. The unparameterized home now selects the already-tested full-materials route; explicit previous-training and legacy URLs keep their meaning.

## Evidence and decision

- Full smoke at source `c3546ecef83704a747dfe56838d40346e114e2d0` (base `658b2e592c612fa0801e2cc7fecdce32bb57eadb` plus tools-only patches): both routes completed six natural rounds, halftime, final result, UI new-match reset, pause/resume and input checks, with no page errors. Original evidence commit `c7936ff9231bd2755bedcd062f83cfe41e841d70` under `docs/quality/capture/B-FPS-DEFAULT-FULL-PAIR-20261112/658b2e592c61-r2/`.
- Two independent non-author anonymous reviews preferred full materials at all three fixed cameras, with no obvious route/target readability regression. Texture noise and scale-cue limitations remain.
- Three successful software pairs have mean ratios 0.9569, 1.0418, 1.0906 and p95 ratios 0.9395, 1.0966, 1.0591 (candidate/default). Later pair receipts are in `8afe767e1a68257f635a03946f616895808d999b`, `docs/quality/capture/B-FPS-DEFAULT-FULL-PAIR-20261112/receipts/658b2e592c61-r2-original-call-cleanup.json`.
- Decision: do not classify these observations as an established obvious material-induced regression; accept the visual improvement while retaining the observed 4–10% software-frame-cost risk. This is a qualitative release tradeoff, not a new numerical acceptance threshold or proof of zero regression.

## Limits retained

Software SwiftShader rAF intervals include observer overhead and are not GPU times. Smoke viewport was 1365×900; fixed comparison images are separate. The runs are not identical-input replays: the original fifth round had 76 active frames ending in elimination for default versus 313 ending in timeout for full materials. Frame samples are correlated and differently weighted; do not claim statistical significance or smooth gameplay. Original p99 fell 666.6→583.4 ms but maximum rose 750→1033.4 ms. Human sound/feel and hardware GPU are unverified, not prerequisites for this decision.

Excess retries and incomplete historical process receipts remain audit debt, not grounds to discard successful smoke evidence or block other cases under the owner's 11-13 correction. No new full smoke or capture is claimed here.

Player-menu cleanup uses reviewed change `aef9d4d059f990d61d88cff75d6e96e1cb02980e`: removes candidate navigation and diagnostic toggles while retaining passive hidden receipt nodes. Unit/build checks cover the integrated source. Browser interaction acceptance of this small menu-only change is not claimed.
