# First-person weapon sources

The RX-24 rifle uses one **CC0 Quaternius Ultimate Guns Pack** source, `AssaultRifle2_1`, with an original gloved-hand recipe. The existing original pistol is unchanged. This is a presentation asset; damage, firing cadence, spread, recoil input and reload timing still come from the same simulation.

## Rifle master and derivation

- Author and official pack: [Quaternius, Ultimate Guns Pack](https://quaternius.com/packs/ultimategun.html), July 2019. License checked 2026-10-26: CC0 1.0, including commercial reuse; the author's `LICENSE.txt` text is preserved (line endings/trailing whitespace normalized) in `quaternius/`.
- The official page links its [public download directory](https://drive.google.com/drive/folders/12V-mHNB6bnW2WzgpJfRBQd-TG4pOO3yx). Only one rifle's unchanged, editable OBJ/MTL is included, not the whole gun library. No commercial-game assets or marks are used.
- Editable source: `quaternius/AssaultRifle2_1.obj` and matching MTL, importable in Blender or another mesh editor. Source OBJ SHA-256: `bddb03e49ea71517865028b1f06cdc8b1c6ffbc854b15369db66599f973a4d2f`. The author's original Blend (SHA-256 `8d6c8750932573f28a17b49cfcb990a230e29725d593593b261a80199b31dd67`) is retained only locally because it contains author-machine path metadata. A local OBJ-rebuilt Blend also retains factory-startup UI metadata, so neither binary is redistributed; the editable geometry is not lost.
- Run `python3 tools/weapon/extract-rifle.py` from the repo root to reproduce `rx24-rifle.json`. The recipe converts source +X to camera-local −Z, sets the view-model scale/pivot, applies the game's charcoal palette and separates the source's disconnected magazine. A specific lower-left magazine face supplies the grip anchor; the original palm rests just outside that face, follows its full withdrawal/insertion translation, and returns to the foregrip before settling. The visual muzzle is the centroid of the source barrel's front-cap vertices. It checks the source hash/topology before selecting that component.
- To change the master, re-export the OBJ, deliberately review the recipe's topology/hash and grip alignment, then regenerate. Do not edit the generated JSON in place. No model service, account or runtime asset download is required.

## Hands and consumers

`src/render/rifle.ts` is the original editable palm/finger/wrist/sleeve and small charging-handle recipe; it uses tapered curved sections. This original recipe and the existing pistol recipe in `weapon.ts` may be reused under CC0-1.0. Both Three and Canvas consume the same mesh vertices, part positions and existing reload pose. Canvas shades mesh normals without outlining every source polygon; it does not substitute a flat weapon screenshot.

The support hand reaches the same magazine and follows its out/in path. Contact, finger placement and screen coverage must be judged in actual idle, recoil and reload views; geometry/projection tests are only regression gates. Rifle source intake is not a claim of CS2-level quality.

Selection: Kenney's official CC0 Blaster Kit 2.1 was also inspected, but its colorful toy/sci-fi silhouette was a poorer fit for the chosen CS2-referenced rifle direction. Quaternius's stock/receiver/foregrip/magazine proportions were chosen as the narrower reusable starting point.
