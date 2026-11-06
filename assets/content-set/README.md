# Relay Yard adopted standard pieces

Three unchanged CC0 GLBs from the accepted source package at
`b198df62a56f4c520716fbc9cb4afac47dd62213`, not newly generated variants.
The authoritative recipe and action contracts are under
[`asset-pipeline/content-set` at that commit](https://github.com/dbvv1/FPS-Like/tree/b198df62a56f4c520716fbc9cb4afac47dd62213/asset-pipeline/content-set).

| Piece | Bytes | SHA-256 |
| --- | ---: | --- |
| `fp-arms-rx24.glb` | 188088 | `e672d06e30262f2575076f759645aa3d82d6734f0c26ef280a2a36870549b9e1` |
| `enemy-relay-guard.glb` | 40388 | `5b316a139cf48b21a6d6b7328ac1c8b58a73c4f41ce1a0de24f2a8ca74afbd74` |
| `hit-feedback.glb` | 6760 | `80155733647ffadb61cc7b1890ad1fc18818faa97448457b7ddc9ee2dfd56edd` |

Sources: RX24 derives from Quaternius Ultimate Guns Pack (CC0); opponent derives
from Casti_131's Low Poly Soldier with weapons (CC0). Original hand recipes,
rigid node motion and palette processing are CC0. See `LICENSE.txt`, the existing
weapon/character asset READMEs, and the fixed package's source provenance.
No commercial reference art is included.

## Existing character consumer

Open the normal game with `?contentSet=characters-v1`. Without that exact single
query value, the default remains procedural; Canvas2D is unchanged. A failed,
aborted or incompatible load retains both original procedural representations.
With the candidate query, the existing `#debug-state` panel and read-only
`window.fpsClient.state().contentSet` report `status`, `error`, `active`, the fixed
source commit and both asset hashes. `status: ready` means verified-loaded;
`active: true` additionally requires a completed real View render after attachment
(and resets on reset/dispose). Before that first frame, ready remains inactive; a
source name or HTTP 200 alone is not adoption evidence. Loading and fallback are
explicit, including Canvas fallback. Normal URLs omit this candidate diagnostic.
The normal match, input, AI, hit volumes, map, light, sound and camera remain the
same. This is a playable character-content candidate, not an asset viewer.

`src/render/content-set-assets.ts` verifies both delivered hashes before loading
with Three 0.186.1 GLTFLoader; no decoder is needed. Names may be suffixed by the
loader, and package metadata belongs to `gltf.scene.userData`.

- Rifle root follows existing `weaponPose` exactly once. The baked root fire/idle
  clips and magazine/bolt clips are deliberately not mixed over the procedural
  pose. Magazine, bolt, support palm and original arm IK share the existing pose.
- The merged GLB sleeves are excluded only after an exact source-triangle match
  with duplicate/precision rejection. The two existing procedural sleeves remain;
  the entire merged sleeve is never translated as if it were just a hand. GLB
  bytes are unchanged; the consumer changes draw indices, not the source file.
- Opponents use rigid node tracks, sampled from absolute simulation time and the
  existing bounded Feedback event ages. Each render restores rest TRS first;
  no AnimationMixer delta, wall-clock animation loop or incremental transform is
  added. Crouch scales by .65 before the feet-origin fall; world Z is reflected
  and yaw negated only at the render boundary. Teammates keep the original palette.
  Fire/hit stop at the loaded clip duration, not a copied 120/180 ms constant.
  A source retime must also update the accepted artifact hash and review the
  existing 700 ms Feedback retention limit; longer hit/death clips are rejected
  before activation. The 240 ms fixture is within that limit and does
  not alter simulation cadence, damage or reload timing.
- There is no skinned motion, finger articulation or enemy magazine/reload clip.
  Rigid gait, grip, reload contact, death silhouette and screen coverage need
  real-client same-camera comparison; this candidate is not quality-passed.
- Template resources are owned per View. Generation replacement/page teardown
  aborts requests and disposes late completions. Opponent instances share template
  resources; reset removes instances, and final disposal releases each resource.

Headless tests and builds are regression evidence only, not a substitute for
native/cloud smoke, hardware GPU comparison or non-author visual judgement.

## Training marker consumer

The existing offline-training candidate consumes only the marker/core/accent
geometry and three hit scale clips from `hit-feedback.glb`. Its original CC0
recipe is unchanged; `source-hit.ts` verifies delivered bytes using the shared
loader without expanding the older two-character `CONTENT_PIECES` collection.
The world impact burst is not used: its octahedron duplicates the current world
hit shape. Passage geometry is still not adopted.

Body/head keep the existing 320 ms hold while the source's 120/180 ms pop keys
are clamped at their last frame. Kill follows the source's bounded 700 ms tail.
The actual View attaches a camera-local marker at 0.5 m, with unlit palette
materials, no depth write/test and no double vertex tint. Friendly hits retain
the source cool tint and never use an enemy kill accent. The world friendly-hit
warning and self-damage corner brackets remain separate.

A completed render issues `hitSource.ownsMarker`, `round`, `shotTime` and `kind`.
Only a matching receipt suppresses the CSS marker and shares its text expiry.
`ready` alone does not claim rendered adoption. Missing/failed assets and Canvas
retain CSS; missed shots cancel old confirmations. Reset detaches the marker
and clears the receipt, and teardown owns both UI materials and source assets.

CPU projection puts the complete resting accent at about 17.5 px at 1080p/80°
FOV, not the source's nominal 14 px core target. Real pixels, narrow-window
readability, overlap, lighting and device playback are unverified. This remains
inside the existing training branch; it is not a new public candidate or Site
deployment. See [training integration](../../docs/training-integration.md).
