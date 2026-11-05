# Three environment standards, first integration candidate

Original script-built geometry for the existing center-dogleg wall, site-cover and **one** lamp at simulation (-11.5, 0, -13). The other five lamps are unchanged. No map, collision, navigation, lighting, actors or HUD edits. Geometry is not commercial game content and no third-party meshes/textures/model weights were used. This directory does not extend another directory's CC0 grant or introduce a new asset licence.

The player-facing comparison is opt-in on the existing offline entry: append `&art=standards-v1` to `?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1`. Unknown/duplicate art values and absent courtyard keep the current environment. Default/v13 clients do not consume these assets. CPU canvas fallback does not display this art.

`tools/build.py`, `contract.json`, `style.json` and the editable `.blend` preserve the source recipe. Run Blender background with factory startup, `--disable-autoexec --python-exit-code 1 --python tools/build.py -- --help` to see the builder's output options. GLBs are authored Y-up, metres, bottom-centre pivots; assets are uncompressed and self-contained, no new decoder/transcoder dependency. The current 123,604-byte set is below the need for mesh/texture compression; do not add a pipeline simply for three small files.

## Rebuild without leaving a mixed asset family

From the repository root, run `blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python assets/environment/standards-v1/tools/build.py`. Blender 4.3.2 reproduces all three checked-in GLBs byte for byte. The model manifest and embedded `.blend` text record their original authoring inputs; the later batch-publication helper changes the rebuild process, not the shipped GLBs. New builds embed both `build.py` and `asset_batch.py` alongside the contract and style.

The builder now writes the entire family to a sibling staging directory. Only successful GLB exports, `.blend` save and manifest creation replace `models`; an ordinary publication failure restores the previous directory. Existing unknown regular files and subdirectories are preserved. Symlinks, output paths outside this asset directory, source directories and invalid piece filenames are rejected. A custom output's parent must already exist. Use a single writer per output: the lock rejects overlapping or interrupted runs.

`--render` optionally includes a CPU studio PNG in that same output directory, before the batch is published; a later build without `--render` removes the old generated PNG. It remains an offline preview, not a game capture. The GLBs and runtime rendering are unchanged by this tooling fix.

## Check the manifest without rebuilding

`tools/verify_manifest.py` is a read-only, standard-library check. It does not run Blender, parse GLB geometry or `.blend` internals, execute or re-save the `.blend`, use the network, GPU or a browser, and it never writes the checked files.

```
python3 assets/environment/standards-v1/tools/verify_manifest.py --json
```

It defaults to this directory and `models/manifest.json`; `--root <standards-v1>` and `--manifest <path inside root>` select another copy. stdout is one UTF-8 JSON document ending in LF. Exit codes: 0 both checks pass, 1 stale source record or byte mismatch, 2 invalid CLI, unreadable file or unsupported structure. stderr carries only a short status line.

`artifactIntegrity` recomputes each contract piece's `models/<id>.glb` byte size and SHA-256, and the manifest `.blend` byte size and SHA-256; the `.blend` is read only as opaque bytes, not parsed or executed. `sourceCurrency` recomputes the four fixed inputs (`tools/build.py`, `tools/asset_batch.py`, `contract.json`, `style.json`) and reports missing, extra, duplicate and changed entries. `overall` is true only when both pass.

The checked-in historical manifest is honestly **stale** under this check: it omits `tools/asset_batch.py` and records the earlier `tools/build.py` hash, while the three GLBs and the `.blend` currently match their recorded sizes and hashes. That means the manifest's input record does not reproduce the current sources; it does not mean the shipped artifacts are corrupt, and a passing check would not prove that the recorded build actually ran. Geometry, skinning, visual quality, licensing and `.blend` internals are not verified. The tool supports manifest schema `fps-art-standard-draft/1`; unrecognized fields are rejected rather than ignored. Do not rewrite the historical manifest just to make the check pass; a real rebuild produces a current record.

Run `python3 assets/environment/standards-v1/tools/test_asset_batch.py` for filesystem, missing-output, cancellation and rollback tests. Run `python3 assets/environment/standards-v1/tools/test_verify_manifest.py` for the verifier's pass, stale, malformed, duplicate and path-escape cases; both suites run on CPU without Blender. Run `python3 assets/environment/standards-v1/tools/test_build_integration.py` with Blender 4.3.2 installed for real exports in a disposable copy: two unchanged rebuilds, a palette edit, an injected failure before the second export, missing style input and restoration. The first failed GLB export does not touch the live batch; the second edit changes both plaster pieces while preserving the lamp.

Directory replacement is not a power-loss transaction. If a run is killed, do not blindly delete `.models.build-lock`, `.models.build-backup` or its staging directory: first confirm no writer remains, inspect the complete backup and current output, and restore the backup if the output is absent. A failed rollback preserves these paths and blocks retry. If only backup cleanup fails, the error explicitly says the new batch is already committed; do not roll it back from a partly cleaned backup. Remove recovery remnants only after choosing and checking the complete batch to retain.

Budget for the three replacements: 2,396 triangles / four mesh draws before renderer batching, zero textures. Wall 1,596 tris, cover 680, lamp 120. Existing fallbacks remain allocated until View disposal and are hidden only after all three assets pass checks. Thus this is **not** net-memory savings. Bytes/draw/triangle counts are asset geometry measurements, not a proven frame-time/GPU budget. Loading has a 12-second timeout; error, cancellation, bad size/shape/material or missing destination retains the current geometry. Late completion cannot attach after View disposal. The runtime `fpsClient.state().art` exposes readiness and budget without any simulation write API.

Original dimensions remain the visual limit, not evidence of perfect collision fit: bevels may make corner silhouettes slightly smaller than their unchanged solid colliders. Real game-camera wall hugging, low-cover sightlines and actor readability still need comparison. AI concept B guided quiet pale plaster / blue-gray bases / thin ochre accents only; it is not a screenshot or dimension source. No target image is baked into the models. This first integration is not the meaningful second art revision and has no visual acceptance yet.
