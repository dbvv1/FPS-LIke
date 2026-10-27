# 成套内容标准件：中继场完整一局 v1

本页是一页风格说明加四件标准件和一条可重跑的归一链。范围是让案例从占位大方块走向能完整玩一局时，角色、场景、材质、动作、特效、声音和界面先有一套能对得上、能被解析和接线的标准；不是完整地图、武器库或最终品质。基线提交 `a97d57281dd6c6d941c6a6bef732dadf2953f2f4`；本单元不改 `src/`、相机、主循环、既有资产或 `docs/quality.md`。

产物在 [`asset-pipeline/content-set/`](../asset-pipeline/content-set/)：四件 GLB、调色板、动作与材质契约、归一构建脚本、校验脚本和测试。阵容图必须接入本作光照后由真 GPU 拍；本单元没有取得该图，标准件保持“待接入”状态，离线解析不作为品质定稿。

## 一、完整一局的内容类别与实际缺口

按 CS2 一次完整战术回合拆类，数量按 1v1 纵切片缩小，不省类别。已有供给只复用、不重做：`assets/characters/relay-guard`（CC0 全身士兵）、`assets/weapons/rx24-rifle.json`（CC0 Quaternius 步枪派生）、`assets/materials/courtyard-concrete`（CC0 2m 混凝土）、`src/render/synth.ts`（原创合成音效）。

| 类别 | 现在有什么 | 本单元标准件 | 仍缺什么 |
|---|---|---|---|
| 玩家角色与第一人称手臂 | `src/render/arm.ts`、`rifle.ts` 的程序化手掌、手指、袖子和 RX-24；非裸几何枪 | `fp-arms-rx24.glb`：手臂＋手掌＋袖子＋整枪，含弹匣、拉机柄、枪口与握点节点 | 没有蒙皮手骨；换弹仍由运行时重算袖子；GLB 未接入 |
| 敌方全身角色 | `guard.json` 515 面静态姿态，运行时只有整体前倾/倒下 | `enemy-relay-guard.glb`：头、脊柱、双腿、武器五个刚性组与 idle／walk／fire／hit／death 五段节点动画 | 不是蒙皮，肘膝不形变；换弹只有契约；未在游戏光照下对比 |
| 场景通路与掩体 | 院落只有 10 个碰撞大方块、三条路线和一个信标点 | `passage-cover.glb`：12m 长、3.7m 净宽、3.0m 高、两个 1.2×2.2m 门洞（z=0 与 z=4）的通路，一段半墙和一个箱体掩体，附 13 个碰撞盒 | 未放进 `src/content/map.ts`；没有转角套件流式拆分 |
| 道具与武器 | RX-24 与 PX-10 由运行时程序化拼装；炸弹是方块，信标点只有地面环 | RX-24 收进第一人称标准件；通路内有箱体掩体 | 手枪未资产化；炸弹、掉落物和拾取物仍是占位几何 |
| 材质 | 2m 混凝土颜色链，128 px/m；角色与武器面颜色 | 14 个调色板角色、6 个材质族、`palette.json`／`palette.svg`；通路复用既有混凝土槽，不新增贴图 | 没有法线/AO/磨损贴花；没有 trim 图集 |
| 动作 | 玩家 idle／移动／开火／换弹为程序化；敌人僵硬 | 玩家 4 段剪辑（idle、fire、reload-magazine、reload-bolt）；敌人 5 段；换弹阶段以契约给出 | 玩家换弹仍是整段程序化；敌方缺弹匣节点；没有真人手感判定 |
| 命中与武器特效 | 枪口球、命中球、炸弹方块、CSS 命中标记 | `hit-feedback.glb`：四刻度标记、爆头环、击杀保持、低模冲击球与 120／180／700ms 时间线 | 没有烟、曳光、弹孔贴花；现运行仍是 CSS 标记 |
| 声音 | 9 个原创合成 cue：shot／step／reload-out／reload-in／bolt／hit／head／kill／plant | 命中标准件只给 cue 角色映射，不新增录音 | 遮挡、距离层与画面同帧未听验；没有音乐/语音 |
| 界面 | HUD、暂停、设置、分数、弹药、换弹进度、命中标记 | 命中颜色角色：身体白、要害 signal、击杀 signal-hot、友军 faction-cool、未命中无标记 | 标准件未接入 HUD；没有击杀信息条与观战 |
| 光照与天空 | 半球光＋方向光、雾 32–80m、天空 `#94afb7`、无后处理 | 标准件全部按这套光照和 80° 垂直视场制作 | 没有 HDRI／AO／色调映射；整体画面层次仍弱 |

## 二、风格说明（一页）

**方向**：以 CS2 的战术回合结构、机位和信息层级为结构参照，用低模、平面法线、有限调色板重新诠释，不复制任何商业游戏资产。形状语言是硬倒角、八边管、可见接缝和 0.3m 厚的墙体；所有角色、武器和道具共用同一套面颜色与粗糙度区间。眯眼只分三层：亮混凝土墙面与门洞框、中灰地面与金属、深色角色与武器；暖色胸板和蓝面罩停在中景，signal 只在交互/要害出现。角色靠头盔、横向步枪和胸板色块区分轮廓，不靠发光描边。通路每 3–4m 一个结构事件（门洞、立柱、危险条），掩体不超过两处，不撒小道具。离写实标杆的差距保留在：无 PBR 贴图、无法线细节、无后处理和空气透视层次。

**比例与机位**：单位米，+Y 上，−Z 前，脚底 y=0、feet centre actor 原点（与 `src/render/target.ts` 一致）。敌方站高 1.765m，头盔区 1.42–1.765m，约 1:5.1 的方块化头身比，沿源比例不拉伸。第一人称垂直视场 80°，武器组静止挂点 `(0.29, −0.28, −0.32)`，枪口在相机前方（z 深度）1.097m、握点在相机前方 0.666m（欧氏距离约 1.169m／0.846m）；`docs/img/quality-ground-three.png`（1365×900）中枪身＋手臂约覆盖 40% 宽 × 40% 高（目测估算，非像素级测量），标准件沿用同一挂点，1080p 目标为 36–44% 宽／高，最终以真 GPU 截图复量为准。敌方在 5m／10m 处分别占画面高度约 21%／10.5%（16:9、1080p）。通路净高 3.0m、净宽 3.7m、两个 1.2×2.2m 门洞（z=0 与 z=4）、长 12m。命中标记在 0.5m 广告牌平面上刻度外半径 0.0054m（跨度 1080p 约 14px、768p 约 10px；以世界尺寸为准，px 只在 1080p 校验）；冲击球半径 0.035m。

**调色板**（全部锁定在 `palette.json`）：主色 7 个——ink `#171c1e`、gunmetal `#34444a`、concrete-mid `#788982`（由已采用的 2m 混凝土平均色实测）、concrete-pale `#b3b8a9`、faction-warm `#c76844`、faction-cool `#54c9c0`、signal `#e1ba75`；支撑色 charcoal、steel、concrete-dark、fabric、signal-hot、sky、marker-white（命中标记本体 `#f4f1e8`）。角色比环境更饱和、明度对比更高；signal 只用于可交互/要害，不做装饰。

**材质族**：painted-concrete（roughness 0.95／metalness 0，仅混凝土贴图，128 px/m）；gunmetal（0.65／0.25，无贴图）；actor-cloth（0.9／0.05）；glove-fabric（0.9／0）；signal-paint（0.7／0.05，低自发光）；ui-marker（0.6／0，低自发光，命中标记）。六族的数值只在 `spec.json` 的 `materialFamilies` 定义一次，`build.mjs` 从该表创建材质、`validate.mjs` 逐件比对 GLB 的 `extras.family`／roughness／metalness；角色、武器和通路金属件都用线性顶点色，平面法线；不引入新的贴图族。

**着色与光照**：沿用 `src/render/scene.ts` 的半球光 `0xb9e7ff/0x32413b` 强度 2.1、方向光 `0xffdba8` 强度 2.6 位于 `(−8, 18, −4)`、雾 32–80m、天空 `#94afb7`、FOV 80，不新增后处理。标准件只在这些设置下判断；离线预览不算。

**加载预算**：整套 4 件 GLB 不超过 409,600B、12,000 三角形、0 新贴图字节；单件预算与实际：

| 件 | 预算 B／三角形／材质／draw | 实际 |
|---|---|---|
| fp-arms-rx24 | 204,800／6,000／2／5 | 169,816／3,006／2／5 |
| enemy-relay-guard | 81,920／2,000／1／6 | 37,068／515／1／5 |
| passage-cover | 61,440／1,500／3／3 | 56,120／768／3／3 |
| hit-feedback | 24,576／400／3／3 | 6,436／24／3／3 |
| 合计 | 409,600／12,000／0 新贴图 | 269,440／4,313／0 |

## 三、四件标准件

固定 SHA 为基线 `a97d57281dd6c6d941c6a6bef732dadf2953f2f4`；派生 GLB 的 SHA-256 与逐件来源、处理步骤在 [`content-set.json`](../asset-pipeline/content-set/content-set.json)。四件都是可解析的实际产物，不是素材清单。

动作适用性一览（“导出”指 GLB 内有节点 TRS 剪辑；“程序化”指运行时按既有状态重算；“契约”指阶段与轴心已写清但本件不烘焙；“不适用”指该件没有角色或该动作）：

| 件 | 待机 | 移动 | 射击／命中 | 受击 | 死亡 | 换弹 |
|---|---|---|---|---|---|---|
| fp-arms-rx24 | 导出 | 程序化 | 导出 | 不适用 | 不适用 | 弹匣/拉机柄剪辑＋整体程序化 |
| enemy-relay-guard | 导出 | 导出 `walk` | 导出 | 导出 | 导出 | 契约（缺独立弹匣节点） |
| passage-cover | 不适用（静态） | 不适用（静态） | 不适用（静态） | 不适用（静态） | 不适用（静态） | 不适用（静态） |
| hit-feedback | 不适用 | 不适用 | 命中 body／head／kill 导出 | 命中确认即本件 | 不适用 | 不适用 |

### 1. `fp-arms-rx24.glb` — 第一人称手臂＋武器组合

- 来源／许可：RX-24 来自 [Quaternius Ultimate Guns Pack](https://quaternius.com/packs/ultimategun.html)，CC0-1.0；手掌、手指、腕、袖和拉机柄是原创配方，CC0-1.0。不是无手臂的裸枪。
- 处理前后：源派生 JSON 的 24 个零件 → 静态机匣、弹匣两个节点；拉机柄是原创 bevelBox 节点；程序化手部 → support-hand／trigger-hand 两个节点。全件重定向到武器组局部空间，弹匣、拉机柄和手掌各有独立轴心，供运行时按既有换弹时钟平移。
- 实际：169,816B，3,006 三角形，2 材质（gunmetal／glove-fabric），5 draw，节点 `rx24-root／rifle-static／rifle-magazine／rifle-bolt／support-hand／trigger-hand／muzzle／grip`。
- 动作：idle、fire、reload-magazine、reload-bolt 剪辑；待机、移动、开火、换弹的适用性与 `src/render/weapon.ts` 的 kick／lower／magazine／bolt 阶段对齐。移动与整体换弹仍归运行时程序化，不用整枪倾斜冒充换弹。
- 材质契约：顶点色线性，平面法线；枪口锚点 `[0.000266, 0.002095, −0.777468]`，握点 `[−0.03443, −0.175014, −0.345572]`。

### 2. `enemy-relay-guard.glb` — 敌方全身角色

- 来源／许可：Casti_131 [Low Poly Soldier with weapons](https://opengameart.org/content/low-poly-soldier-with-weapons)，作者 2017-01-11 释为 CC0-1.0；源 ZIP 与 Blend 哈希见 `assets/characters/relay-guard/README.md`。
- 处理前后：515 面静态姿态 → 头、脊柱、左右腿、武器五个刚性组，轴心分别在颈、腰、左右髋和步枪重心；沿用 `targetColor` 的敌方暖色系，保留蓝面罩、深色布料、腰带和武器；按 `src/render/scene.ts` 的 `(x, y, −z)` 轴导出。脚底 y=0、feet centre actor 原点、高 1.765m。
- 实际：37,068B，515 三角形，1 材质，5 draw。
- 动作：idle、walk、fire、hit、death 五段节点 TRS 剪辑；适用项含待机、移动、射击、受击、死亡。换弹在 `contracts/enemy-relay-guard.actions.json` 标为 contract-only：机器人会换弹，但当前网格没有独立弹匣节点，因此不伪造整枪动作。
- 边界：刚性组不是蒙皮，肘膝和握枪手不形变；须在游戏光照下判断，不能据离线解析称完成。

### 3. `passage-cover.glb` — 可读的通路／掩体建筑

- 来源／许可：几何与排布为原创程序化配方 CC0-1.0；混凝土颜色槽复用已采用的 [Poly Haven Concrete Floor 01](https://polyhaven.com/a/concrete_floor_01)（CC0，Rob Tuytel），不嵌入、不重导出该贴图。
- 处理前后：无 → 由墙板、门洞、端墙、半墙、箱体五种模块组成的 12m 通路；两个门洞分别在 z=0 与 z=4；每件带踢脚、压顶、金属立柱/包边和 signal-hot 危险条，避免巨型素面方块。
- 实际：56,120B，768 三角形，3 材质（混凝土／金属／信号漆），3 draw；节点 `passage-cover-root`（根）与 `passage-cover`（网格）；尺寸、模块清单与 13 个碰撞盒写在 GLB scene extras（three.js 的 `gltf.scene.userData`），与 `contracts/passage-cover.actions.json` 同源，两个节点本身不带这份副本。
- 材质契约：UV 为米/2，直接绑定既有 2m 混凝土槽；无新贴图。碰撞盒 13 个，含两个门洞的侧墙与门楣、端墙、半墙和箱体。

### 4. `hit-feedback.glb` — 命中反馈标准件

- 来源／许可：原创几何与时间线 CC0-1.0；时间取自 `src/render/feedback.ts`（受击 180ms、倒下 600ms、结算保持 700ms）与 `src/ui/hud.ts`。
- 处理前后：无 → 四刻度身体标记、四刻度爆头/击杀强调环、独立低模冲击球；白色 body（marker-white）、signal 爆头、signal-hot 击杀、faction-cool 友军、miss 无标记。
- 实际：6,436B，24 三角形，3 材质，3 draw；hit-body／hit-head／hit-kill／impact 四段缩放剪辑。
- 声音契约：复用既有 `hit`／`head`／`kill` 合成 cue，不新增录音；友军不显示击杀强调。当前运行仍是 CSS 命中标记与球体冲击，标准件未接入。

## 四、归一、重跑与第二次修改

从仓库根运行。`build.mjs` 与 `validate.mjs` 只用 Node 内置模块，无浏览器、无 GPU、无网络；`node --test` 另需仓库已安装的 three 0.186.1，干净 checkout 先跑 `npm ci`：

```sh
node asset-pipeline/content-set/build.mjs
node asset-pipeline/content-set/build.mjs --check
node asset-pipeline/content-set/validate.mjs
node --test asset-pipeline/content-set/tests/content-set.test.mjs
node asset-pipeline/content-set/build.mjs --variant
```

- `build.mjs` 读取 `spec.json`、既有 CC0 派生 JSON、`guard.json` 和已采用的混凝土哈希，按同一套轴心、比例、调色板和压缩（浮点位置、int8 归一法线、uint8 归一顶点色）重导四件 GLB，并写出 `content-set.json`、`palette.json`、`palette.svg`。
- `--check` 在临时目录重建并逐件比对 SHA、字节和三角形；当前四件全部一致，重复构建确定。
- `validate.mjs` 与 15 项测试检查：GLB 块结构、节点可达与唯一、动画通道、访问器边界、无外部 URI、无本机绝对路径、来源哈希、动作契约、预算、调色板，以及每个 GLB 材质的 `extras.family`、roughness、metalness 与 `spec.json` 材质族一致、通路的 13 个碰撞盒与模块在 scene extras 可读。`extras.pivot` 是 three `GLTFLoader` 为 `GLTFExporter` 容器保留的键：带 children 的节点不得用该键，本套改记 `pivotM`／`fallPivot`；测试另用仓库锁定的 three 0.186.1 `GLTFLoader` 实际解析四件，断言加载后包围盒与 manifest 一致、敌方 `head` 仍在颈高，避免“原始 accessor 正确、加载后错位”。2026-10-27 实跑 15 项通过，`269,440B / 4,313 三角形 / 0 新贴图`。
- 第二次修改：`--variant` 按角色色调偏移同时换 warm／cool／concrete／signal 四族并整体缩放 0.95，四件全部重建，SHA 全部改变、三角形不变、边界严格乘 0.95（±0.002m）。构建时断言每条 translation 剪辑第 0 帧等于缩放后的节点静止 translation（弹匣、拉机柄、敌方脊柱），保证变体不会出现首帧跳回未缩放位置。报告在 `variant-report.json`。结论：整批可重跑；断点在角色/环境角色标色必须显式传 role，否则变体只缩放不改色。0.95 缩放会让米制机位尺寸失效，因此只作重跑验证，不采用为美术方向。
- 固定 SHA：基线 `a97d57281dd6c6d941c6a6bef732dadf2953f2f4`。四件 GLB 的 SHA-256：fp-arms-rx24 `5d8c4d4e4fdff9b7a095d7b1ce30cd41ae8709a74e810ffdd7f368c5e1a3f9fc`；enemy-relay-guard `1b39bd28bbb60328e27bff6ef4e03c79956afe9d443e640b66b78daf2c7df2cd`；passage-cover `367e552854e20f7e520cdc1595609e51b4b47edc2fa29e363faa42e36ef513d2`；hit-feedback `aa229568af46a911a52c1961cdda2de5573bacf8890af4c35889debe75e1162d`。来源哈希与处理步骤逐件在 `content-set.json`。

## 五、接线入口与剩余缺口

本单元只交标准件和契约，不改运行时代码。机器可读的入口见 [`wiring.json`](../asset-pipeline/content-set/wiring.json)；后续案例线接线位置：

- 第一人称：`src/render/rifle.ts`、`arm.ts`、`weapon.ts`、`scene.ts` 的 `makeWeapon`／`weaponPose`。加载 `fp-arms-rx24.glb` 后按 GLB scene extras（`gltf.scene.userData.restMount`）或 `wiring.json` 的 `restMount` 与 `weaponPose` 数值驱动；`rx24-root` 节点本身不带该字段（其 extras 只有 name），弹匣、拉机柄按 reload 阶段平移，手掌和袖子的程序化路径保留到有手骨为止。
- 敌方：`src/render/target.ts`、`scene.ts` 的 target 几何；保持 `src/sim` 命中体与伤害不变，用五个刚性组替换整块顶点，idle／walk／fire／hit／death 由动画状态机选择；死亡仍归表现层。
- 通路：`src/content/map.ts` 的 `walls` 与 `src/render/scene.ts`、`yard.ts`；从 GLB scene extras（`gltf.scene.userData`）读取 13 个碰撞盒并转成 `Box`，混凝土材质绑定既有 `ground.json` 颜色链。寻路需重新烘焙，不能从渲染几何现场生成。
- 命中：`src/render/feedback.ts`、`src/render/scene.ts` 的 impact、`src/ui/hud.ts` 的 hitmarker；命中标记按 kind 选 core/accent 与颜色，冲击球换成 GLB burst，声音仍走 `synth` 的 hit/head/kill。

缺口按优先级：

1. **阵容图／整局画面未拍**：没有接入本作光照的真 GPU 图，也没有与 CS2 的同机位对比；四件保持待接入，不能称品质定稿。
2. **敌方不是蒙皮**：动作是刚性组近似，步态、握枪和倒下剪影须在游戏机位复看；换弹没有独立弹匣节点。
3. **玩家换弹未资产化**：GLB 只提供弹匣/拉机柄/手节点，整体 lower 与袖子仍由运行时重算；手指仍刚性。
4. **通路未入局**：未放入 `map.ts`、未重烘焙寻路、未验证三条路线与掩体的实际对枪位。
5. **命中未接入**：现运行仍是 CSS 标记与球体；没有烟、曳光、弹孔贴花。
6. **材质与光照层级**：无 PBR 法线/AO、无 HDRI 和后处理；这是离写实标杆的主要差距，下一轮先补光照层，不继续加小件。
7. **人工项**：手感、声音遮挡与同帧、真人画面判断均未验证，应记入 a1dbv TASKS“待人工验收”。

## 六、来源与许可

| 来源 | 用途 | 许可 | 处理 |
|---|---|---|---|
| Quaternius, Ultimate Guns Pack | RX-24 步枪几何（不含原创拉机柄） | CC0-1.0，含商用 | 消费已评审的派生 JSON；节点分组与顶点色 |
| Casti_131, Low Poly Soldier with weapons | 敌方全身网格 | CC0-1.0 | 刚性组、暖色重映射、轴导出 |
| Rob Tuytel / Poly Haven, Concrete Floor 01 | 混凝土颜色槽 | CC0-1.0 | 只引用既有 2m 槽，不嵌入新图 |
| 本仓库原创配方 | 手/臂/袖、拉机柄、通路、命中标记、调色板 | CC0-1.0 | `build.mjs` 可重跑 |
| 本仓库合成音效 | 命中/枪声/换弹 cue | CC0-1.0 | 不新增录音 |

未使用 AI 生成资产、未使用付费素材或服务；Kenney Blaster Kit 的既有拒绝理由保留在 `assets/weapons/README.md`，本项不重复尝试。
