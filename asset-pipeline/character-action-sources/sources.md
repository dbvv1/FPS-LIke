# 训练赛完整枪械动作源候选清单

任务：B-FPS-RELOAD-SOURCE-20261104（找训练赛完整枪械动作源）。
基线：`36fde4bb6a2e8f9652528fdea648d0a90190db79` 的 relay-guard、content-set 与 buildEnemy/动作合同。
整理日期：2026-11-04。本文只整理上一阶段已核实并给出的候选与渠道记录，**不新增未核实链接**，不把搜索摘要、镜像页或视频里的“看起来像换弹”当成可编辑 clip。

## 0. 结论

**没有任何一项免费、可商用、可随公开游戏分发、且同时具备以下条件的成套来源：**

1. `idle / run / crouch / fire / reload / death` 六类第三人称动作；
2. 独立手臂、独立枪、独立弹匣节点与可读的退匣/入匣/闭锁；
3. 不改骨架权重、不手补动画即可接进当前 Three 0.186.1 与 60 Hz 固定步长模拟。

最值得继续深挖的是 **KayKit（Kay Lousberg）**：CC0、作者页原文为 133 个人形动作，只按类别列出 Crouching、单手/双手武器 reloading、death 等，没有逐条 clip 名；`2H_Ranged_Reload`、`Death_A/B`（Knight.glb）与 `Rig_Medium|Ranged_2H_Reload`、`Rig_Medium|Crouching`、`Rig_Medium|Running_HoldingRifle`（Med_*.glb，加载后需去掉或按后缀匹配 `Rig_Medium|` 前缀）等具名动作来自本卡实测（见 `CPU-PARSE.md`）。Adventurers 的官方角色 GLB 与 Character Animations 同属 Rig_Medium（Skeletons 同作者，rig 需另核），可作为“模型+骨架+动作同源”的组合。但它**没有枪和弹匣模型，也没有独立弹匣骨**；换弹是身体/手部动作，不是可拆的弹匣机构。

在 KayKit 之后，按覆盖度与可用性依次是：**Mesh2Motion**（动作最全、CC0，但源文件是 `.blend`，导出依赖浏览器 app，本卡不能直接产出）、**Quaternius Toon Shooter**（有枪、无 reload）、**Quaternius UAL1 + Universal Base Characters**（有手枪 reload、无步枪/枪模；65 关节 UE 骨架在免费导出中出现在 UAL2 Standard zip 内的 `Unreal-Godot/UAL2_Standard.glb`（43 clip/65 骨）、`Unity/UAL2_Standard.fbx`（65 骨）与 `Female Mannequin/Unreal-Godot/Mannequin_F.glb`（65 骨/0 clip/1 mesh；同目录 `Mannequin_F.fbx` 同为 UE 命名），以及 UAL1 的 `Unreal Engine/AL_Standard.fbx`（65 骨，含 `_end` 叶骨）；Cinevva 实测 Universal Base Characters 与 Modular 也是同一套 65 关节骨架（本卡未独立解析），所以零重定向组合是 UAL1 的 UE FBX + UBC；UAL1 的 Godot/Unity 导出是 53 关节 Rigify（52 个 `DEF-*` + `root`），不是 65，免费 Godot GLB 仍需重定向或先转 FBX）、**Quaternius Animated Guns**（只有武器侧 reload 与独立弹匣节点）。

**当前 rigid 合同不能承载任何一套全身动作。** `src/render/content-set-assets.ts` 的 `ContentOpponent` 只接受 `position/quaternion`、5 个固定节点（`head/spine/leg-l/leg-r/weapon`）、必需 clip 名 `idle/walk/fire/hit/death`，且 `hit/death` 必须 ≤700 ms。任何 skinned 人形动作源都需要新增 SkinnedMesh/AnimationMixer 消费路径。若 dot 不批准这条新路径，本卡只能做到武器侧换弹，无法满足 `docs/brief.md` 第 21 行“弹匣退出、装入、闭锁可读”。

## 1. 筛选口径

| 维度 | 入候选条件 | 本次怎么核 |
|---|---|---|
| 许可 | 免费、可商用、允许把派生资源随公开游戏提交；能读到作者原页或包内许可原文 | 作者页/仓库 LICENSE/包内 License.txt；区分 CC0、CC-BY、CC-BY-SA、NC/ND、GPL、EULA、自定义禁止再分发 |
| 动作 | `idle/run/crouch/fire/reload/death` 六类都有，且是真实 clip，不是视频或整枪位移 | 页面清单 + GLB/GLTF/FBX/ZIP 字节解析；搜索摘要不算 |
| 结构 | 全身骨架 + 手臂（蒙皮）+ 独立枪 + 独立弹匣节点 + 稳定握点 | 节点名、skin、mesh、clip 通道；没有独立弹匣骨就记为缺 |
| 接入 | 同 rig 或同名骨，不重刷权重、不手补动画，能接 Three 0.186.1 + 固定步长 | 对照 `src/render/content-set-assets.ts` 合同与现有 relay-guard 源 |
| 文件身份 | 固定文件（大小、SHA-256、版本）与逐 clip 清单 | 下载到临时目录或本卡 `sample/` 后解析 |
| 小样 | 最多一件最强候选的必要公开小样，≤10 MB，仅 CPU | 本卡 `sample/kaykit/` 共 5,088,516 B |

排除规则：需登录、付费、无重分发许可、权重/已有 403 的入口不尝试；镜像、二手转载、二次组装不等于作者原页授权；Mixamo 原始动作不可再分发；Fab/Unity/UE 商店许可不允许把原始素材作为独立文件随公开仓库提交。

## 2. 渠道覆盖表

“读到”指实际打开的页面、API 响应或文件；“入候选”指本文第 3 节列出的资产项；“读不到”按任务要求记录原因，不把失败当空结果。

| # | 渠道/来源族 | 实际看了什么、怎么取 | 读到并整理 | 读不到及原因 | 对本卡的结论 |
|---:|---|---|---|---|---|
| 1 | 目标仓文档与源码 | `docs/brief.md`、`docs/quality.md`、`assets/content-set/README.md`、`src/render/content-set-assets.ts`、`src/candidates/offline-training-v1/render/target.ts`；只读 | 确认缺口：第三人称 8 动作 0/8、第一人称 7 动作 0/7；rigid 合同只收 pos/quat + 5 节点 + 5 个 clip 名，hit/death ≤700 ms | 无 | 这是筛选与“最少改动”判断的基线，不是资产来源 |
| 2 | Quaternius 官方站 | `quaternius.com` 首页、Toon Shooter、UAL1、UAL2、Animated Guns、Ultimate Modular Men/Women、Ultimate Animated Character、Universal Base Characters、Cyberpunk、Easy Enemy、Zombie Apocalypse、Platformer、`license.html`、`animviewer.html`；curl 去标签；`index.pck` 8,559,696 B 离线解析 | 12 个资产族、约 20 个页面；UAL1/UAL2 全量 clip 名（含 Pistol_Reload、Crouch_Enter/Exit、Jog_*、Death02） | Google Drive 下载文件夹 TLS 失败（exit 35/52），官方 zip 成员与逐 clip 清单取不到；itch 页不可达 | 包页多标 CC0，但 2026-08-28 的 QAL v1.0 禁止把素材本身作为 asset pack/stock file 再分发，与包页冲突；所有 Quaternius 项先标“许可待澄清” |
| 3 | Quaternius OGA 作者上传 | `opengameart.org/content/universal-animation-library`、`universal-animation-library-2`、`low-poly-animated-guns`、`animated-characters-pack`；curl + 桌面 UA；zip 解析 | UAL1 Standard zip 14,541,205 B（包内 `Godot/AnimationLibrary_Godot_Standard.glb` 6,671,104 B、46 clip、53 关节＝52 个 `DEF-*` + `root`）；UAL2 Standard zip 10,257,419 B（包内 `Unreal-Godot/UAL2_Standard.glb` 8,061,600 B、43 clip、65 骨）；Animated Guns 1.1 MB（P90/Pistol/Rifle/Shotgun/Revolver 各有 Fire+Reload，Pistol 另有 Slide，Shotgun 另有 Reload_end）；Animated Characters Pack 52 角色 48.4 MB | 页面正文曾 403，改用 curl 后成功；UAL1/UAL2 包内成员已展开，其余单包未全部展开 | 这是 Quaternius 最稳的可下载入口；包内 `License.txt` 为 CC0 1.0，但仍需处理 QAL v1.0 冲突 |
| 4 | KayKit（作者站/OGA/GitHub/再导出） | `kaylousberg.com/game-assets/character-animations`、`characters-adventurers`、`characters-skeletons`；OGA `kaykit-character-animations`（v1.0/v1.2 旧归档，约 29 个动作，无 crouch/reload/持枪跑，不能作为这些 clip 的免费来源）；GitHub `KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0`、`sketchpunklabs/kaykit_char`、`NoLimitNexus/game-models`、`doctor-g/KayKitAnimationInGodot`；8 个 Med_*.glb + Knight.glb 解析 | 作者页原文 133 个人形动作（只按类别列 Crouching、单手/双手武器 reloading、death 等，无逐条 clip 名）、CC0、FBX/glTF、Rig_Medium/Large；Adventurers 官方 GLB 76 clip（含 T-Pose，即 README 的 75 个动作）、41 骨、15 mesh、handslot.l/r；8 个 Med_*.glb 共 131 个非 T-pose clip（本卡只保留 3 个），含实测具名 `Rig_Medium\|Crouching`、`Rig_Medium\|Running_HoldingRifle`、`Rig_Medium\|Ranged_2H_Reload`、`Rig_Medium\|Death_A/B`（加载后需去掉或按后缀匹配 `Rig_Medium\|` 前缀）（CPU-PARSE.md） | `kaylousberg.itch.io/kaykit-character-animations` curl 000/WebFetch Socket closed；免费档是否包含 CombatRanged 组、完整文件清单、版本号未核 | 本文最强候选；动作与角色同 rig，但无枪/弹匣，且当前 rigid 合同不能直接消费 |
| 5 | Kenney 官方/OGA | `kenney.nl/assets/blocky-characters`、`mini-characters`、`animated-characters-1/2/3`、`retro`、`survivors`、`protagonists`、`blaster-kit`；OGA `animated-characters`、`animated-characters-3`；3 个 zip 解析 | Blocky 18 个 GLB、每个 27 clip、8 节点、skins=0；Mini 10 动作；Animated 系列只有 idle/jump/run；Blaster Kit 40 件无动画枪械/弹匣 | `kenney.nl/download-link/<hex>` 直接请求返回 `{"error":"forbidden"}`；部分 3D 分类页 403；Animated Characters 3 的逐动作清单只能从 OGA 摘要确认 | CC0 但只有通用动作；没有 crouch/reload/aim，不能承担枪战；Blaster Kit 可当独立弹匣/枪械零件 |
| 6 | OpenGameArt 搜索与作者页 | 高级搜索 `field_art_type_tid[]=10`（3D Art 的 tid 是 10），keys 依次扫 rifle/soldier/reload/character animation/gun/weapon animation/fps/shooter/military/combat animation/pistol/magazine/crouch/aim/swat/terrorist/gun hands/weapon hands/ultimate modular/kenney/toon shooter/third person shooter/shooting animation/armed/rifle animations；读 ~20 个 content 页、6 个作者页 | R90、A5、P50、CoinCoin pistol/shotgun、Revolver、Webley、Various Small Arms、Low Poly M4A1、zisongbr arms、FireWarden pistol、Kingofthecrows FPS weapons、DevMops arms、Robin Lamb、para、NetSriK、Necrobot、knik1985 两名士兵、Casti_131、erik90mx 等 18 项 | WebFetch 对 OGA 部分页 403，已改 curl；`art-search-advanced` 的 keys 查询常只返回挑战页，改用 `/art-search?keys=`；Collections 未逐页展开；R90/A5/P50 文件区标 “File(s) currently unavailable due to potential licensing issues” | OGA 是“武器侧换弹”和“手臂/弹匣零件”的主要来源，但没有一套完整第三人称角色动作；CuiGames 三包当前不可下载 |
| 7 | Sketchfab 公共 API | `api.sketchfab.com/v3` 的 search/models/users、`/v3/comments?model=`；查 ccrash、DuqueCD7、BarcodeGames、1Matzh、jayb3e、MissingTray1151、alienkatgames、bamenwo05、bumstrum、TheParaziT、Drillimpact 等作者；30+ 模型 | 约 20 个 CC-BY 第一人称武器/手臂包、8 个全身士兵/战术角色包；Modern Army Soldier 23 clip（站/蹲/卧的 Idle/Walk/Run/Shoot/Reload/Death 与过渡）；Cransh 系列每包 4–9 clip；DuqueCD7 AK/Pistol/Saps 各 10–11 clip；Barcode M4 5 clip（Draw/Fire/Reload/Reload Empty/Holster） | 网页正文是 JS 壳，WebFetch 返回空；`/v3/models/{uid}/download` 匿名 401（需登录），按任务未尝试下载；评论区仅部分可读 | 许可多为 CC-BY 且可下载，但需登录；不能作为本卡的“可随公开仓库提交”来源；只作逐 clip 名与动作结构参照 |
| 8 | Poly Pizza | `poly.pizza` 搜索与模型页、Toon Shooter bundle、Quaternius base、J-Toastie Glock/AKM/Rigged arms；curl 直下 GLB 并用 Python 解析 | Toon Shooter Character Enemy 1,552,600 B/34 个动画对象（17 个语义动作，均带 `CharacterArmature\|` 前缀重复项），Soldier 1,333,700 B/14 clip；Animated Pistol 153,956 B（Fire/Reload/Slide + Magazine/Slide/Trigger/Muzzle 节点）；Quaternius Animated Base Character 45 clip；J-Toastie Glock/AKM 各含 Magazine/Slide/Trigger/Bolt 独立节点与 Reload | 模型页为 JS 渲染，逐模型动画名多数读不到；bundle 页只给 73 models/17 animations；Toon Shooter bundle 与 Character Enemy 页均标 CC0，与官方一致（CC-BY 标签另见 Animated Pistol / Animated Base Character） | 无登录取单模型的实用入口；适合做武器/手臂小样，但授权应回到作者原页 |
| 9 | GitHub（raw/API/HTML） | `raw.githubusercontent.com` 与 `api.github.com`；读 FireGun、NoLimitNexus/game-models、cktang88/3d-fps、sketchpunklabs/kaykit_char、Mesh2Motion/mesh2motion-app + mesh2motion-assets、Microsoft-Rocketbox、Operation Steel Tide、IRONLINE docs、KayKit 官方 Adventurers、GDQuest、FPS-Arms-3D 等 15+ 仓库 | FireGun soldier_tactical_animated.glb 8.97 MB/65 骨/43 clip/12 mesh；NoLimitNexus 139 clip/132 distinct；Mesh2Motion 66 骨、rifle/pistol reload/crouch/sprint/death；Rocketbox 115 角色/417 动画；KayKit 官方角色仓库 | GitHub REST API 未认证额度 403（本机出口 IP），改用 HTML/raw；部分仓库目录只能用树 API | GitHub 是核许可、核 clip 名与找二次组装件的核心渠道；二次组装不等于作者原页 |
| 10 | itch.io | kaylousberg、quaternius、cuigames、drillimpact、rancidmilk、bintoon、kevdev 等发布页与合集 | 0 个可直读页面 | 全站 curl TLS handshake/证书主机名不匹配（schannel，证书指向 facebook/kadastr38 等），WebFetch Socket closed；未登录、未绕过 | KayKit/Quaternius/CuiGames/RancidMilk 的 itch 原页与下载成员均未核；只能靠作者站、OGA、GitHub 替代 |
| 11 | Google Drive | Quaternius 各 pack 的 `drive.google.com/drive/folders/...` | 0 | curl exit 35/52、WebFetch Socket closed；embeddedfolderview 不返回列表；未登录 | Quaternius 官方 zip 成员、Animated Guns 6 把枪的逐 clip 文件名未核 |
| 12 | Fab | Tactical FPS Animation Pack、First Person Animations Starter Pack、Infima Modern Guns Pack、Epic Animation Starter Pack 等 5 个 listing | 仅搜索/服务端渲染摘要 | 两个给定 listing 与 BarcodeGames seller 页 HTTP 403、需 Epic 登录；价格/动作/许可未核 | 付费/商店许可，按任务排除；Tactical FPS Animation Pack 是功能最贴近的对照物 |
| 13 | Unity Asset Store | CombatGirls_RifleCharacterPack、FPS Animation Ultimate、FPS Animation Pro | 价格与动作类别摘要 | 付费 + Unity EULA，不允许把原始素材随公开仓库提交；未购买、未登录 | 排除；CombatGirls 39 个 Humanoid 动作是“完整 FPS 动作集”的标尺 |
| 14 | Unreal/Epic 文档与商城 | UE Animation Starter Pack、Animation Layers、Lyra、Fab 免费包 | 动画层/加法层与 FPS/TPS 骨架差异的官方说明 | `unrealengine.com/marketplace/...` 403；Fab 需登录；UE 内容许可通常限 UE | 只作方法与反例；不作为 Three 资产源 |
| 15 | Mixamo/Adobe | `mixamo.com`、`helpx.adobe.com` Mixamo FAQ、Adobe Community 两帖 | 页面标题/搜索摘要 | mixamo.com 只返回 JS 壳；FAQ/社区 curl 000、WebFetch socket closed；需 Adobe 登录 | 排除：登录型、原始动画不可再分发；只能作为最后的登录型 fallback 讨论 |
| 16 | 中文社区 | 掘金（UniMate、切武器）、知乎、B 站（BV1EvhK6aE7s/BV17Lnj6fE3F/BV1U9RZYWEX7）、微信公众号、少数派、即刻、小红书、indienova、CSDN、博客园、CGJOY、今日头条、什么值得买、腾讯云、vfxcg、爱给网、budeco | 8 篇可读：掘金 2 篇、博客园 1、CGJOY 1、腾讯云 1、vfxcg 1、smzdm 1、B 站 1（仅 API）；多为方法/二手介绍 | 知乎 403、B 站 412、公众号验证页、CSDN 空正文、indienova 403、小红书只有摘要、linux.do/头条反爬；WebSearch 200/200 用尽 | 没有找到可引用的新原始素材页；中文推荐多回指 Quaternius/CMU/CombatGirls，后者是付费或未授权转载 |
| 17 | 论坛/issue | three.js Discourse 5 帖 + issue #25288/PR #25589；Godot 论坛 1 帖；Unreal 论坛 5 帖；Blender Artists 2 帖；Unity Discussions 1 帖 | 约 14 条方法/失败记录 | 部分帖子需登录或只读到摘要；没有可直接下载的成套资产 | 关键结论：SkeletonUtils/retargetClip 对同名骨架仍会脚内翻/手反向/少一帧；优先同 rig 成套，不指望运行时重定向 |
| 18 | Hacker News | `hn.algolia.com/api/v1/items/42671472`、`45693325` | 2 条完整评论树 | 网页 WebFetch 报 Socket closed；API 可读 | Kenney/Quaternius 被列为 CC0 3D 首选；Mesh2Motion 的动作库来自 Quaternius，说明“新工具”多是同一库的再包装 |
| 19 | WebSearch | 中英文约 200 组关键词：Quaternius UAL rifle reload、KayKit reload、Kenney animations、OpenGameArt reload、Mixamo alternative、免费商用 角色动画 换弹 CC0、2026 新包等 | 提供线索，不直接入候选 | 本会话额度 200/200 用尽；部分后续检索改用站点搜索/API/直链 | 搜索预算耗尽后仍以作者页、OGA、GitHub、Sketchfab API 覆盖；未再扩新关键词 |
| 20 | 动捕/数据 | Microsoft Rocketbox、100STYLE（Ian Mason/Zenodo）、CMU Motion Capture、LAFAN1/ZeroEGGS/Motorica/InterAct、RancidMilk（80.lv/indienova）、BONES-SEED | 6 个数据族；Rocketbox 417 动画、100STYLE 100 风格/16.2 GB、CMU 原始 BVH、RancidMilk 2000+ | Zenodo 403（改用作者页）；Gumroad 000；CMU 原始页可读；LAFAN1 等明确 NC/ND | 只能补 locomotion/蹲行/起停，全部无枪/换弹；需重定向与署名，不能单独承担换弹 |
| 21 | 工具/聚合/市场 | Mesh2Motion、ActionForge、Cinevva、AssetFurnace、UniRig、Kimodo、Drawcall Market、3d.shep.bot、Gobkit、Godot Asset Library、Poly Pizza bundle | 10+ 工具/市场；Drawcall 263 个 UAL 单 clip；Cinevva 260 CC0 动作；Gobkit ~300 角色；3d.shep.bot 索引 | 多数工具只能在浏览器运行（Mesh2Motion、ActionForge、Cinevva），本卡不能开浏览器；Kimodo/UniRig/AssetFurnace 需 GPU/CUDA，且不提供现成 clip；SkillsMP/opensmartroute 404/403 | 没有新的可直接取用成套源；Drawcall 的 UAL 单 clip 可用于核清单，但仍是第三方再分发 |
| 22 | 二手转载/镜像 | cgais、budeco、B 站 CombatGirls“免费分享”、爱给网、腾讯云/vfxcg/smzdm 等 | 5 个镜像/转载页 | cgais 自述“仅供学习、勿商用”；budeco 自述“禁止商业使用”；B 站分享是付费资源未授权转载；爱给网未标许可 | 全部只作反面证据，不列为候选 |
| 23 | 不可达域名 | SkillsMP、opensmartroute、three.ws、gameassetsgarden、truebones、web.archive.org、r.jina.ai、grep.app、Reddit、Lobsters 搜索、Gachoki、Steam 新闻、知乎/B 站 API 等 | 0 | 403/404/DNS 策略/Anubis/429/TLS 失败，原因逐项见任务记录的“读不到的渠道” | 不把不可达当“没有”；保留缺口与失败原因 |

**渠道计数（去重后）**：资产候选约 90 项（T0 5 + T1 约 40 + T2 约 12 + T4 约 33），方法/工具/论坛参照约 50 项；其中真正同时满足“六动作 + 枪 + 弹匣 + 可零改接入”的是 0 项。

## 3. 排序总览

排序按四个条件加权：许可可随公开游戏提交 > 六类动作覆盖 > 独立手臂/枪/弹匣结构 > 不重刷权重/不手补动画的接入成本。

### T0 · 最值得深挖（5 项）

| 排名 | 候选（原始链接） | 许可 | 实际动作/结构 | 缺什么 | 为什么排这里 |
|---:|---|---|---|---|---|
| T0-1 | **KayKit Character Animations**：作者页 <https://kaylousberg.com/game-assets/character-animations>；OGA <https://opengameart.org/content/kaykit-character-animations>（v1.0/v1.2 旧归档，约 29 个动作，无 crouch/reload/持枪跑，不能作为这些 clip 的免费来源）；Adventurers GitHub <https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0>；再导出 <https://github.com/sketchpunklabs/kaykit_char> | CC0 1.0，作者页/仓库 LICENSE 明写可商用、无需署名 | 作者页原文 133 个全身人形动作，按类别写 Crouching、单手/双手武器 reloading、death，没有逐条 clip 名；具名 clip 来自实测：Adventurers `Knight.glb` 76 clip（含 T-Pose，即 README 的 75 个动作）、41 骨、15 mesh、handslot.l/r；Med_* 补 `Rig_Medium\|Crouching`、`Rig_Medium\|Running_HoldingRifle`、`Rig_Medium\|Ranged_2H_Reload`（加载后需去掉或按后缀匹配前缀，见 CPU-PARSE.md） | 无枪 mesh、无独立弹匣骨/弹匣 clip、无手指骨；Adventurers 包本身无 crouch；免费档成员未在 itch 核 | 唯一在作者页类别级清单 + 本卡实测文件里覆盖“全身 + 双手武器换弹 + 蹲 + 持枪跑 + 死亡”的 CC0 来源；同作者角色与动作同 rig，最接近“模型+骨架+动作同源” |
| T0-2 | **Mesh2Motion**：<https://mesh2motion.org/>；app <https://github.com/Mesh2Motion/mesh2motion-app>；assets <https://github.com/Mesh2Motion/mesh2motion-assets> | 代码 MIT；美术 `LICENSE-CC0.MD` 明确覆盖 `models/blend/rigs/animations`，CC0 1.0 | 170+ CC0 动作；66 关节 UE 命名人形；`rigs/human/combat/ranged/animation-human-rifle-reload.blend`、`pistol-reload`、`rifle-fire`、`crouch-idle`、`crouch-walk`、`sprint`、`death-a~d`；mannequin 自带蒙皮 | 源库是 `.blend`，导出依赖浏览器 app（本卡禁止）；无枪/弹匣 mesh（Pistol 只有单节点）、无独立弹匣骨；不是风格化成套角色 | 动作覆盖最全、许可最干净，但“最后一公里”必须开浏览器或 Blender；若 dot 允许离线导出，它可能比 KayKit 更完整 |
| T0-3 | **Quaternius Toon Shooter Game Kit**：<https://quaternius.com/packs/toonshootergamekit.html>；Poly Pizza bundle <https://poly.pizza/bundle/Toon-Shooter-Game-Kit-qraiSXoAru> | 官方页与 Poly Pizza bundle / Character Enemy 页均标 CC0，两者一致 | 74 模型；Character Enemy GLB 1,552,600 B，34 个动画对象 / 17 个语义动作（每个语义动作另有一条带 `CharacterArmature\|` 前缀的重复项）：`Idle/Walk/Run/Run_Gun/Run_Shoot/Walk_Shoot/Idle_Shoot/Duck/Death/HitReact/Jump/Jump_Idle/Jump_Land/Punch/Wave/Yes/No`；Soldier GLB 1,333,700 B/14 clip；2 个 skinned mesh（`Character_Enemy` 身体 + `Character_Enemy_Head` 头）+ 14 个刚性武器 mesh，武器均挂在 `Index1.R` 下 | 无 reload、无独立弹匣/枪机；官方 Google Drive 不可达，未核官方 zip；QAL v1.0 冲突 | 唯一“跑/蹲/射/死 + 枪已经握在手里 + 独立枪”的 CC0 成套角色；补 reload 仍缺身体动作，不能靠武器侧 clip 自动生成 |
| T0-4 | **Quaternius UAL1 Standard + Universal Base Characters**：<https://quaternius.com/packs/universalanimationlibrary.html>；OGA <https://opengameart.org/content/universal-animation-library>；<https://quaternius.com/packs/universalbasecharacters.html> | 包页标 CC0；OGA zip 内 `License.txt` 为 CC0 1.0；站点 QAL v1.0 禁止再分发，冲突 | UAL1 Standard zip 14,541,205 B；包内 `Godot/AnimationLibrary_Godot_Standard.glb` 6,671,104 B、46 clip、53 个关节（52 个 `DEF-*` + `root`）：`Crouch_Idle_Loop`、`Crouch_Fwd_Loop`、`Jog_Fwd_Loop`、`Sprint_Loop`、`Walk_Loop`、`Death01`、`Hit_Chest/Head`、`Pistol_Aim_*`、`Pistol_Idle_Loop`、`Pistol_Reload`、`Pistol_Shoot`；65 关节 UE 骨架在免费导出中出现在 UAL2 Standard zip（10,257,419 B）内的 `Unreal-Godot/UAL2_Standard.glb`（8,061,600 B，43 clip/65 骨）、`Unity/UAL2_Standard.fbx`（24,371,692 B，65 骨，含动画 take）与 `Female Mannequin/Unreal-Godot/Mannequin_F.glb`（1,442,824 B，65 骨/0 clip/1 mesh；同目录 `Mannequin_F.fbx` 575,100 B 同为 UE 命名），以及 UAL1 的 `Unreal Engine/AL_Standard.fbx`（65 骨，pelvis/spine_01/upperarm_l 命名，含 `_end` 叶骨）；Cinevva 实测 Universal Base Characters 与 Modular 也是同一套 65 关节骨架（本卡未独立解析），零重定向组合是 UAL1 的 UE FBX + UBC | 没有步枪 reload、没有枪/弹匣模型；免费 Standard 只有手枪动作；Pro/Source 付费；风格是现代基础人形，不是战术角色 | “同 65 骨零重定向”只对 UE FBX / UAL2 GLB 与 UBC/Modular 这条路线成立；免费 UAL1 Godot GLB 是 53 关节 Rigify（52 个 `DEF-*` + `root`）、Unity 导出同样不是 65 关节，套 65 关节角色仍需重定向或先转 FBX，不能视为零改动身体层；核心缺口“步枪 reload”没有 |
| T0-5 | **Quaternius Animated Guns Pack**：<https://quaternius.com/packs/animatedguns.html>；OGA <https://opengameart.org/content/low-poly-animated-guns> | 官方页标 CC0；OGA 1.1 MB 包；QAL 冲突 | 6 把枪（P90、左轮、手枪、霰弹枪、步枪、狙击）；Poly Pizza Animated Pistol 153,956 B 实测 `Fire/Reload/Slide` 3 clip，`Magazine/Slide/Trigger/Muzzle` 为独立节点；OGA FBX 有 `P90Armature\|Reload`、`RifleArmature\|FireWBullet/FireWOBullet`、`Shotgun\|Reload_end` | 没有手臂、身体、握持或角色动作；只有武器侧 | 补“弹匣退出/装入/闭锁”的可读武器层；不能单独承担角色换弹，必须与身体 reload 对齐 |

### T1 · 可组合或部分覆盖（身体、手臂、武器零件）

T1 内部大致按“身体动作覆盖 → 第一人称手臂+枪 → 武器/零件 → 有限动作/网格”排序；它们是可组合件，不是完整解。

| # | 候选（原始链接） | 许可 | 实测/页面动作与结构 | 缺口/结论 |
|---:|---|---|---|---|
| T1-1 | **FireGun**（Xinba210 二次组装）<https://github.com/Xinba210/FireGun> | 仓库 README/许可指向 Quaternius/KayKit CC0；二次组装 | `soldier_tactical_animated.glb` 8.97 MB/65 骨/43 clip/12 mesh；含 `Pistol_Reload`、`Crouch_Idle/Fwd`、`Jog/Sprint/Walk`、`Idle`、`Death01`、`Hit_Chest/Head`；独立 Arms mesh、刚性步枪 mesh、`hand_r` 武器绑定 | 无步枪 reload、无独立弹匣；来自第三方组装而非作者原页；只能当“战术士兵现成 GLB”参照 |
| T1-2 | **Quaternius Ultimate Modular Men** <https://quaternius.com/packs/ultimatemodularcharacters.html> | 包页 CC0；QAL 冲突 | 11 角色 × 4 可换部件；每个 glTF 24 clip；二手记录含 `Idle_Gun`、`Idle_Gun_Pointing`、`Idle_Gun_Shoot`、`Gun_Shoot`、`Run_Shoot`、`Run_Back/Left/Right`、`Death`、`HitRecieve` | 无 crouch、无 reload、无独立弹匣；官方 Drive 不可达，24 动作未由本卡直接复核 |
| T1-3 | **Quaternius Ultimate Modular Women** <https://quaternius.com/packs/ultimatemodularwomen.html> | 包页 CC0；QAL 冲突 | 10 个模块化女性角色、24 个动画、humanoid rig | 与 Men 同族，补女性敌人/同骨架；无枪/换弹 |
| T1-4 | **Quaternius UAL2 Standard** <https://quaternius.com/packs/universalanimationlibrary2.html>；OGA <https://opengameart.org/content/universal-animation-library-2> | CC0（OGA zip 10,257,419 B；包内 `Unreal-Godot/UAL2_Standard.glb` 8,061,600 B） | 43 clip，全是近战/跑酷/农活/僵尸（`Sword_*`、`Shield_*`、`Farm_*`、`Zombie_*`；免费 Standard 的 43 clip 不含钓鱼，钓鱼在官方 130+ 全量包/付费 Source 里）；65 骨 + mannequin | 没有任何枪械/瞄准/reload；证明续作补不了本卡缺口 |
| T1-5 | **Quaternius Platformer Game Kit** <https://quaternius.com/packs/ultimateplatformer.html> | 包页 CC0；QAL 冲突 | 112 模型；第三方 GLB 镜像 `Character_Gun` 含 `Duck/Idle_Gun/Walk_Gun/Run_Gun/Run_Shoot/Death` | 有蹲行+持枪移动+死亡，但无 reload、无弹匣；第三人称 |
| T1-6 | **Quaternius Cyberpunk Game Kit** <https://quaternius.com/packs/cyberpunkgamekit.html> | 包页 CC0；QAL 冲突 | 71 模型，含动画角色、敌人、炮塔；页面未列逐 clip | 题材较接近现代，但是否有枪械装填未核 |
| T1-7 | **Quaternius Zombie Apocalypse Kit** <https://quaternius.com/packs/zombieapocalypsekit.html> | 包页 CC0；QAL 冲突 | 60 模型，4 可玩 + 4 敌人，每角色约 20 动作并含枪械 | 最可能补跑/蹲/射击；Drive 不可达，动作名未核；QAL 冲突 |
| T1-8 | **Quaternius Ultimate Animated Character Pack** <https://quaternius.com/packs/ultimatedanimatedcharacter.html> | 包页 CC0；QAL 冲突 | 52 模型、50+ 角色；二手清单称 17 动作含 `Shoot_OneHanded`、`Run/Walk/Death/Roll/PickUp` | 无 crouch/reload、无枪/弹匣；Drive 不可达 |
| T1-9 | **Quaternius Animated Characters Pack** <https://opengameart.org/content/animated-characters-pack> | CC0 | 52 个已绑定动画角色，48.4 MB；通用 idle/walk/run/jump/attack/death | 超小样上限；无换弹；适合身体来源 |
| T1-10 | **Quaternius Easy Enemy** <https://quaternius.com/packs/easyenemy.html> | 包页 CC0；QAL 冲突 | 5 个带动画敌人，FBX/OBJ/Blend | 未提枪械/换弹；只作姿态备选 |
| T1-11 | **Quaternius Animated Base Character（Poly Pizza）** <https://poly.pizza/m/cwYvO5UauX> | 页面标 CC-BY 3.0（与官方 CC0 不一致） | 2.2 MB GLB，45 clip：`Crouch_Fwd/Idle_Loop`、`Jog/Sprint`、`Pistol_Aim/Idle/Reload/Shoot`、`Hit/Death` | 与 UAL1 同源的现成 GLB；多一层署名要求；无步枪/枪模 |
| T1-12 | **Kenney Blocky Characters 2.0** <https://kenney.nl/assets/blocky-characters> | CC0 | 18 个 GLB，每个 27 clip：idle/walk/sprint/die/pick-up/holding-*/shoot/attack-melee/kick/interact/wheelchair；8 节点、skins=0、刚体部件动画 | 无 crouch/reload/aim、无手指/前臂/弹匣；不满足换弹可读 |
| T1-13 | **Kenney Mini Characters** <https://kenney.nl/assets/mini-characters> | CC0 | 每个角色 static/idle/walk/sprint/jump/fall/crouch/sit/drive/die 共 10 动作 | 有 crouch 但无开火/换弹/枪 |
| T1-14 | **Kenney Animated Characters 1/2/3/Retro/Survivors/Protagonists**：<https://opengameart.org/content/animated-characters>、<https://opengameart.org/content/animated-characters-3>、<https://kenney.nl/assets/animated-characters-retro>、<https://kenney.nl/assets/animated-characters-survivors>、<https://kenney.nl/assets/animated-characters-protagonists> | CC0 | 只有 idle/jump/run（OGA 作者上传页明确写 3 个动作） | 连射击/死亡都没有；不能当枪战动作源 |
| T1-15 | **Kenney Blaster Kit** <https://kenney.nl/assets/blaster-kit> | CC0 | 40 件低模枪械、弹匣、子弹、箱子 | 全无动画/角色/换弹 clip；只能当零件库 |
| T1-16 | **CoinCoin `[Animated] Pistol`** <https://opengameart.org/content/animated-pistol> | CC-BY 4.0 | FBX 第一人称手臂+手枪；实测 18 clip：`Pistol_IDLE/WALK/RUN/JUMP/FIRE/FIRE_EMPTY/RELOAD` 等；骨骼 `Shoulder/UpperArm/LowerArm/Hand`、`Pistol_Bone`、slide | 无 crouch/death、无独立弹匣；FBX 需离线转 glTF；第一人称 |
| T1-17 | **CoinCoin `[Animated] Shotgun`** <https://opengameart.org/content/animated-shotgun> | CC-BY 4.0 | FBX 手臂+Winchester 1887；`Fusil_IDLE/WALK/RUN/JUMP/FIRE/RELOAD`、`Shotgun_Bone` | 无 crouch/death、无独立弹匣；FBX |
| T1-18 | **Revolver Game Asset（loafbrr_1）** <https://opengameart.org/content/revolver-game-asset> | CC0 | glTF 左轮 6 clip：`Reload/OpenCylinder/CloseCylinder/CylinderSpeen/Shoot/Default`；骨骼含 `Hammer/Trigger/ReloadingHinge/Cylinder` 与独立子弹 | 无手臂/角色动作；武器侧机械换弹 |
| T1-19 | **Webley Mark II Revolver（ulf）** <https://opengameart.org/content/webley-mark-ii-revolver> | CC-BY 3.0 | 全绑定左轮，逐发击发/弹巢旋转/折开换弹；独立弹药与空位标记 | 无手臂/locomotion；机械换弹参考 |
| T1-20 | **Various Small Arms（Tabasco）** <https://opengameart.org/content/various-small-arms-assault-rifles-sniper-pistol> | CC0 | 7 把枪（AK/M4/SVD/G3/L85/Mosin/M1911），多数枪机/滑套可动、部件分离 | 无角色、无完整 reload 动作；零件源 |
| T1-21 | **Low Poly M4A1** <https://opengameart.org/content/low-poly-m4a1> | CC0 | .blend/FBX/贴图；作者明确把弹匣拆开供引擎内换弹动画 | 只有模型没有 clip；配合外部动画 |
| T1-22 | **Low Poly Weapons Pack with Rigged Arms（zisongbr）** <https://opengameart.org/content/low-poly-weapons-pack-with-rigged-arms> | CC0 | 1 步枪 + 1 手枪 + 已绑定手臂；弹匣/枪管/瞄具/握把独立对象 | blend 内无动作 clip；需外部动画驱动 |
| T1-23 | **Lowpoly Pistol（FireWarden）** <https://opengameart.org/content/lowpoly-pistol> | CC0 | 弹匣（满/空）、套筒、击锤、扳机、枪管独立对象；FBX+blend | 无动画；补可拆弹匣 |
| T1-24 | **FPS Weapons（Kingofthecrows）** <https://opengameart.org/content/fps-weapons> | CC-BY-SA 3.0 | blend 内有手臂 Armature 和 M4/M9/SCAR/USP 分离弹匣 | 无动作 clip；SA 许可需评估 |
| T1-25 | **Low Poly Arms Rigged（DevMops）** <https://opengameart.org/content/low-poly-arms-rigged> | CC0 | Rigify 手臂，FBX+blend | 无动画；需自行绑定/重定向 |
| T1-26 | **Low Poly FPS Rifle and Hands（Robin Lamb）** <https://opengameart.org/content/low-poly-fps-rifle-and-hands> | CC0 | 162,255 B zip 内 rifle.glb 只有 1 个 `fire` clip；骨骼 `Bone/Gun/Hand1/Hand2` | 无 reload/跑/蹲/死；不是第三人称全身 |
| T1-27 | **fps arms (rigged only)（para）** <https://opengameart.org/content/fps-arms-rigged-only> | CC0 | MakeHuman 改的第一人称手臂 rig（IK + handle 骨、手指约束）；只有作者自称作“很粗糙”的示例动画 | 无可用的成套 clip；只是手臂 |
| T1-28 | **Low Poly FPS Arms Pack（NetSriK）** <https://opengameart.org/content/low-poly-fps-arms-pack> | CC-BY 4.0 | 5 套手臂+武器与 14 把枪的静态模型；作者明写 “Not Animated Yet” | 无任何动作 clip |
| T1-29 | **J-Toastie Fps Rig（Glock 19 / AKM）**：<https://poly.pizza/m/uxko5LkGia>、<https://poly.pizza/m/U6l6wjxFhC>、手臂 <https://poly.pizza/m/XdHWM8uSAO> | CC-BY 3.0 | Glock GLB 约 0.7 MB：`ArmModel + Glock19`，`Magazine/Slide/Trigger/Barrel/SlideCatch` 独立节点，clip `Grip/Idle/Reload/Shoot`；AKM GLB 约 0.87 MB：`Magazine/Trigger/Bolt` 独立，clip `Idle/Reload/Shoot` | 第一人称手臂+枪；无 crouch/death/全身；无第三人称 |
| T1-30 | **NoLimitNexus/game-models** <https://github.com/NoLimitNexus/game-models> | CC0（KayKit 内容） | 139 clip/132 distinct，骨架/动作来自 KayKit；19 个可换部件与 5 个工具，web-ready GLB | 无 FPS 枪械换弹；只作 Three 侧 GLB/骨架参考 |
| T1-31 | **KayKit Adventurers / Skeletons 官方包**：<https://kaylousberg.com/game-assets/characters-adventurers>、<https://kaylousberg.com/game-assets/characters-skeletons> | CC0 | Adventurers 4(+2) 个 fully rigged/animated 角色、75 动画、25+ 配件；Skeletons 90+ 动画含远程瞄准/射击/装填与死亡 | 奇幻风格、无现代枪/弹匣；Skeletons 是弩箭语义 |
| T1-32 | **Casti_131 Low Poly Soldier with weapons** <https://opengameart.org/content/low-poly-soldier-with-weapons> | CC0 | 带枪低模士兵；当前 relay-guard 的源；作者页只写模型、未列动画 | 现用源；不能提供 run/crouch/reload 动作 |
| T1-33 | **Low Poly Modern Soldier (rigged)（erik90mx）** <https://opengameart.org/content/low-poly-modern-soldier-rigged> | CC0 | 1.5 MB `soldier.zip` 只是 rigged mesh；作者页未列动画 | 可绑定身体，不是动作源 |
| T1-34 | **Gobkit freebies** <https://gobkit.com/freebies> | CC0 | 约 300 个绑定动画低模 glb；内嵌 clip 基本只有 idle/attack/dead，偶尔 walk | 无开火/换弹/蹲行；基础姿态/death 来源 |
| T1-35 | **Quaternius_IK_Rigged（Godot Asset Library 5235）** <https://godotengine.org/asset-library/asset/5235> | CC0 | Godot 4.6+ addon，把 UAL1 打包成 IK 绑定人形（含重定向 profile、手脚 two-bone IK） | Godot 专用、无 rifle clip；IK 设置可参考 |
| T1-36 | **Character: US soldier（knik1985）** <https://opengameart.org/content/character-us-soldier> | CC-BY 3.0 | Blender 角色只有 Idle/Run/Jump/Crawl/Push | 无射击/换弹/死亡 |
| T1-37 | **Character: German soldier（knik1985）** <https://opengameart.org/content/character-german-soldier> | CC-BY 3.0 | 只有 Idle/Patrol/Aiming | 无射击/换弹/死亡/蹲行 |
| T1-38 | **FPS Character Necrobot（Trym Horgen / rohit_n）** <https://opengameart.org/content/fps-character-necrobot> | CC-BY-SA 4.0 | 9,646,604 B 的 Blender 2.79 .blend，ASCII 可见 `IdleAnimation/TakeAim/RunTest1/EnterRun/RunSkidStop/Flinch1/2/RapidFire/ACDeath1/ACMeleeGunHit` | 无 crouch/reload；评论区质疑动作完整性；只有 .blend，需导出；SA 许可更重 |
| T1-39 | **BlutRot's Assets（ZweiHander）** <https://opengameart.org/content/blutrots-assets> | CC0 | 9.8 MB 取消的 FPS 项目资产：`alisse_viewmodel/alisse/ww1grunt` 与手枪/霰弹枪；动作有 idle/walk/fire/pump | 缺 reload/crouch/death；第一人称 |
| T1-40 | **Lightning Pump Action Rifle（LonesomeDucky）** <https://opengameart.org/content/lightning-pump-action-rifle> | CC0 | 泵动步枪，含 skinning 与泵动/扳机基础动画、glb+blend | 无手臂、无完整 reload |
| T1-41 | **Plasma Gun（Viktor Hahn）** <https://opengameart.org/content/plasma-gun-0> | CC-BY 4.0 | 作者自述含复杂 reload 动画；blend + IQM | 无手臂/角色；需转换 |
| T1-42 | **Steampunk Quad Shotgun（johndh）** <https://opengameart.org/content/steampunk-quad-shotgun> | CC-BY-SA 3.0/GPL | blend 内有 break-open、lever、trigger、ammo 骨骼与 cartridge | 未给完整 clip 清单；需实开 Blender 核 |
| T1-43 | **P50 Heavy Pistol（CuiGames）** <https://opengameart.org/content/p50-heavy-pistol-animated-glb-fbx-blender> | CC-BY 4.0 | 11 个武器动作含 `Reload/Inspect/Fire/ADS`，带 Blender 源 | 文件区标 “currently unavailable due to potential licensing issues”；只有武器层 |

### T2 · 移动/骨架补充（无枪、无换弹）

| # | 候选（原始链接） | 许可 | 动作/结构 | 作用与缺口 |
|---:|---|---|---|---|
| T2-1 | **Microsoft Rocketbox** <https://github.com/microsoft/Microsoft-Rocketbox> | MIT（LICENSE.md 明写） | 115 个绑定角色（含 8 个军用）、417 个动画；实践记录有 crouch in/out/idle、start/stop/turn、injured 等 | 补真实蹲行/起步停步；无武器/换弹；FBX + 3ds Max Biped 骨架 |
| T2-2 | **100STYLE（Ian Mason）** <https://www.ianxmason.com/100style/>；Zenodo <https://zenodo.org/records/8127870> | CC BY 4.0（需署名） | 100 种风格 × FW/BW/FR/BR/SW/SR/ID/TR，60 fps BVH、28 骨；含 Swat、Crouched、OnToesCrouched、StartStop、Rushed | 补 8 向跑/蹲/侧移与起停；无枪/换弹；需重定向 |
| T2-3 | **orangeduck/100style-retarget** <https://github.com/orangeduck/100style-retarget> | 数据 CC BY 4.0；Geno 网格仅非商业 | FBX/BVH 重定向数据；100 种步态 | 补 locomotion；纯移动，无手臂/武器/换弹 |
| T2-4 | **CMU Motion Capture Database** <http://mocap.cs.cmu.edu/> | 原始页原文 “This dataset of motions is free for all uses” | 原始 BVH/ASF-AMC，含 run/crouch/combat 等真实动作 | 补真实动作；无枪/换弹；需离线重定向并复核再分发条款 |
| T2-5 | **RancidMilk 2000+ 免费 mocap（经 80.lv/indienova）** <https://80.lv/articles/extensive-library-of-free-mocap-character-animations>；<https://indienova.com/u/leetgame/blogread/33093> | 80.lv 转述“可改可再分发、不可售卖”；原 itch 许可页未直读 | 2000+ 动作，FBX/Blender，来自 CMU | 补通用移动；无武器；许可措辞需原作复核 |
| T2-6 | **Innerscene Locomotion collection（Sam）** <https://www.innerscene.com/tools/library/3d-parts/locomotion-collection-sam-3d-person-animated-dc23800f> | CC0 | 20.9 MB GLB，7 clip：idle/relaxed walk/brisk walk/jog/run/carry walk/sit-stand | 超 10 MB；无 crouch/fire/reload；补基础移动 |
| T2-7 | **Rokoko 免费动作包**：12 sports <https://www.rokoko.com/resources/rokoko-mocap-12-free-sports-animations>；6 martial arts <https://www.rokoko.com/resources/rokoko-mocap-6-free-martial-arts-animations>；11 gun <https://www.rokoko.com/resources/rokoko-mocap-11-free-gun-animations> | 免费可商用，但禁止把动作作为独立素材再分发；下载需提交表单 | FBX、Mixamo 骨架、30 fps、含手指；11 gun 是持枪 mocap | 本卡不提交表单；gun 包可能有价值但逐条名称/正式许可未核；不能当可再分发源 |
| T2-8 | **BONES-SEED（bones-studio）** <https://huggingface.co/datasets/bones-studio/seed> | HF 页许可需核 | 公开 mocap 数据集（SOMA/G1 骨架） | 补跑步/蹲行；无枪械交互 |
| T2-9 | **WithinAmnesia/Vitruvian-Project** <https://github.com/WithinAmnesia/Vitruvian-Project> | CC0（UAL1 评论区作者推荐） | UAL1 的高精度 CC0 真人模型库；仓库只有纹理与外部网盘链接 | 可作高精度角色来源；未列动画/骨架文件 |
| T2-10 | **BAMEN Free Military Soldier** <https://sketchfab.com/3d-models/free-military-soldier-rigged-e9c56308a67d4a3db62e914fafa4d198> | CC BY 4.0 | 全身士兵网格/骨架，animationCount 0；Operation Steel Tide 用它作 UAL 重定向目标 | 只能当承载骨架；Sketchfab 下载需登录 |
| T2-11 | **1799danly Military tactical suit (LowPolyGameReady)** <https://sketchfab.com/3d-models/ef698ce36b1545a78ce592dd3db4c7ed> | CC BY 4.0 | 约 32k 面战术士兵身体，无动作 clip | 敌人本体候选；需把 UAL/KayKit clip 重定向上去 |
| T2-12 | **Operation Steel Tide（AetherRadar）** <https://github.com/AetherRadar/operation-steel-tide> | 代码 MIT、逐资产 LICENSE | 2026 开源 Godot 4.6 战术 FPS；带 Blender 重定向脚本、CC0 枪模与 reload 时序数据 | 不是 Three，但可作为“把 UAL clip 重定向到 Mixamo 命名骨架”的可运行参照 |

### T3 · 方法、先例与许可参照（不是资产候选）

| # | 条目（原始链接） | 为什么保留 |
|---:|---|---|
| T3-1 | **cktang88/3d-fps** <https://github.com/cktang88/3d-fps> | 最贴近的公开实践：Three r186 浏览器 FPS，bot 用 Quaternius UAL1/2 Standard（CC0），直言 UAL 免费层“没有任何 rifle clip”、reload 是 `Pistol_Reload` 重摆成步枪持握；同时用 100STYLE/Rocketbox 补移动 |
| T3-2 | **ANIMATION_RESEARCH.md** <https://github.com/cktang88/3d-fps/blob/main/docs/ANIMATION_RESEARCH.md> | 逐项许可表：UAL1 Pro $9.99 才有 8 向蹲行/Turn90/Hit_*；100STYLE CC BY 4.0；Rocketbox MIT；CMU 自定义；LAFAN1 CC BY-NC-ND；Kevin Iglesias 单实体许可不适合公开仓库 |
| T3-3 | **ASSET_SOURCES.md** <https://github.com/cktang88/3d-fps/blob/main/docs/ASSET_SOURCES.md> | ccrash/DJMaesen 的 AK-74m/SMG/sniper/Benelli/870/pistol 第一人称 rig（CC-BY，4–9 clip 含 reload）；Rocketbox/UAL/Toon Shooter 评价与拒绝表 |
| T3-4 | **sketchpunklabs/kaykit_char** <https://github.com/sketchpunklabs/kaykit_char> | 公开 Three.js demo/仓库，自述从 FBX 重导出 KayKit GLB、清理位置轨、保留 handslot；本卡 3 个 Med_* 小样即来自此仓库 |
| T3-5 | **doctor-g/KayKitAnimationInGodot** <https://github.com/doctor-g/KayKitAnimationInGodot> | KayKit 动画导入 Godot 的示例；核对 FBX/glTF 导入与动作命名流程，本身不是新许可来源 |
| T3-6 | **three.js forum – SkeletonUtils retarget/retargetClip 修复讨论** <https://discourse.threejs.org/t/fixing-skeletonutils-retarget-and-retargetclip-functions/65149> | 实测 three 0.163 下 retargetClip 对同款骨架仍失败，bind matrices 处理有问题，修复未合并 |
| T3-7 | **three.js forum – 同骨架可直接复用 clip** <https://discourse.threejs.org/t/can-i-apply-a-mixamo-animation-to-another-model-that-has-already-been-rigged/28846> | 明确结论：骨骼名/结构完全相同可直接套 clip，不同骨骼才需 retarget；比例差异仍会出问题 |
| T3-8 | **three.js forum – Mixamo 同名骨架仍脚内翻/手反向** <https://discourse.threejs.org/t/skeletonutils-retarget-doesnt-work-with-mixamorig-skeleton-inverted-feet-backward-hands/54892> | “同名”不等于可无痛复用；必须真实解析并看姿势 |
| T3-9 | **three.js forum – Retargeting issues** <https://discourse.threejs.org/t/retargeting-issues/45895> | AnimationMixer 按目标骨骼局部旋转施加，bone roll/orientation 不同就扭曲；帖内无运行时修复 |
| T3-10 | **three.js forum – Kenney Character Assets** <https://discourse.threejs.org/t/trouble-with-kenney-character-assets-in-threejs/13632> | Kenney 把模型与每个动画分拆成独立 FBX，FBX2glTF 不能合并；覆盖材质时漏设 skinning 会让动画完全不播 |
| T3-11 | **three.js issue #25288 / PR #25589** <https://github.com/mrdoob/three.js/issues/25288>；<https://github.com/mrdoob/three.js/pull/25589> | `retargetClip()` 输出固定少一帧，修复 PR 合并后被回滚；依赖该 API 必须自测末帧 |
| T3-12 | **Godot 论坛 – 手骨挂武器** <https://forum.godotengine.org/t/best-practice-for-attaching-weapons-items-to-a-characters-hand-across-many-animations-godot-4/141270> | 不同批次动画的手骨基准可差约 130°，一个 BoneAttachment 偏移无法适配所有 clip |
| T3-13 | **Unreal 论坛 – 开火时弹匣位置变化** <https://forums.unrealengine.com/t/gun-magazine-changes-position-when-fire/2720879> | 弹匣单独骨、骨为 root 子级时，开火会吸进手部 socket；独立弹匣骨必须明确父子与 socket 策略 |
| T3-14 | **Blender Artists – Mixamo 动画与手枪模型** <https://blenderartists.org/t/want-to-use-mixamio-animation-on-my-rigged-character-with-pistol-model/1506870> | Mixamo 只驱动角色骨骼、不会影响额外枪骨；换弹必须自己逐 clip 做 |
| T3-15 | **Blender Artists – 带枪模型在 Mixamo 只剩弹匣/扳机** <https://blenderartists.org/t/rigged-arm-with-gun-but-gun-is-not-visible-in-mixamo-for-animation-only-mag-and-trigger-is-visible/1506827> | 道具会破坏自动绑定流程；带枪模型不能直接丢给 Mixamo |
| T3-16 | **Epic 论坛 – Any Free Reloading Animations?** <https://forums.unrealengine.com/t/any-free-reloading-animations/123090> | 零预算求免费换弹，回复只有 UE4 Animation Starter Pack 和 Mixamo；反映免费完整换弹来源稀缺 |
| T3-17 | **Epic 论坛 – Crouch Reload Animation** <https://forums.unrealengine.com/t/crouch-reload-animation/109522> | 找不到免费 crouch reload，只能建议 layered blend per bone 把站立 reload 叠到蹲姿下半身 |
| T3-18 | **Epic 论坛 – Using FPS Animations on TPS Game** <https://forums.unrealengine.com/t/using-fps-animations-on-tps-game/2501359/2> | 引擎 FPS 模板只有 arms 和 gun、没有躯干/头/腿；FPS 包不等于全身敌人动作 |
| T3-19 | **Epic 论坛 – KINEMATION FPS Animation Pack Ultimate 反馈** <https://forums.unrealengine.com/t/kinemation-fps-animation-pack-ultimate/2531370/5> | 付费 FPS 包也有用户报角色一直在跑没有 idle、找不到全部武器、文档落后 |
| T3-20 | **Unity Discussions – 出售 Mixamo rig 模型** <https://discussions.unity.com/t/selling-models-with-mixamo-rig-on-asset-store/1706350/2> | 社区认为 Mixamo rig 不能原样转售、衍生作品属灰区 |
| T3-21 | **GDC Vault – Overwatch 第一人称动画** <https://gdcvault.com/play/1024319/> | 讲第一人称换弹如何在 45 帧内表达角色、左右手选择与不挡准星；行业依据，非资产源 |
| T3-22 | **Wolfire – GDC13 Animation Bootcamp Part 5/6** <https://www.wolfire.com/blog/2013/04/GDC13-Summary-Animation-Bootcamp-Part-5-6/> | 手、枪、弹匣、道具在 hand/weapon/body/world 空间之间切换，rig 必须支持挂接/脱离 |
| T3-23 | **Unreal – Editing Animation Layers** <https://dev.epicgames.com/documentation/unreal-engine/editing-animation-layers> | 官方示例把 reload 做成只 key upperarm 的 Additive Layer Track，叠在 locomotion 上；换弹应与跑动/蹲行分层 |
| T3-24 | **Stride – Additive animation** <https://doc.stride3d.net/4.4/en/manual/animation/additive-animation.html> | reload 主要动手臂，可把同一 additive clip 加到 idle/crouch/strafe/run；前提是同一 skinned mesh/skeleton |
| T3-25 | **Game Anim – Worst Reload Part 2** <https://www.gameanim.com/2015/01/13/worst-reload-part-2-2/> | 从业者吐槽坏换弹；“不要移动整把枪冒充换弹”的对照材料 |
| T3-26 | **DEV – 浏览器 3D 世界的骨架兼容层** <https://dev.to/miduo100/rendering-a-3d-world-in-the-browser-is-the-easy-part-threejs-gets-you-a-spinning-cube-in-ten-1e77> | Mixamo/Ready Player Me/VRoid/Root Motion 骨骼命名与重定向规则都不同，最终做 per-source 骨映射 + 回归 |
| T3-27 | **Gripforge – three.js 手骨局部挂武器** <https://gripforge.ai/blog/threejs-bone-local-weapon-attachment> | 讲 three.js 把武器绑到 hand bone 的双重变换/世界与局部混用坑 |
| T3-28 | **Charios – Mixamo 许可实践说明** <https://charios.com/blog/mixamo-account-license-for-indie-devs> | 可商用、免版税、无需署名，但不能把原始角色/动画当独立资产再分发；需 Adobe 登录 |
| T3-29 | **HN – Kenney.nl: Free Game Assets** <https://news.ycombinator.com/item?id=42671472> | 621 分/50 评；评论把 Quaternius 与 Kenney 并列为 CC0 3D 首选 |
| T3-30 | **HN – Mesh2Motion 发布讨论** <https://news.ycombinator.com/item?id=45693325> | 229 分/37 评；评论指出 Mesh2Motion 的动作库来自 Quaternius，说明新工具多是同一 CC0 库的再包装 |
| T3-31 | **80.lv – RancidMilk 2000+ 免费 mocap** <https://80.lv/articles/extensive-library-of-free-mocap-character-animations> | 行业媒体确认来源、规模与条款（可改可再分发、不可售卖）；无武器动作 |
| T3-32 | **digitalproduction – UAL2 评测** <https://digitalproduction.com/2026/02/10/130-animations-one-rig-zero-drama/> | 单一通用 rig、重定向到 Unity/Unreal 不保证无缝，免费 Standard 约 70% |
| T3-33 | **BINX Forge – 独立检查 Quaternius 免费 GLB** <https://binxforge.com/guides/improve-game-animations> | 免费 non-root-motion GLB 有 43 个具名 clip（含 T-pose），与官方“45 免费动画”接近；`Sprint_Loop` 不在这 43 clip 内，它来自 UAL1 的 46-clip Godot GLB |
| T3-34 | **assethoard – 2026 免费游戏资产源汇总** <https://assethoard.com/blog/where-to-find-free-game-assets-2026> | Quaternius CC0、Mixamo 需 Adobe ID、Sketchfab 逐件许可不同；没有任何源明确提供 reload，说明缺口是行业性的 |
| T3-35 | **GameFromScratch – ActionForge 评测** <https://gamefromscratch.com/actionforge-super-powered-mixamo-alternative/> | ActionForge 在浏览器内、CC0 库、FBX/GLB 导出、无登录；但没有 CLI/headless，不能解决本卡自动化取件 |
| T3-36 | **cartopolis 项目笔记（旧版）** <https://code.garage44.eu/jeroen/cartopolis/src/commit/7a91be1688748613449a27e77783ebfed0fe98af/docs/notes/avatar-locomotion.md> | Quaternius Modular 每个 glTF 固定 24 clip；枪械只有 Gun_Shoot/Idle_Gun/Run_Shoot、无 Reload；旧 UAL1 骨骼名 neck_01 与 Modular 的 Neck 完全不同 |
| T3-37 | **cartopolis 项目笔记（当前版）** <https://code.garage44.eu/jeroen/cartopolis/src/branch/main/docs/notes/avatar-locomotion.md> | 项目最终弃用 Quaternius 改用 MakeHuman；clip 只有 idle/walk/run/wave/interact/roll/punch/kick/faint/sit，仍无 gun/reload/crouch |
| T3-38 | **Cinevva – UAL 同骨架实测** <https://app.cinevva.com/blog/2026-05-10-open-world-browser-part-25-universal-characters> | 实测 UAL1&2 与 Universal Base/Modular 共用 65 关节 UE5 风格骨架，262 clip 在 three.js 中无需重定向；这里指 UE 骨架版本（UAL2 GLB / UAL1 的 UE FBX），不是 UAL1 免费 Godot GLB 的 53 关节（52 个 `DEF-*` + `root`）；与旧版骨骼不匹配的说法冲突，必须按 UAL 版本判断 |
| T3-39 | **Cinevva – Free Character Animation Library** <https://app.cinevva.com/tools/animations> | 浏览器里把 260 个 CC0 UAL 动作 + 99 个 MakeHuman 姿势重定向到自己的 rig，导出单个 GLB；但导出要付费且必须开浏览器 |
| T3-40 | **Godot Store UAL 评价** <https://store.godotengine.org/asset/quaternius/universal-animation-library/> | 12 条评价中唯一技术批评是 UpperChest 骨骼过度弯曲、换到别的角色会难看；有用户建议先学 BoneMap/AnimationTree 重定向 |
| T3-41 | **Drawcall Market – UAL Pro Pistol reload** <https://market.drawcall.ai/asset/quaternius-ual1-pistol-reload> | UAL Pro 1.0.8 的单 clip、归一化人形骨架、标 CC0；reload 存在但在 Pro 子集里 |
| T3-42 | **Drawcall Market – Humanoid Animations 目录** <https://market.drawcall.ai/animations> | Quaternius UAL1/2 的 263 个单动作 GLB 索引；Pistol_Reload 1.667 s、52 关节、纯动画无 skin、无武器/弹匣节点 |
| T3-43 | **3d.shep.bot – Free animated character models** <https://3d.shep.bot/assets/free-animated-character-models> | 2026 的 CC0/Royalty-Free 3D 资产索引，提供 `/v1/search?q=...&type=model&free=true` API；R90 与 BinToon 从这里捞到 |
| T3-44 | **Poly Pizza – Toon Shooter bundle** <https://poly.pizza/bundle/Toon-Shooter-Game-Kit-qraiSXoAru> | 73 models、17 animations、FBX+glTF；不列逐条动作名、reload 未知，但可作无登录的模型清单入口 |
| T3-45 | **Quaternius 官方动画查看器** <https://quaternius.com/animviewer.html> | index.pck 8,559,696 B 可离线读出 UAL1/UAL2 全量 clip 名；用于区分免费 Standard 与付费 Source |
| T3-46 | **Quaternius QAL v1.0** <https://quaternius.com/license.html> | 2026-08-28 更新：允许商用、修改并随成品分发，但禁止把素材本身（含修改后）作为独立素材再分发；与各包页 CC0 冲突，必须按包核实 |
| T3-47 | **OpenGameArt 站内搜索/作者页** <https://opengameart.org/art-search-advanced> | 3D Art tid=10；keys 查询经常只返回挑战页，改用 `/art-search?keys=`；是找到 R90/A5/P50/CoinCoin/Revolver 的实际入口 |
| T3-48 | **Mesh2Motion 应用** <https://github.com/Mesh2Motion/mesh2motion-app> | MIT 代码 + CC0 美术；human 骨架 66 关节 UE 命名；上一阶段记录本地解析 Pistol_Reload 2.0 s/198 通道/66 骨（本卡未重跑）；导出依赖浏览器 app |
| T3-49 | **ActionForge** <https://actionforge.app/> | 250+ CC0 clip，取自 Quaternius UAL 免费版；可导出 GLB/FBX、免登录，但完全在浏览器里、无 CLI/headless |
| T3-50 | **AssetFurnace / UniRig / NVIDIA Kimodo** <https://github.com/Bingeljell/image-to-3dlab>、<https://github.com/VAST-AI-Research/UniRig>、<https://research.nvidia.com/labs/sil/projects/kimodo/> | 生成/自动绑骨路线；需要 GPU/CUDA 或浏览器，且不提供现成可编辑 reload clip；本卡不生成占位动作 |
| T3-51 | **BoneConverter / Motion2MixamoRig** <https://github.com/yyc-git/BoneConverter>、<https://github.com/MaxLiu22/Motion2MixamoRig> | 骨骼名转换/视频驱动动作的转换层；不提供动作本身，目标模型须先有骨架或源视频权利 |
| T3-52 | **Mugen87/dive** <https://github.com/Mugen87/dive> | MIT 代码的 three.js FPS 示例；shotgun CC-BY、rifle CC BY-NC、soldier Mixamo License: None，只有部分资产可复用 |
| T3-53 | **GitHub FPS-Arms-3D** <https://github.com/Ayush-Mohanty/FPS-Arms-3D> | MIT；scene.gltf 1.2 MB，`arms_arms_0/Ak_ak74m_0/Mag_2_ak74m_0`，1 skin/85 joints/8 clip；含 idle/shoot/reload 的第一人称手臂与枪 |
| T3-54 | **Quaternius license 与包页的冲突记录** <https://quaternius.com/license.html> | 本卡多处引用；所有 Quaternius 候选都必须先解决“包页 CC0 vs QAL 禁止再分发”的冲突 |
| T3-55 | **中文二手/方法文**：腾讯云 <https://cloud.tencent.com.cn/developer/article/2690206>、vfxcg <https://vfxcg.com/2026/1000341.html>、smzdm <https://post.smzdm.com/p/avgpp0v9/>、cnblogs <https://www.cnblogs.com/sl339/p/19964814>、CGJOY <https://www.cgjoy.com/thread-281386-1-9.html>、掘金 <https://juejin.cn/post/7543981652944633908>、<https://juejin.cn/post/7700961680712859688>、B 站 <https://www.bilibili.com/video/BV17Lnj6fE3F/>、<https://www.bilibili.com/video/BV1U9RZYWEX7/>、爱给网 <https://m.aigei.com/faq/doc/1.html> | 只作方法/口径参照；vfxcg 明确 UAL2 无枪械/换弹，腾讯云/掘金多为二手推荐，爱给网未标许可素材不可商用 |

### T4 · 排除项（许可、登录、付费、文件不可取或二手）

| # | 条目（原始链接） | 排除原因 |
|---:|---|---|
| T4-1 | **Mixamo** <https://www.mixamo.com> | 需 Adobe 登录；条款不允许把原始动画再分发、非 CC0；只能作为最后的登录型 fallback 讨论 |
| T4-2 | **Adobe Mixamo FAQ / Adobe Community** <https://helpx.adobe.com/hk_zh/creative-cloud/faq/mixamo-faq.html> | 本机不可达（curl 000/WebFetch socket closed），许可原文未直读；结论仍按登录/不可再分发处理 |
| T4-3 | **Sketchfab – Modern Army Soldier +24 pro Animations** <https://sketchfab.com/3d-models/modern-army-soldier-with-24-pro-animations-37566d930fa7404f87847b7fca8dca97> | CC BY 4.0、23 clip（站/蹲/卧的 Idle/Walk/Run/Shoot/Reload/Death）；下载需 Sketchfab 登录，按任务未尝试；骨架与弹匣节点未披露 |
| T4-4 | **Sketchfab – Cransh/ccransh 第一人称系列**（AK-74m、SMG、MP5、VSK、Benelli M4、Saiga、sniper、hands 等）<https://sketchfab.com/ccransh> | CC BY 4.0、每包 4–9 clip 含 reload；只有手臂+枪、无蹲行/死亡；下载需登录；武器网格多来自第三方需另核署名链 |
| T4-5 | **Sketchfab – DuqueCD7 AK/Pistol/Saps-12** <https://sketchfab.com/3d-models/b95778a564094fc3a49d1d6a3b6a30ab>、<https://sketchfab.com/3d-models/fps-character-animation-pack-pistol-e2815a5bea3a4e3895b3c29a2586e671>、<https://sketchfab.com/3d-models/fps-character-animation-pack-saps-12-3e5ebbd4ace24f2e92eadb7252927b31> | CC BY 4.0、10–11 clip 的整角色包，含 reload/aim 过渡；下载需登录；UE5 骨架权利与缺蹲/死的疑问未核 |
| T4-6 | **Sketchfab – BarcodeGames M4 / Kriss Vector** <https://sketchfab.com/3d-models/m4-fps-weapon-animations-pack-v1-662fc74dda2646cfb48fc610705768ef>、<https://sketchfab.com/3d-models/kriss-vector-animated-free-54530c888cfd4ae7aab3c3852b229c7e> | CC BY 4.0、M4 5 clip（Draw/Fire/Reload/Reload Empty/Holster）；只有第一人称武器层；下载需登录 |
| T4-7 | **Sketchfab – 1Matzh 9mm/UZI/Desert Eagle** <https://sketchfab.com/3d-models/9mm-pistol-first-person-animations-c26d7f5aa72f4b01a6da4578caa8f07f>、<https://sketchfab.com/3d-models/uzi-first-person-animations-2026-remake-73266e9f1eb949b69a3ab11d8f636048>、<https://sketchfab.com/3d-models/desert-eagle-first-person-animations-09a213d8510a42d1b747135e85712eff> | CC BY 4.0、9–13 clip，含 Reload_Empty/Equip/Unequip；下载需登录；底模作者 Gintoki1234/Blue-Spirit 授权链待核 |
| T4-8 | **Sketchfab – MissingTray1151 Tactical Soldier / jayb3e Military Character** <https://sketchfab.com/3d-models/tactical-soldier-game-ready-low-poly-2bfce585144d4403a3ddf76a0e65767a>、<https://sketchfab.com/3d-models/8cd04f8d8ca94f7fb911fef2d3802f13> | CC BY 4.0、10–16 clip，描述含 firing/crouching/prone/death；下载需登录；clip 名/骨架未公开 |
| T4-9 | **Sketchfab – DJMaesen First Person arms / bumstrum FP arms** <https://sketchfab.com/3d-models/first-person-arms-e3c42c05b22944e5839deb8e003f0987>、<https://sketchfab.com/3d-models/fp-arms-06ee1407117d4e5ab343becb4ee44bb6> | CC BY 4.0、可下载的已绑定第一人称手臂；无 clip；下载需登录；只能当手臂基座 |
| T4-10 | **Sketchfab – PSX First Person Arms（Drillimpact）/ 其他 PSX** <https://sketchfab.com/3d-models/psx-first-person-arms-efd731f559a14ab48e29c8a200d71788> | Free Standard、18 clip；作者 itch 原页 TLS 证书域名不匹配，无法读；下载需登录 |
| T4-11 | **Fab – Tactical FPS Animation Pack - Assault Rifle** <https://www.fab.com/listings/1ae386ab-4a40-4a0f-ac17-621e2d9d1028> | 100+ FPS/TPS 动作含 tactical/quick/empty reload、逐帧进弹的独立弹匣、配件与 Blender 源；Fab 付费且需账号、许可未核 |
| T4-12 | **Fab – First Person Animations Starter Pack** <https://www.fab.com/listings/f725e126-89a2-40d7-bef0-8812997bfcc3> | 号称含 FPS reload 与 crouch start/loop/end；HTTP 403/需 Epic 登录，无法核动作清单与许可 |
| T4-13 | **Fab / Infima – Modern Guns Pack** <https://www.fab.com/listings/6914a185-4b14-475c-8f4f-cc0a6a3c589f> | 付费 $74–100，809 个第一人称手臂/枪动画；Epic 骨架 art pack，示例蓝图不可用于正式游戏 |
| T4-14 | **Epic – Animation Starter Pack（Fab 免费）** <https://www.fab.com/listings/98ff449d-79db-4f54-9303-75486c4fb9d9> | 62 动作、Fab Personal/Professional 0 元，含站立换弹与蹲姿；但 UE Mannequin 骨架、UE 内容许可范围需核，接 Three 需重定向；不是“随公开仓库提交”的干净源 |
| T4-15 | **Unity – CombatGirls_RifleCharacterPack** <https://assetstore.unity.com/packages/3d/characters/humanoids/humans/combatgirls-riflecharacterpack-305180> | 付费 $60、39 个 Humanoid 动作覆盖 idle/移动/蹲伏/瞄准/射击/换弹/受击/死亡；EULA 不允许再分发原始素材 |
| T4-16 | **B 站 – CombatGirls「免费分享」** <https://www.bilibili.com/video/BV1EvhK6aE7s/> | 上述付费资源的未授权转载，不构成任何许可；标记为反面证据 |
| T4-17 | **Unity – FPS Animation Ultimate / Pro（KINEMATION）** <https://assetstore.unity.com/packages/3d/animations/fps-animation-ultimate-240060>、<https://assetstore.unity.com/packages/3d/animations/fps-animation-pro-308611> | 付费、Unity 专用、EULA 不允许再分发；cgais 等“免费下载”是搬运 |
| T4-18 | **CuiGames R90 / A5 / P50（OGA）** <https://opengameart.org/content/r90-bullpup-smg-animated-reload-glb>、<https://opengameart.org/content/a5-carbine-animated-tactical-carbine-glb-blender>、<https://opengameart.org/content/p50-heavy-pistol-animated-glb-fbx-blender> | CC-BY 4.0，逐 clip 可读（R90 有 `Reload_Empty/Tactical/Unload`、magazine/bolt 节点；A5 12 clip；P50 11 clip），但页面标 “File(s) currently unavailable due to potential licensing issues”，文件取不到 |
| T4-19 | **CuiGames itch 合集 / R90 / L49** <https://itch.io/c/8384147/cuigames-free-fps-weapon>、<https://cuigames.itch.io/r90-bullpup-smg-with-animated-reload-gltf>、<https://cuigames.itch.io/l49-first-person-lmg> | 合集标题明确写 Animated Reload，但 itch TLS/连接失败，单项页与许可读不到；不能确认可再分发 |
| T4-20 | **GDQuest godot-4-FPS-arms** <https://github.com/gdquest-demos/godot-4-FPS-arms> | 有 idle/walk/shoot/reload，但 LICENSE 明确美术资产 CC-BY-NC-SA 4.0（禁商用），直接排除 |
| T4-21 | **Codeberg – FPS Hands (Bytez)** <https://codeberg.org/Bytez/godot-fps-hands> | GPLv3 有传染性，和公开游戏的分发方式冲突；页面 403，README/许可未读 |
| T4-22 | **Ultimate Animation Library（Fabbio Mendoza，Godot Store）** <https://store.godotengine.org/asset/fabbio-mendoza/ultimate-animation-library/> | 免费 20 个 GLB，含 tactical rifle reload/crouch-to-standing fire；但自定义许可明确禁止再分发动画文件，公开游戏仓库提交派生资源不合规 |
| T4-23 | **Rokoko 免费包** <https://www.rokoko.com/resources/rokoko-mocap-11-free-gun-animations> | 免费可商用但禁止把动作作为独立素材再分发；下载需提交姓名/邮箱表单，本卡未提交 |
| T4-24 | **Mixamo 洗白的 Sketchfab 资产** | 描述写 Mixamo 的 CC-BY 上传视为洗白；原始 Mixamo 动画不可再分发，不能作为公开来源 |
| T4-25 | **LAFAN1 / ZeroEGGS / Motorica / InterAct** | 明确 NC/ND（LAFAN1 README 写 NOT licensed for commercial use）；只能研究参照 |
| T4-26 | **GDQuest / AZRI Rig / Fabbio UAL / Codeberg** | 前两者 NC、后者禁止再分发、Codeberg GPLv3；均不能随公开游戏提交 |
| T4-27 | **cgais FPS Animation Ultimate 转载页** <https://www.cgais.com/archives/13460.html> | 站点自述“版权归原作者、仅供学习、勿直接商用”；盗版/搬运，不可作为许可来源 |
| T4-28 | **爱给网 FAQ** <https://m.aigei.com/faq/doc/1.html> | 官方规则：未标注许可的素材仅限个人学习研究；站内 FPS 手臂/角色页大多未标许可 |
| T4-29 | **budeco.top KayKit 镜像** <https://budeco.top/94964.html> | 逐条复刻 75 个英文 clip 名，但站点自述“禁止商业使用”；只能看不能从其下载 |
| T4-30 | **SkillsMP / opensmartroute / three.ws / gameassetsgarden / truebones** | 403/404/域名策略阻断/空响应；未读到内容，不能列为候选 |
| T4-31 | **Poly Pizza 评论 / Animated Pistol 评论** | 页面可开但评论由前端脚本加载，未取得正文；不影响模型本体结论 |
| T4-32 | **Steam / GDC Vault / 知乎 / B 站 / 微信公众号 / Reddit / Lobsters 搜索** | 多为登录/403/412/反爬/Anubis；只保留可读摘要或方法线索，不作为资产来源 |
| T4-33 | **OpenGameArt Necrobot / knik1985 / NetSriK 等** | 已在 T1 列出；因 CC-BY-SA/CC-BY 或动作不全，不能单独满足本卡；在这里只强调“不是 CC0 且缺 reload/crouch” |

## 4. 前几项为什么最值得深挖

### 4.1 KayKit：唯一能直接用本卡小样验证、无需浏览器/Blender 导出的 CC0 来源（覆盖“全身 + 步枪换弹 + 蹲 + 持枪跑 + 死亡”）

- **作者页清单**：<https://kaylousberg.com/game-assets/character-animations> 原文为 133 个人形动作，只按类别写 Crouching、reloading for one-handed/two-handed weapons、death 等，没有逐条 clip 名；FBX+glTF，Rig_Medium/Rig_Large。`2H_Ranged_Reload`/`2H_Ranged_Shoot`/`1H_Ranged_Reload`/`Hit_A/B`/`Death_A/B`（Knight.glb）；`Rig_Medium|Ranged_2H_Reload` 等（Med_CombatRanged.glb）；`Rig_Medium|Crouching`/`Rig_Medium|Running_HoldingRifle`（Med_MovementAdvanced.glb）；`Rig_Medium|Idle_A/B`/`Rig_Medium|Hit_A/B`/`Rig_Medium|Death_A/B`（Med_General.glb）；以上具名 clip 均来自本卡实测（见 `CPU-PARSE.md`），加载后需去掉或按后缀匹配 `Rig_Medium|` 前缀。OGA 链接 <https://opengameart.org/content/kaykit-character-animations> 是 2021 年 v1.0/v1.2 旧归档（约 29 个动作，无 crouch/reload/持枪跑），不能作为 133 动作包或这些 clip 的免费来源。
- **实际文件**：官方 Adventurers 仓库的 `Knight.glb` 实测 76 clip（含 T-Pose，即 README 的 75 个动作）、41 骨、15 mesh、`handslot.l/r`；其中 `2H_Ranged_Reload` 1.6 s、`2H_Ranged_Shoot` 1.0667 s、`Death_A` 0.8 s、`Death_B` 2.6333 s、`Running_A/B` 0.8/1.0667 s、`Idle` 1.0667 s。Character Animations 再导出的 `Med_MovementAdvanced.glb` 补 `Rig_Medium|Crouching` 1.1 s、`Rig_Medium|Running_HoldingRifle` 0.8333 s（加载后需处理 `Rig_Medium|` 前缀）。
- **许可**：CC0 1.0，官方 LICENSE 明写 “free to use in personal, educational and commercial projects”，无需署名；本卡保留作者与包名仅作来源记录。
- **为什么最值得深挖**：在作者页类别级清单（远程武器 reloading）+ 本卡实测文件（Knight.glb 的 `2H_Ranged_Reload`、Med_*.glb 的 `Rig_Medium|Ranged_2H_Reload`）两条证据上同时覆盖“远程换弹、蹲行、持枪跑、死亡”的 CC0 全身包中，它是唯一能直接取用、无需浏览器/Blender 导出即可在本卡验证的一项；Mesh2Motion 同样覆盖这些动作，但卡在 `.blend` 导出环节。同作者的 Adventurers 角色与 Character Animations 同属 Rig_Medium（Skeletons 同作者，rig 需另核），使用官方角色时不需要重刷权重或重定向；`handslot.l/r` 让独立枪有稳定挂点。
- **仍未解决**：没有枪/弹匣 mesh，没有独立弹匣骨/弹匣 clip；换弹是身体和手部动作，不能证明“弹匣退出、装入、闭锁”三层可读。Adventurers 包本身没有 crouch，必须叠加 Character Animations 的 `Rig_Medium|Crouching`（需处理前缀）。免费档是否包含 CombatRanged 组，itch 原页本机不可达，未核。风格是卡通奇幻，不是现代战术。

### 4.2 Mesh2Motion：动作覆盖最全，但最后一公里要浏览器/Blender

- **资产库**：`mesh2motion-assets` 的 `rigs/human/combat/ranged/` 明确有 `animation-human-rifle-reload.blend`、`pistol-reload`、`pistol-reload-2`、`rifle-fire`、`rifle-run`、`rifle-walk`；`rigs/human/idles/animation-human-crouch-idle.blend`、`locomotion/animation-human-crouch-walk.blend`、`sprint.blend`、`combat/reactions/animation-human-death-A/B/C/d.blend`。
- **许可**：代码 MIT；`LICENSE-CC0.MD`/`LICENSE` 明确覆盖 `models/blend/rigs/animations`，CC0 1.0。human 骨架 66 关节 UE 命名（`pelvis/spine_01/upperarm_l/hand_r`），mannequin 自带蒙皮。
- **为什么排第二**：动作语义比 KayKit 更贴近现代士兵，且明确有 rifle-reload；CC0 比 Quaternius 的 QAL 冲突干净。
- **仍未解决**：源库是 `.blend`，导出依赖其浏览器 app（`mesh2motion.org`）；本卡禁止 GUI/浏览器，也没有 Blender，无法直接产出 GLB。枪/弹匣只有单个 `Pistol` 节点，没有独立弹匣骨。另需确认 `Pistol_Reload` 的 2.0 s/198 通道/66 骨数据是否来自该 `.blend` 的官方导出（上一阶段记录为本地解析结果，本卡未重跑）。

### 4.3 Quaternius Toon Shooter：枪已经在手里，但没有换弹

- **实际文件**：Poly Pizza 的 Character Enemy GLB 1,552,600 B，含 34 个动画对象 / 17 个语义动作（每个语义动作都另有一条带 `CharacterArmature|` 前缀的重复项，按名加载会得到 34 个 clip 而不是 17 个）：`Idle/Walk/Run/Run_Gun/Run_Shoot/Walk_Shoot/Idle_Shoot/Duck/Death/HitReact/Jump/Jump_Idle/Jump_Land/Punch/Wave/Yes/No`；Character Soldier 1,333,700 B 为其中 14 个。结构为 2 个 skin / 2 个 skinned mesh（`Character_Enemy` 身体 + `Character_Enemy_Head` 头）+ 14 个刚性武器 mesh（均挂在 `Index1.R` 下）。
- **为什么排第三**：它是唯一“跑/蹲/射/死 + 独立枪已经在手 + 同作者成套”的 CC0 包；枪不是外挂道具，减少了武器对齐工作量。
- **仍未解决**：没有 reload clip、没有独立弹匣/枪机；官方 Google Drive 不可达，未核官方 zip；Poly Pizza bundle 与 Character Enemy 页均标 CC0（页面原文 “Licence: Public Domain (CC0)”，bundle 内嵌 JSON 为 “CC0 1.0”），与官方一致；CC-BY 标签只见于 Animated Pistol / Animated Base Character 等其他条目。

### 4.4 Quaternius UAL1 + Universal Base Characters：只有 UE 骨架路线接入成本低，但缺步枪换弹

- **实际文件**：OGA 的 UAL1 Standard zip 14,541,205 B，包内 `Godot/AnimationLibrary_Godot_Standard.glb` 6,671,104 B、46 clip、53 个关节（52 个 `DEF-*` + `root`），有 `Crouch_Idle_Loop`、`Crouch_Fwd_Loop`、`Jog_Fwd_Loop`、`Sprint_Loop`、`Walk_Loop`、`Death01`、`Hit_Chest/Head`、`Pistol_Aim_Down/Neutral/Up`、`Pistol_Idle_Loop`、`Pistol_Reload`、`Pistol_Shoot`。
- **为什么排第四**：65 关节 UE 骨架在免费导出中出现在 UAL2 的 `Unreal-Godot/UAL2_Standard.glb`（8,061,600 B、43 clip/65 骨）、`Unity/UAL2_Standard.fbx`（65 骨，含动画 take）与 `Female Mannequin/Unreal-Godot/Mannequin_F.glb`（65 骨/0 clip/1 mesh；同目录 `Mannequin_F.fbx` 同为 UE 命名），以及 UAL1 的 `Unreal Engine/AL_Standard.fbx`（65 骨，pelvis/spine_01/upperarm_l 命名，含 `_end` 叶骨）；Cinevva 实测 Universal Base Characters 与 Modular 也是同一套 65 关节骨架（本卡未独立解析），所以零重定向组合是 UAL1 的 UE FBX + UBC。Cinevva 的“262 clip 无需重定向”对应的是这条 UE 风格分布，不是 OGA 免费 UAL1 Godot GLB。只有走 UE FBX 路线时才谈得上“不刷权重”；UAL1 的 Godot/Unity 导出是 53 关节 Rigify（52 个 `DEF-*` + `root`），不是 65，套 65 关节角色仍需重定向或先转 FBX。CC0（OGA 包内 License.txt）。
- **仍未解决**：免费 Standard 只有手枪动作，没有步枪 reload；没有枪/弹匣模型；Pro/Source 付费；QAL v1.0 与包页 CC0 冲突，公开仓库提交前必须澄清。

### 4.5 Quaternius Animated Guns：唯一便宜的武器侧弹匣/枪机层

- **实际文件**：OGA 1.1 MB 包，6 把枪各有 Fire+Reload；Poly Pizza Animated Pistol 153,956 B 实测 `Fire/Reload/Slide` 3 clip，`Magazine/Slide/Trigger/Muzzle` 为独立节点。
- **为什么排第五**：它能补 brief 要求的“弹匣退出/装入、闭锁”武器侧可读性；节点名直接对应 `Magazine/Slide/Trigger`，比只有整枪旋转的资产更接近可编辑换弹。
- **仍未解决**：没有手臂、身体、握持或角色动作；不能单独承担角色跑/蹲/换弹；QAL 冲突；Poly Pizza 的 Animated Pistol 页标 CC-BY 3.0，与官方 CC0 不一致。

### 4.6 补充：FireGun 是“最接近现成战术士兵”的二次组装件，但不是作者原页

- `soldier_tactical_animated.glb` 8.97 MB、65 骨、43 clip、12 mesh，含 `Pistol_Reload`、`Crouch_Idle/Fwd`、`Jog/Sprint/Walk`、`Idle`、`Death01`、`Hit_Chest/Head`；独立 Arms mesh、刚性步枪 mesh、`hand_r` 武器绑定。
- 它把“身体+手臂+枪”装进一个 GLB，接入 Three 的试错成本最低；但没有步枪 reload、没有独立弹匣，且是第三方组装（Xinba210），许可虽写 Quaternius/KayKit CC0，仍应回到作者原页复核。因此不列入 T0。

## 5. 许可与文件身份明细

| 来源 | 作者/原页 | 许可原文/范围 | 固定文件身份 | 覆盖代码/模型/动画 | 风险 |
|---|---|---|---|---|---|
| KayKit Character Animations / Adventurers / Skeletons | Kay Lousberg，<https://kaylousberg.com/game-assets/character-animations>、<https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0> | CC0 1.0；官方 LICENSE 明写 personal/educational/commercial，无需署名 | `Knight.glb` 3,659,532 B `60428e3…5168`；Med_* 见 CPU-PARSE.md | 模型、贴图、骨架、动画全部 CC0 | 免费档成员未在 itch 核；第三方再导出与官方 zip 不是逐字节同一文件 |
| Quaternius UAL1 / UAL2 / Animated Guns / Toon Shooter / Modular / Base Characters | Quaternius，<https://quaternius.com/>；OGA 作者上传 | 包页多标 CC0；OGA zip 内 License.txt 为 CC0 1.0；但 <https://quaternius.com/license.html> 2026-08-28 起为 QAL v1.0，禁止把素材本身作为 asset pack/stock file 再分发 | UAL1 zip 14,541,205 B（内 `Godot/AnimationLibrary_Godot_Standard.glb` 6,671,104 B）；UAL2 zip 10,257,419 B（内 `Unreal-Godot/UAL2_Standard.glb` 8,061,600 B）；Animated Guns 1.1 MB；Toon Shooter 官方 zip 未取到 | 包页称 CC0 覆盖模型/动画；QAL 只允许并入 Product、不允许独立再分发 | **冲突未解决**；公开仓库提交派生动画文件落在灰区；需 dot 决定或向作者确认 |
| Kenney | Kenney，<https://kenney.nl/>；OGA 作者上传 | CC0 | Blocky zip 2,148,510 B；Mini 包；Animated 系列 | 模型/动画 CC0 | 动作集不含枪战；下载接口需同源会话 |
| OpenGameArt 单项 | 各作者 | 逐项 CC0 / CC-BY 3.0/4.0 / CC-BY-SA / GPL | 见 T1 各行 | 逐项不同 | 必须逐页核；CuiGames 文件当前不可取 |
| Mesh2Motion | <https://mesh2motion.org/>、GitHub | 代码 MIT；美术 LICENSE-CC0.MD 覆盖 models/blend/rigs/animations | 仓库 `.blend` 源；无固定 GLB 哈希 | 代码 MIT、美术 CC0 | 导出依赖浏览器 app；本卡不能运行 |
| Microsoft Rocketbox | Microsoft | MIT（LICENSE.md） | GitHub 仓库；417 动画 | 代码/模型/动画 MIT | 无武器/换弹；FBX/Biped |
| 100STYLE | Ian Mason | CC BY 4.0（需署名） | Zenodo record 8127870；16.2 GB | 动作数据 CC BY 4.0 | 无武器/换弹；需重定向 |
| CMU | CMU Graphics Lab | 原始页 “free for all uses” | BVH/ASF-AMC 数据集 | 动作数据 | 无武器；再分发条款需复核 |
| Sketchfab | 各作者 | CC BY 4.0 / Free Standard 等 | 逐模型 UID；下载需登录 | 逐项 | 登录 + 署名链 + 部分 Mixamo 洗白 |
| Fab / Unity / UE | 各商家 | 商业 EULA；Fab/Unity 需账号 | listing ID | 不允把原始素材作为独立文件再分发 | 付费/登录；按任务排除 |
| Mixamo / Adobe | Adobe | 可商用、免版税、无需署名；不可把原始角色/动画当独立资产再分发 | 无公开固定文件 | 动画 | 登录型；不可再分发 |
| 二手转载（cgais/budeco/B 站/爱给网） | 不明 | 自述“仅供学习/禁止商用/未标许可” | 无 | 无 | 不可作为许可来源 |

### 5.1 固定文件身份的覆盖程度

本卡只对实际落盘并解析的 KayKit 样本给出 SHA-256。其余候选的“固定文件身份”来自上一阶段的包名、字节数、版本或页面清单；没有重新下载的，不冒充已核字节。

| 等级 | 含义 | 本次覆盖 |
|---|---|---|
| A · 字节级 | 有文件大小 + SHA-256 + JSON 结构/逐 clip | KayKit `Knight.glb`、`Med_CombatRanged.glb`、`Med_MovementAdvanced.glb`、`Med_General.glb`（见 `CPU-PARSE.md`） |
| B · 归档级 | 有包名/字节数与包内结构，但没有保留原件或未逐成员核 | Quaternius UAL1 Standard zip 14,541,205 B（`Godot/AnimationLibrary_Godot_Standard.glb` 6,671,104 B）、UAL2 Standard zip 10,257,419 B（`Unreal-Godot/UAL2_Standard.glb` 8,061,600 B）、Animated Guns 1.1 MB、Kenney Blocky zip 2,148,510 B、Necrobot .blend 9,646,604 B、FireGun GLB 8.97 MB、UAL1 Godot GLB 6,671,104 B |
| C · 页面级 | 只有作者页/包页/API 元数据，没有本卡可复算的文件身份 | Toon Shooter（官方 Drive 不可达）、Ultimate Modular Men/Women、Cyberpunk/Zombie/Platformer、Kenney 其余套件、OGA 多数条目、Sketchfab、Fab/Unity/UE |
| D · 仅索引 | 只在聚合页/搜索结果看到标题，未读到原页 | BinToon MW2 MP5、Blood_seller Armored Soldier、3d.shep.bot 部分 itch 条目等；未列为候选 |

因此，T0/T1 中只有 KayKit 达到“可复算文件身份 + 逐 clip 清单”的 A 级；Quaternius 与 Kenney 达到 B 级；其余需在 dot 选定后再补一次下载/哈希/逐成员核验。

本次复核 UAL1/UAL2 时，两个 Standard zip 已重新下载到临时目录并用 CPU 展开成员（UAL1 内 `Godot/AnimationLibrary_Godot_Standard.glb` 6,671,104 B/46 clip/53 关节、`Unreal Engine/AL_Standard.fbx` 65 骨/`_end` 叶骨、`Unity/AnimationLibrary_Unity_Standard.fbx` 52 个 `DEF-*` + `root`；UAL2 内 `Unreal-Godot/UAL2_Standard.glb` 8,061,600 B/43 clip/65 骨、`Unity/UAL2_Standard.fbx` 24,371,692 B/65 骨/含动画 take、`Female Mannequin/Unreal-Godot/Mannequin_F.glb` 1,442,824 B/65 骨/1 mesh/0 clip），临时文件未入库、未计算 SHA-256，因此仍按 B 级记录。

## 6. 与当前 Three 0.186.1 / 固定步长模拟的接入判断

### 6.1 当前合同

`src/render/content-set-assets.ts`：

- `ContentOpponent` 只接受 `position` / `quaternion` 轨道，线性插值；每个轨道必须能在固定场景里找到同名节点。
- 必需 clip 名是 `idle/walk/fire/hit/death`；`hit/death` 时长必须 ≤ `RESULT_HOLD_MS`（`src/render/feedback.ts` 为 700 ms）。
- 每个 render 先恢复 rest TRS，再按绝对模拟时间采样；没有 AnimationMixer 的增量/墙钟循环。
- 敌人是 5 个刚性组（`head/spine/leg-l/leg-r/weapon`），蹲伏只是 `stance.scale.y = .65`，fire/hit/death 都是整身刚性位移。

### 6.2 换成 KayKit 需要什么

| 改动 | 是否必须 | 说明 |
|---|---|---|
| 新增 SkinnedMesh + AnimationMixer 消费路径 | 是 | 当前 rigid 合同无法播放 41 骨/15 mesh 的蒙皮动画；这不是“换一个 GLB 路径”能解决的 |
| 换成 KayKit 角色 mesh 或把动作重定向到现有 relay-guard | 二选一 | 用 KayKit Adventurers 角色可免重刷权重；保留 relay-guard 则需重定向/重绑，违反“不刷权重” |
| clip 名映射 | 是 | `idle→Idle`、`walk→Running_A/B`、`fire→2H_Ranged_Shoot`、`reload→2H_Ranged_Reload`、`hit→Hit_A/B`、`death→Death_A/B`；`crouch→Rig_Medium\|Crouching`（来自 Character Animations，需去/匹配前缀） |
| `hit/death` 700 ms 限制 | 是 | `Death_A` 800 ms、`Death_B` 2633 ms、`Hit_B` 867 ms 超限；`Hit_A` 667 ms 满足 ≤700 ms；若用 Med_General 的 `Rig_Medium\|Hit_A` 则 700 ms 正好卡在上限；要么裁切/换 clip，要么改合同并重审 Feedback retention |
| root motion | 是 | 每个 clip 的 `root` 都有 translation/rotation/scale 烘焙；必须忽略/剥离 root XZ，位置仍由模拟驱动 |
| 枪/弹匣 | 是 | `handslot.l/r` 只能挂一个刚性枪；没有独立弹匣骨。需要另配枪模，并用程序或武器侧 clip 驱动弹匣/枪机；这又回到“身体 reload + 武器侧 reload 对齐”问题 |
| 手指/握持 | 否（但影响可读性） | 两套骨架（23 骨与 41 骨）都没有手指骨；握持是整手姿态，近景手指接触不可读 |

### 6.3 能不能“不刷权重、不手补动画”

- **用 KayKit 官方角色 + KayKit 动作**：不需要刷权重、不需要手补动画；需要新消费者与 clip 映射。这是唯一接近“零美术返工”的组合。
- **保留 relay-guard + KayKit/UAL 动作**：需要重定向或重绑；Three 的 `SkeletonUtils.retargetClip` 在多个公开帖里仍有脚内翻/手反向/少一帧问题，不能承诺零人工。
- **只做武器侧**：可以用 Quaternius Animated Guns 或 OGA Revolver/Webley 的节点轨道，在当前 rigid 合同上增加 `magazine/bolt` 节点与轨道；这不需要新 skinned 路径，但**不提供**角色跑/蹲/换弹，只让武器本身可读。

### 6.4 结论

- **满足六动作 + 全身 + 可商用可再分发**：KayKit 是当前最强，但缺枪/弹匣，且需要新 skinned 消费者。
- **满足武器侧弹匣/枪机**：Quaternius Animated Guns 最强，但无角色。
- **满足“零改接入当前 rigid 合同”**：没有。当前合同只能承载 5 个刚性组的整身位移，不能承载任何真实换弹。
- **满足“独立手臂/枪/弹匣”三者同源**：没有免费来源；最接近的是 Sketchfab Cransh/DJMaesen 的第一人称手臂+枪（CC-BY、需登录）和 FireGun 的二次组装（无步枪 reload/弹匣）。

## 7. 推荐与下一次 dot 选择

### 7.1 推荐（按目标优先级）

1. **若 dot 接受新增 SkinnedMesh/AnimationMixer 第三人称消费者**：选 **KayKit**。
   - 角色：`Knight.glb`（Adventurers，CC0，76 clip 含 T-Pose，即 75 个动作，41 骨、15 mesh）。
   - 动作：Adventurers 的 `Idle/Running_A/B/2H_Ranged_Reload/2H_Ranged_Shoot/Hit_A/B/Death_A/B` + Character Animations 的 `Rig_Medium|Crouching`/`Rig_Medium|Running_HoldingRifle`（加载后需去/匹配 `Rig_Medium|` 前缀）。`Hit_A` 0.667 s 满足 ≤700 ms，`Hit_B` 0.867 s 超限；Character Animations 的 `Rig_Medium|Hit_A` 为 0.700 s，正好卡在 700 ms 上限。
   - 枪/弹匣：需另配 CC0 枪模（Kenney Blaster Kit、OGA Low Poly M4A1、Quaternius Animated Guns），并决定弹匣是程序位移还是武器侧 clip；当前没有独立弹匣骨的 CC0 身体动作。
   - 代价：新消费者、clip 映射、700 ms 合同调整、风格从现代战术变成卡通奇幻。
2. **若 dot 接受离线 Blender/浏览器导出**：评估 **Mesh2Motion**（CC0，rifle-reload/crouch/death 最全），但本卡不能开浏览器或 Blender，无法在本单元产出。
3. **若 dot 只允许武器侧最小改动**：选 **Quaternius Animated Guns**（或 OGA Revolver/Webley）补弹匣/枪机，接受“身体仍是整身位移”的现状；这不满足 brief 的换弹可读要求，只作为过渡。
4. **若 dot 接受付费/登录**：Fab Tactical FPS Animation Pack（100+ 动作、独立弹匣、Blender 源）或 Unity CombatGirls（39 动作）是功能最贴近的对照；但都不是“免费可随公开仓库提交”的来源。

### 7.2 下一次需要 dot 选择的缺口

| 选择 | 需要 dot 决定 | 影响 |
|---|---|---|
| A. 新增 skinned 第三人称消费者 | 是否批准改 `ContentOpponent`/新增消费者，允许 SkinnedMesh + AnimationMixer | 这是采用 KayKit/Mesh2Motion 的前提；不改就只能做武器侧 |
| B. 角色风格 | 接受 KayKit 卡通奇幻，还是坚持现代战术士兵 | 决定是否要另找现代士兵 mesh 并重定向 |
| C. 枪/弹匣来源 | 用 KayKit handslot + 独立枪模，还是用 Quaternius Animated Guns 的独立弹匣节点 | 决定弹匣是程序位移还是武器侧 clip，以及能否做到“退出/装入/闭锁”三层 |
| D. Quaternius 许可 | 是否接受“包页 CC0 + 站点 QAL v1.0 禁止再分发”的冲突，或去信作者确认 | 影响 UAL1/Toon Shooter/Animated Guns 能否进公开仓库 |
| E. 700 ms 合同 | 是否允许 hit/death 超过 700 ms，或裁切 `Death_A`/换 `Hit_A` | 影响死亡动作可读性与 Feedback retention |
| F. 是否允许浏览器/Blender 离线导出 | 是否给 Mesh2Motion 的 `.blend` → GLB 转换开口 | 决定 Mesh2Motion 能否从“候选”变成“可评估样件” |

### 7.3 明确不做的

- 不自造 reload clip，不把整枪倾斜/位移冒充换弹。
- 不把搜索摘要、视频、镜像页当成可编辑 clip。
- 不宣称已经游戏采用；本卡没有改 `src/`、旧源包、训练适配卡或 guard 候选。
- 不提交、不推送、不切换分支、不改任务文件。

## 8. 小样与 CPU 解析

本卡保留一件最强候选（KayKit）的必要公开小样：

```text
asset-pipeline/character-action-sources/sample/kaykit/
├── Knight.glb                 3,659,532 B  sha256 60428e3abc09ba83e595d256e3af8c5c976b46cdae599f0802fc82b4a3445168
├── Med_CombatRanged.glb         637,760 B  sha256 08de5a5fd14dcc7c404b14f7c6ff962f8959503bf70bc00cbf258dbd0187c48d
├── Med_MovementAdvanced.glb     331,200 B  sha256 5d309533953185acc19800ce8d89c13cba8a68986214cb87520496139cf418e2
├── Med_General.glb              460,024 B  sha256 628e5fa41d82787f2d779320b49946c318dd8564ec2611b2a1bba1c0f33a6819
├── LICENSE-KayKit-Adventurers.txt  891 B
├── LICENSE-CC0-1.0.txt           7,048 B
└── PROVENANCE.md
```

合计 5,088,516 B（约 4.85 MiB），低于 10 MB 上限。逐 clip 清单、骨架、时长与通道见 `CPU-PARSE.md`。

已验证：文件大小/SHA-256/JSON 结构、41/23 骨、`handslot.l/r`、76/20/13/15 clip 的名称与时长；`Knight.glb` 有 15 mesh/1 material/1 image，Med_* 为 0 mesh 的纯动画。

未验证：Three `GLTFLoader` 加载（缺 `node_modules`，禁止安装）、实际播放/姿势/接触/镜头、itch 免费档成员、Quaternius QAL 冲突的最终解释。

## 9. 未验证与限制

- 没有打开浏览器、GUI 或 GPU；没有运行 Blender；没有安装依赖。
- `docs/quality.md` 的“第三人称 8 动作 0/8、第一人称 7 动作 0/7”仍是当前事实；本卡只做来源筛选，没有改内容完成率。
- 所有“实测 clip”都是字节解析结果，不等于姿势合格、握持正确、镜头可读或性能达标。
- 读不到的渠道与原因已逐项记在第 2 节；不把“读不到”写成“没有”，也不把“镜像/二次组装”写成“作者原页授权”。
- WebSearch 额度 200/200 已用尽；后续若需 2026 新包、中文/日文补充检索，需要新会话或新预算。
- 本卡没有提交、推送、切换分支或修改任务文件；产物只在本工作目录的 `asset-pipeline/character-action-sources/`。
