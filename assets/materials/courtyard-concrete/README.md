# Courtyard concrete colour

Source: [Concrete Floor 01](https://polyhaven.com/a/concrete_floor_01), **Rob Tuytel / Poly Haven**, [CC0-1.0](https://polyhaven.com/license). Downloaded 2026-10-26 from the official [1K diffuse JPG](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_floor_01/concrete_floor_01_diff_1k.jpg). Official dimensions: 2m × 2m. No preview render, logo, paid file or third-party mirror is included.

`source/concrete_floor_01_diff_1k.jpg` is the unchanged 755,740-byte original: SHA-256 `db7c800f1464359b5f359fc743e82ac51b34e014fdfd53844f4af34bb1949229`; MD5 `187065cfc20a35eb421eac6d4f38c58f` matches the official files API entry. It is the editable input, not a claimed Substance source.

Run `python tools/build-ground.py` (Pillow) from the repo. The recipe downsamples to 256px, centres each colour channel on the existing courtyard palette with 0.55 contrast, and exports an RGBA mip chain plus a local-look preview. Recolouring is our derivative, not unmodified physical albedo. Only this colour chain is consumed: no copied normal, displacement or AO, and no geometry/collision change.

Three uses the same source colour in a repeating 2m material; Canvas uses the matching world-space sample and mip levels before original wall/actor occlusion. Runtime owns its texture/buffer, releases it with the view, and makes no external request. Quality adoption depends on the normal game view, not source resolution or license.
