# Relay Yard courtyard surface family

Original editable procedural recipe: `src/candidates/offline-training-v1/render/environment-kit.ts`. This is **not** an imagegen-created runtime texture pack. AI target paintovers informed only the warm/cool palette; neither target image is sampled, projected into the world, or used as a background. No external images, commercial game assets or additional model downloads.

## Standard pieces and construction

The existing ten `MAP.walls` are the only wall geometry. Boundary wall, route divider, dogleg, low cover, horizontal caps and floor all use one coordinated family:

- Warm matte upper panels with 2 m assembly joints and restrained edge highlights.
- Cool plinth, narrow ochre division, quiet upper service strip.
- Repeated broad inspection-grille marks below eye level on tall walls. These are **painted surface motifs**, not geometric recesses, holes, normal detail or new cover.
- Low cover receives the same edge/base language without tall-wall service motifs.
- Tops/bottoms are sampled in their own horizontal metre coordinates, not stretched side strips.
- Original floor box gets quiet 2 m slabs in a 4 m repeat. Existing route marks/site ring remain separate and unchanged.

Existing `BoxGeometry` positions/normals, triangle set (including winding) and world transforms are preserved. The default wall path reorders faces into five-side/top groups; the candidate restores native BoxGeometry index order for one draw, so index sequence is not byte-identical to the default. Only UVs/materials change; all six faces share a single atlas material. No simulation/navigation/physics, route widths, cover area, target, gun, hand, HUD or camera edit. This does not repair the blockout silhouettes or first-person arm quality.

## Material and resources

Three 0.186.1 `MeshStandardMaterial`, albedo only, wall roughness .91/metalness 0, floor .95/0. Existing hemisphere + directional lights unchanged. No custom GLSL, displacement, normal maps, shadow pass or postprocessing. The shader is existing Three infrastructure, **not** a recreation of VALORANT's proprietary shader.

Each wall has one 512×256 RGBA atlas: six 128×128 tiles, each with 2-pixel clamp gutters and 124 active samples; two cells unused. Box face order is +X,-X,+Y,-Y,+Z,-Z. Sampling spans respectively `(2hz,2hy)`, `(2hx,2hz)`, `(2hx,2hy)`. Face dimensions are in metres, so e.g. a 2 m seam has the same intended world spacing on long/short faces. **Texel densities are not equal**: 124 divided by each span (about 3.35 samples/m along a 37 m boundary, 155/m along the .8 m cover height). The small edge features on long faces may vanish/alias; real-camera comparison must check this, not claim perfect texel density.

Atlas filtering: bilinear, no mipmaps, no anisotropy change. No-mip avoids cross-face bleed, but distant shimmer is an explicit unresolved risk; visual tests may require a different packing/LOD approach, not blind parameter tuning. Floor is 256² RGBA, repeat wrap. No fake roughness/normal texture is supplied.

Offline estimate for ten walls + floor: 5,505,024 raw RGBA bytes (5.25 MiB), 120 wall triangles unchanged, ten wall draws vs previous twenty, zero added passes. Excludes driver allocations, baseline resources and all non-wall draws. These are resource-count estimates, **not measured GPU performance**.

## Candidate and verification

Only the exact single query `?gameplay=offline-training-v1&environment=courtyard-v1` opts in. Default URLs retain previous geometry/material path. Canvas2D intentionally retains the existing fallback and does not claim this kit is active. This branch does not incorporate the separate character candidate.

`fpsClient.state().environment` (Three only) reports the fixed ID, offline budget and `active`; construction does not mark adoption. A completed View render marks active; reset/dispose clear it. No screenshot or browser execution was performed for this source revision.

Recipe regeneration is runtime deterministic (`wallAtlas`, `floorPixels`); CPU tests regenerate twice and check bytes, UV bounds, face dimensions, exact geometry and immutable MAP. Run `npm test` and `npm run build`. `npm run smoke:headless` and actual GPU same-camera review remain required before integration/default promotion respectively; neither was run here.

## References and limits

Riot's [Shaders and Gameplay Clarity](https://www.riotgames.com/en/news/valorant-shaders-and-gameplay-clarity) informed broad matte response and readable environment/character contrast. This kit has not reproduced that game's art quality or specialized lighting. The current default's CC0 concrete source stays untouched for the normal URL; candidate slab pixels are original code-produced colors only.
