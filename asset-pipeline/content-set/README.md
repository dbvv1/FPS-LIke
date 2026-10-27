# Relay Yard content set

The buildable content standard for the FPS-Like vertical slice: four GLB standard pieces, a locked palette, action and material contracts, and a deterministic offline pipeline. Read [`docs/content-production.md`](../../docs/content-production.md) for the style page, the full-round inventory and the remaining gaps.

This directory does not change the game at runtime. `src/` still uses its procedural view model, the `guard.json` target, the CSS hit marker and the existing courtyard boxes until the case line wires these files in.

## Pieces

| File | What it is | Bytes | Tris | Materials | Draws |
|---|---|---|---|---|---|
| `dist/fp-arms-rx24.glb` | First-person arms, hands, sleeves and the RX-24 rifle, with magazine and bolt nodes | 169,816 | 3,006 | 2 | 5 |
| `dist/enemy-relay-guard.glb` | Full-body enemy with five rigid action groups and idle/walk/fire/hit/death clips | 37,068 | 515 | 1 | 5 |
| `dist/passage-cover.glb` | 12 m corridor with two doorways, end wall, half-wall and crate cover | 56,120 | 768 | 3 | 3 |
| `dist/hit-feedback.glb` | Four-tick marker, headshot accent and impact burst | 6,436 | 24 | 3 | 3 |
| **Set** | | **269,440** | **4,313** | 0 new textures | |

`content-set.json` is the generated manifest: per-piece SHA-256, source hashes and licences, the exact derivation steps, bounds, action contracts and gaps. `wiring.json` names the existing `src/` consumer seam and node contract for each piece; this unit does not edit `src/`. `palette.json` and `palette.svg` are the locked sRGB roles and material families.

## Commands

Run from the repository root. `build.mjs` and `validate.mjs` use Node built-ins only: no browser, GPU, network or package install. The `node --test` step additionally imports the repository-pinned `three` 0.186.1 (`GLTFLoader`, `Box3`, `Vector3`), so run `npm ci` first on a clean checkout.

```sh
node asset-pipeline/content-set/build.mjs          # rebuild dist/, manifest and palette
node asset-pipeline/content-set/build.mjs --check  # rebuild in a temp dir and compare hashes/budgets
node asset-pipeline/content-set/validate.mjs       # structural, budget and contract checks
node asset-pipeline/content-set/build.mjs --variant # second palette + 0.95 scale pass

npm ci                                             # installs the pinned three for the test
node --test asset-pipeline/content-set/tests/content-set.test.mjs
```

The build is deterministic: the same sources and `spec.json` produce the same GLB hashes. `--check` exits non-zero if a piece drifts or exceeds its budget. The variant pass writes `variant-report.json`; it is a rerun test, not an adopted art direction.

## Source and licence

- RX-24 rifle: Quaternius, Ultimate Guns Pack, CC0-1.0. The derived `assets/weapons/rx24-rifle.json` is consumed; the source OBJ hash is recorded in `content-set.json`.
- Enemy body: Casti_131, Low Poly Soldier with weapons, CC0-1.0. The source hashes and original derivation are recorded in `assets/characters/relay-guard/README.md`.
- Concrete material slot: Rob Tuytel / Poly Haven, Concrete Floor 01, CC0-1.0. This set reuses the existing 2 m slot and embeds no new image.
- Hands, arms, sleeves, passage, marker, palette and contracts: original recipes in `build.mjs`, dedicated CC0-1.0 in `LICENSE.txt`.

No AI-generated assets, paid assets or credentials are used, and no commercial or unlicensed third-party game art is used; the only third-party assets are the CC0 sources listed above. No local absolute paths are written into the artifacts.

## Scope notes

- Renderer uses glTF 2.0 with float positions, normalised int8 normals and normalised uint8 vertex colours. No Draco/meshopt/KTX2 yet; the total is small enough to stay uncompressed.
- Character and weapon materials use linear vertex colours with flat normals; only the passage binds the existing concrete texture (object-space UV in metres / 2).
- Action clips are node TRS only. The enemy is a rigid-group approximation, not a skin. The player reload stays procedural until a hand rig exists.
- Material families are read from `spec.json`; each GLB material records `extras.family` and matches that family's roughness/metalness, so the palette sheet and the artifacts cannot drift.
- The passage's dimensions, module list and 13 collision boxes live in the GLB scene extras (`gltf.scene.userData`), the same data as `contracts/passage-cover.actions.json`; the root and mesh nodes do not duplicate them.
- A real-GPU roster in the game lighting is still pending; no offline preview is a quality claim.
