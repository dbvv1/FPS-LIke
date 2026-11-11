# RX-24 weapon-only asset

Static weapon geometry extracted from the fixed first-person content piece
`assets/content-set/fp-arms-rx24.glb`. This directory exists so the already
authored RX-24 rifle can be prepared for the fixed Knight native ranged
candidate without searching for or generating another gun.

- Source: `assets/content-set/fp-arms-rx24.glb`, 188,088 bytes,
  SHA-256 `e672d06e30262f2575076f759645aa3d82d6734f0c26ef280a2a36870549b9e1`,
  fixed at `b198df62a56f4c520716fbc9cb4afac47dd62213`.
- Source licence: `assets/content-set/LICENSE.txt` (CC0-1.0; upstream RX-24
  geometry by Quaternius, Ultimate Guns Pack, CC0-1.0). The source file and
  licence are not modified or redistributed here beyond the existing copy.
- Output: `weapon-only.glb` (121,224 bytes, SHA-256
  `66a2872ed6a1ecb269e80ee7a3c5166fc7d4ebb82318b7b696e3222bfe54087a`),
  glTF 2.0 GLB, metres as declared by the source.

## Contents

| Node | Role | Triangles | Vertices |
| --- | --- | ---: | ---: |
| `rx24-root` | weapon root, original root coordinate system | 0 | 0 |
| `rifle-static` | gun body (`rx24-static` mesh) | 1,806 | 5,418 |
| `rifle-magazine` | independent magazine node | 124 | 372 |
| `rifle-bolt` | independent bolt node | 28 | 84 |
| `muzzle` | source muzzle flash / tracer anchor | 0 | 0 |
| `grip` | source support palm contact point | 0 | 0 |

Total: 1,958 triangles, 5,874 vertices, 3 meshes, 3 draw calls, 1 material.
Root-space bounding box: min `[-0.027446, -0.214921, -0.777468]`,
max `[0.036, 0.071522, 0.049542]`.

`grip.extras.role` stays verbatim as `support-palm-contact`; it is the support
palm contact point, not a primary-hand grip, a generic bone socket, or a
first-person camera mount. The source first-person `restMount` (camera-relative
view-model transform) is deliberately **not** exported and must not be used as
a world transform or bone mount. All matrices in `manifest.json` are in the
original `rx24-root` root space.

Materials, vertex colours and quantised normal/colour accessors are copied from
the source: one `RX-24 gunmetal` material (`metallicFactor` 0.25,
`roughnessFactor` 0.65, `doubleSided` true, `extras.family` `gunmetal`). There
are no textures, UVs, skin, animations or LODs; none are needed for this card.
`KHR_mesh_quantization` remains declared used and required because the source
int8 normals and uint8 colours are preserved.

## Using this asset / mount contract inputs

Load the committed `asset-pipeline/kaykit-rx24/weapon-only.glb` directly; no
rebuild is needed to consume it. `rx24-root` is an identity root node, and every
recorded matrix, bounding box and mount position is expressed in its root space.
The output GLB keeps the source scene extras orientation contract: **up is +Y,
forward is -Z**.

This asset does **not** provide a primary-hand (right hand) mount, a skeleton
socket, or any bone attachment. The consumer must define its own mounting
contract (which hand/bone it attaches to, with what offset and rotation); this
asset only supplies the weapon geometry and the reference points below. In
particular, `grip` is the support palm contact point and must not be used as the
primary-hand grip, and the source first-person `restMount` is not exported and
must not be used as a world or bone mount.

Root-space reference points (the same values are in `manifest.json` under
`mounts`):

| Mount | Root-space position (`x, y, z`) | Meaning |
| --- | --- | --- |
| `muzzle` | `[0.0003, 0.0021, -0.7775]` | source muzzle flash / tracer anchor |
| `grip` | `[-0.0344, -0.175, -0.3456]` | support palm contact point (not the primary-hand grip) |

`rifle-magazine` and `rifle-bolt` are independent child nodes in the same root
space, so a consumer can drive reload and bolt motion by transforming those
nodes; no clips are exported with this asset.

## Anchor contract (consumer input)

`anchors.json` publishes the three contact semantics a mount consumer needs,
without inventing a complete hand frame:

| Anchor | Root-space position (`x, y, z`) | Meaning |
| --- | --- | --- |
| `primary-palm-center` | `[0.036, -0.099, -0.19]` | trigger-hand palm centre, the primary hand contact |
| `idle-support-palm-center` | `[-0.033, -0.044, -0.446]` | support palm centre in the idle two-hand hold |
| `reload-magazine-palm-target` | `[-0.03443, -0.175014, -0.345572]` | support palm target while grasping the magazine |

The values are derived from the live render consumer
`weaponParts('rifle')` (`src/render/weapon.ts`): the two palms are the
`trigger-palm` / `support-palm` part positions (the support palm already
includes the single `hands()` `+0.025 m` Y adjustment), and the reload target
is `support-palm.position + support-palm.gripOffset`, i.e. the source
`grip.surface + grip.palmOffset`. `anchors.ts` also re-reads the fixed GLB with
the real `three 0.186.1 GLTFLoader` and fails if the `trigger-hand` /
`support-hand` node origins disagree with the palms by more than `1e-5 m` per
axis, or if the `grip` node origin disagrees with the reload target by more
than `5e-5 m` per axis (the source `grip` keeps its existing 4-decimal
encoding; both values and the observed error are reported).

The source `grip` node is **not** renamed or edited, and its extras role stays
verbatim `support-palm-contact`; the new data explains that it is the reload
magazine target, not the idle foregrip hold, a primary-hand grip or a bone
socket. The muzzle firing axis is the source local `-Z` axis declared by the
GLB scene extras, checked against the distal end of `rifle-static`. Palm surface
normals/rotations, Knight bone binding and an acceptable contact tolerance stay
`null`: three points do not make a frame.

Regenerate the committed JSON (the CLI prints only to stdout, so a failed build
leaves the target empty; two runs on the same input are byte-identical):

```sh
node --import tsx asset-pipeline/kaykit-rx24/anchors.ts \
  --src assets/content-set/fp-arms-rx24.glb \
  > asset-pipeline/kaykit-rx24/anchors.json
node --import tsx --test tests/kaykit-rx24-anchors.test.ts
```

## Excluded geometry

The complete `support-hand` and `trigger-hand` node subtrees (both separate
hand meshes, 1,048 triangles and 3,144 vertices, material
`Glove and sleeve fabric`) are excluded by node/mesh identity. No hand or
sleeve faces are deleted by colour. Extraction fails if a retained mesh shares a
mesh, accessor or hand-only material with those subtrees, or if any node cannot
be classified as weapon geometry or excluded hand geometry.

The source clips `idle`, `fire`, `reload-magazine` and `reload-bolt` are not
exported. This card delivers static geometry with independently addressable
magazine and bolt nodes; it does not claim weapon animation, reload contact,
grip fit or style match.

## Rebuild

The committed `weapon-only.glb` and `manifest.json` are already the result of
this rebuild from the fixed source. Rebuild only when the extraction recipe or
its contracts change, not to consume the asset.

Run from the repository root. The script requires explicit source, output and
manifest paths and refuses to write without them.

```sh
node --import tsx asset-pipeline/kaykit-rx24/extract.ts \
  --src assets/content-set/fp-arms-rx24.glb \
  --out asset-pipeline/kaykit-rx24/weapon-only.glb \
  --manifest asset-pipeline/kaykit-rx24/manifest.json
```

The source SHA-256 and byte size are checked first. Missing input, wrong hash,
missing/duplicate required nodes, hand/weapon mixing that cannot be separated,
and contract drift all exit non-zero. Output is built into temporary files,
re-read with the real Three.js 0.186.1 `GLTFLoader`, compared with the untouched
source (node/world matrices, root-space vertices, materials, bounds and mount
positions), and only then replaces the targets. Equivalent source/output/manifest paths (including hardlinks and symlinked
ancestors), output symlinks and directory destinations are rejected before writing.
Validation failures leave existing outputs untouched. Publication saves both old
files first; a caught rename failure restores the old pair (or removes a newly
created first output). If recovery itself fails, backups are retained and the
error reports recovery failure. This is in-process recovery, not a cross-process
crash-atomic transaction; concurrent writers are unsupported. Rebuilding the fixed source twice produces the same
bytes and SHA-256.

## Verification

```sh
node --import tsx --test tests/kaykit-rx24.test.ts
npm run typecheck
```

The test covers the fixed source hash, unique required nodes, hand exclusion,
independent magazine/bolt meshes, 1,958-triangle / 5,874-vertex contracts,
source-to-output world matrices and root-space vertices (tolerance 1e-6),
material values, root-space bounds, grip/muzzle positions, deterministic
rebuilds, CLI argument and hash failures without overwriting valid output, and
a public-artifact scan for local absolute paths and credentials.

Not verified here: grip or muzzle placement against Knight hands and native
reload clips, first-person camera framing, silhouette/style match, human-body
metre scale fit, and browser/GPU/in-game adoption. No browser run is part of
this card.

## Knight 接触拟合：拒绝手槽最近表面方案

**当前不把 RX24 挂到 Knight 上。** 固定 Knight 的稳定双手瞄准末帧中，左右手槽最近的真实手套表面相距 **0.562282 m**，RX24 主掌与常态支撑锚相距 **0.270780 m**。刚体变换不改变两点距离：主手点对齐后，支撑点仍至少差 **0.291502 m**；两手均摊误差也各需 **0.145751 m**。因此拒绝这组原尺寸装配，不通过放大枪械、自动缩放人物或新建 IK 来隐藏差距。

`knight-contact.ts` 在 `native-aim-two-hand` 的末帧，从每个手套中所有顶点均由对应手骨贡献超过 50% 的三角形里，选离原 `handslot` 最近的点。它保存实际三角形索引及重心坐标，每次采样重新计算蒙皮顶点，而非把手槽、手骨或包围盒中心当掌面。当前选点离左右手槽分别 **0.058398 m / 0.037697 m**；三原生动作的 15 个采样中，沿用瞄准时的固定骨偏移会偏离这些表面，最大 **0.017840 m**。

这些是可重复的**表面候选**，尚未由真实姿态图确定解剖学掌面；本结论只否决“手槽最近表面＋原尺寸 RX24”这个方案，不证明所有 Knight / RX24 配对都不可行。实际掌面、枪轴滚转、握持容差与完整换弹仍未定。下一步先在可用的既有拍摄流程里判断这两处表面及持枪姿态是否有可用搭配，不能继续把 CPU 源动作当已可见的持枪角色。View、默认和网站均不变。

复算使用现有 `78a892c` 的固定 Knight / Med_CombatRanged 文件，与上文已接收的 RX24 三锚配方；先核两份源 hash，再输出 15 姿态及距离，不写源文件。缺输入、错误 hash 或无法识别手套表面均非零退出。

```sh
node --import tsx tools/check-kaykit-rx24-contact.ts <fixed-sample-directory>
node --import tsx --test tests/kaykit-rx24-contact.test.ts
```

2026-11-11：真实固定源两次输出逐字一致；贴图由 CPU 空纹理替代，浏览器、GPU、实际握持与游戏内使用未验。许可及固定源追溯沿本目录和 `docs/skinned-character-consumer.md`，不引入新的模型来源。
