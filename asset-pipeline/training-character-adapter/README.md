# Training character adapter

Offline CPU adapter that connects the accepted `enemy-relay-guard` GLB from the
old 1v1 character candidate to the current `offline-training-v1` read-only
Actor / GameState / Feedback contract. It is the only new artifact of this unit:
`src/`, `tests/`, the GLBs and the old guard branch are not modified.

The adapter prepares the missing gait gap for running opponents. It does not
create a new character, retime a source clip, recolor a waist/leg material, or
replace the first-person weapon and sleeve consumers.

## Source identity

This adapter consumes the same bytes that `src/render/content-set-assets.ts`
already accepts. It does not rebuild them.

| Field | Value |
| --- | --- |
| Piece | `enemy-relay-guard` |
| Source commit | `b198df62a56f4c520716fbc9cb4afac47dd62213` |
| Runtime file | `assets/content-set/enemy-relay-guard.glb` |
| Bytes | 40,388 |
| SHA-256 | `5b316a139cf48b21a6d6b7328ac1c8b58a73c4f41ce1a0de24f2a8ca74afbd74` |

The authoritative recipe, action contract and licence are under
`asset-pipeline/content-set` at that commit; the runtime copy is documented in
`assets/content-set/README.md`. The adapter verifies both byte length and
SHA-256 before parsing and rejects a mismatch without activating a replacement.

## Contract

`TrainingCharacter.pose(state, actor, effects, visible)` is presentation-only.

- **Read-only inputs.** It reads `actor.position`, `actor.yaw`, `actor.hp`,
  `actor.input.crouch`, movement amount (`actor.velocity` when the movement
  option supplies it, otherwise `actor.input.x/z`), `state.time`,
  `state.phase`, `state.shots`, and the `ShotEffect` list returned by the
  existing `Feedback.update`. It never mutates state, actor, effects or the
  simulation clock.
- **Rest TRS first.** Every pose restores each authored node position,
  quaternion and scale, then samples one absolute clip. No AnimationMixer,
  incremental transform or accumulated delta is introduced.
- **Clip priority.** `death > hit > fire > walk > idle`; exactly one clip wins
  per pose. Crouch is the existing procedural `0.65` Y scale applied before the
  feet-origin fall, matching `targetVertices`.
- **Ages.** While the round is live (or paused with the simulation clock
  standing still), hit and death read the original simulation age,
  `(state.time - shot.time) / SECOND`. After settlement (`phase === 'over'`)
  they reuse the existing Feedback event age, which already carries its bounded
  700 ms presentation tail. The adapter adds no timer and no wall clock.
- **Durations.** Fire, hit and death stop at `AnimationClip.duration` parsed from
  the GLB. No `120` / `180` / `600` constant is copied into the adapter. A
  `hit` or `death` clip longer than `RESULT_HOLD_MS` is rejected before
  activation because Feedback could not present it completely.
- **Expiry.** Expiry is per event type, and neither type ever replays or
  rewinds. A death event at or beyond the 700 ms retention is expired: the
  pose keeps the restored rest TRS (`selectMotion` returns `null`) and
  `visible()` turns the instance off. A nonlethal hit is never a hide
  condition: at the loaded `hit` duration (0.180 s) its clip ends and the pose
  falls through the normal remainder — `fire` while the round is live and a
  shot is still within its budget, otherwise `walk` or `idle` — while the actor
  stays visible for as long as `hp > 0`, including at and beyond the 700 ms
  retention.
- **Coordinates.** World Z is reflected and yaw negated once at the mount
  boundary (`toThree(actor.position)`, `mount.rotation.y = -actor.yaw`). Vertex
  data is never rewritten.
- **Palette.** The adapter never writes material or vertex colors; the source
  GLB carries the enemy's warm palette. The wiring below replaces enemies only,
  so teammates keep the existing procedural `targetColor(..., true)` team color,
  matching the old 1v1 candidate's "teammates keep the original palette". A
  team-carrier recolor of the GLB is not added here; it would change the
  source's waist/leg material and is outside this card.
- **First person.** Only `enemy-relay-guard` is loaded. `fp-arms-rx24`,
  `src/render/weapon.ts`, `src/render/arm.ts` and the first-person sleeve
  deformation keep their existing consumer contract and are not replaced.

## API

`asset-pipeline/training-character-adapter/adapter.ts` exports:

- `TRAINING_CHARACTER_SOURCE` — fixed id, commit, URL, byte count and hash.
- `parseTrainingCharacter(bytes, source?, signal?)` — hash/metadata validation,
  rigid-skin rejection, node/clip validation; disposes its own parsed resources
  on any failure.
- `loadTrainingCharacter(signal, fetchImpl?, source?)` — fetch wrapper for the
  browser wiring.
- `TrainingCharacter` — one instance (clone) of the template:
  `pose(...)`, `selectMotion(...)`, `visible(...)`, `clipDurations`, `detach()`.
- `TrainingCharacterSet` — one template owner per View: `start()`,
  `character(id)`, `retainActors(ids)`, `reset()`, `dispose()` and a read-only
  `status` / `error`.
- `disposeTrainingCharacter(root)`, `trainingNode(...)`,
  `presentationAgeMs(...)`, `movementAmount(...)`, `sha256Hex(...)`.

Instances share the template's geometry and materials. `detach()` only removes
the mount from its parent; never dispose an instance. The owner detaches
instances on `reset()`, and disposes the shared template exactly once on
`dispose()`, a stale generation or a failed validation.

## Wiring location

The intended seam is the existing enemy actor loop in
`src/candidates/offline-training-v1/render/scene.ts`:

1. Construct one owner per View (the same lifetime as `Feedback`):

   ```ts
   import { TrainingCharacterSet } from '../../../../asset-pipeline/training-character-adapter/adapter.js';
   private readonly characters = new TrainingCharacterSet();
   // after the View is constructed
   void this.characters.start();
   ```

2. In `render(...)`, the existing line already produces the authoritative
   effects list:

   ```ts
   const effects = this.feedback.update(state, now);
   ```

   In the actor loop, replace the procedural target mesh for enemies only, and
   keep the current procedural target for teammates and as the fallback:

   ```ts
   const character = actor.team !== player.team ? this.characters.character(actor.id) : null;
   if (character) {
     if (!character.mount.parent) this.scene.add(character.mount);
     character.pose(state, actor, effects, this.feedback.actor(actor).visible);
     const fallback = this.actors.get(actor.id);
     if (fallback) fallback.visible = false; // a previous frame may have built it
   } else {
     // existing targetTriangles/targetVertices mesh path, unchanged;
     // its model.visible = reaction.visible restores the fallback when needed
   }
   ```

   `start()` loads asynchronously, so early frames usually create the procedural
   mesh before the character is ready; hiding that mesh in the character branch
   is what keeps the two representations from rendering together. Teammates do
   not take this branch and keep the procedural `targetColor(..., true)` team
   color, as in the accepted 1v1 wiring.

3. Before the final `post.render()` / `renderer.render()`, drop characters that
   no longer own a drawn enemy. Compute the same drawn set as the actor loop so
   an observer camera's extra actors are not detached before the frame renders:

   ```ts
   const drawn = state.actors.filter(a => (observer || a.id !== player.id) && a.team !== player.team);
   this.characters.retainActors(new Set(drawn.map(a => a.id)));
   ```

   The player and teammates always keep their procedural representation, in the
   player view and in an observer view alike.

4. Forward the existing lifecycle hooks: `reset()` calls
   `this.characters.reset()`; `dispose()` calls `this.characters.dispose()`.

No other file needs to change for the adapter itself. When the card is
accepted into `src`, the module may instead be moved next to `scene.ts`; that
requires rewriting only its three `../../src/...` imports to `../sim/types.js`,
`./feedback.js`, `./coordinates.js` and the asset URL to
`../../../../assets/content-set/enemy-relay-guard.glb`.

## Clips

Durations are parsed from the accepted GLB; the contract values are only shown
for review and are not copied into the sampling code.

| Clip | Duration | Loop | Nodes |
| --- | ---: | --- | --- |
| `idle` | 4.000 s | yes | `spine`, `head` |
| `walk` | 0.900 s | yes | `leg-l`, `leg-r`, `spine` |
| `fire` | 0.120 s | no | `weapon`, `spine` |
| `hit` | 0.180 s | no | `spine`, `head` |
| `death` | 0.600 s | no | `enemy-root` |

## Missing actions (reload / switch)

The accepted GLB exports only `idle`, `walk`, `fire`, `hit` and `death`. These
gaps are source-content gaps, not adapter bugs:

- **Reload** is contract-only in the content set. The enemy weapon is its own
  `weapon` node with a separate `guard-weapon` mesh (228 vertices), not merged
  into the body mesh, and the `fire` clip already drives `weapon.rotation`.
  What the source lacks is a magazine / bolt node, so no reload clip exists.
  Bots still issue reload commands; while `actor.reload` is set the adapter
  suppresses `fire` and presents `walk` / `idle`. Adding reload requires
  separating a magazine (and bolt) node from the `guard-weapon` mesh and
  exporting a new clip, then re-running the source build and hashing the new
  accepted bytes.
- **Switch** has no clip and no node in this source. `switch` commands still
  change `actor.weapon`; the adapter requires `shot.weapon === actor.weapon`,
  so a previous weapon's fire clip does not replay after the switch. It shows
  `walk` / `idle` in the meantime. A switch animation needs a new accepted
  source action.
- There is no skin, finger articulation, upper-body mask or foot-contact IK;
  `walk` is rigid hip/spine motion on a fixed 0.9 s loop and is not stride- or
  speed-matched. Contact and silhouette still need the real game camera and are
  not claimed as quality-passed.

## Commands

Run from the repository root:

```sh
node --import tsx --test asset-pipeline/training-character-adapter/adapter.test.ts
npx tsc -p asset-pipeline/training-character-adapter
```

The root `npm test` is unchanged and does not include this directory. The
adapter tests load the real GLB for every case and use the real
`offline-training-v1` `Game` and `Feedback` for the settled death tail. They
cover:

- accepted bytes/hash, real clip names and source durations;
- fetch success, HTTP failure and byte-integrity rejection;
- actual walk, fire and hit tracks sampled from the GLB at the selected ages;
- bad hash, wrong size, missing clip, overlong hit/death rejection;
- world-Z reflection, yaw and crouch against `targetVertices` (0.06 mm);
- priority order and live-vs-settled age authority;
- a retimed fire clip proving duration comes from the parsed source;
- settled death advancing on the Feedback tail after ticks stop, then expiring
  without replay, plus next-round reset;
- deterministic poses for the same simulation time and presentation age;
- shared template resources, untouched source palette and transform state;
- reload/switch fallback without invented motion;
- owner detach/reset, stale and late loads, post-dispose completion, failure
  fallback, and exactly-once disposal of owned resources.

## Scope and remaining gaps

- The adapter is not wired into `src/` yet; the wiring above is the intended
  seam. No browser, headless browser, GPU, screenshot or first-person visual
  check is part of this unit.
- No real reload or switch clip exists to validate.
- Foot contact, gait readability, death silhouette and screen coverage still
  need a non-author real-camera review; this adapter is not a quality pass.
