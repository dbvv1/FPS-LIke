# Official glTF validator regression

Pins the Khronos [glTF-Validator](https://github.com/KhronosGroup/glTF-Validator) npm release `2.0.0-dev.3.10` (Apache-2.0) and runs it against the four committed GLBs in `../dist/`. The case's own `../validate.mjs` checks structure, budgets and contracts; this package checks that the same files pass the glTF 2.0 specification.

## Run

From the repository root:

```sh
npm --prefix asset-pipeline/content-set/validation ci --ignore-scripts --no-audit --no-fund
node asset-pipeline/content-set/validation/validate.mjs
npm --prefix asset-pipeline/content-set/validation test
```

`validate.mjs` reads `../spec.json` for the expected four pieces, so an empty or partial `dist/` cannot pass. It exits non-zero on any error, warning, truncated report, external resource request or missing file; infos are reported but do not fail the gate. The test file also truncates one GLB to prove the real CLI rejects a malformed container and runs an empty-directory negative case.

## Current result

Four pieces: 0 errors, 0 warnings. The only info is `UNUSED_OBJECT` for the passage's `TEXCOORD_0`, which is intentionally kept for the existing runtime concrete texture slot rather than an embedded image. Application into the game and any GPU/visual acceptance stay with the case line.

Dependency versions and registry integrity are fixed in `package-lock.json`. `node_modules/` is not committed.
