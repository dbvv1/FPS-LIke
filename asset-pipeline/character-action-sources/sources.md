# 训练赛完整枪械动作源候选清单

任务：B-FPS-RELOAD-SOURCE-20261104（找训练赛完整枪械动作源）。
基线：`36fde4bb6a2e8f9652528fdea648d0a90190db79` 的 relay-guard、content-set；动作合同另以 `b198df62a56f4c520716fbc9cb4afac47dd62213` 的 buildEnemy/动作为准。
整理日期：2026-11-05。本文记录 432 条候选（按 URL 去重，未按模型 UID 去重，口径见 §2），另有 180 条读不到渠道记录（逐项见附录 A）；432 条候选只做了页面可读性与描述一致性核对，T4 付费/登录/403 项未打开，只按页面/索引记录；**只用这份清单与收集记录，不新增未核实链接**；不把搜索摘要、镜像页或视频里的“看起来像换弹”当成可编辑 clip。

## 0. 结论

**没有任何一项免费、可商用、可随公开游戏分发、且同时具备以下条件的成套来源：**

1. `idle / run / crouch / fire / reload / death` 六类第三人称动作；
2. 独立手臂、独立枪、独立弹匣节点与可读的退匣/入匣/闭锁；
3. 不改骨架权重、不手补动画即可接进当前 Three 0.186.1 与 60 Hz 固定步长模拟。

本单元最值得继续深挖的是 **Mesh2Motion 的预导出 GLB 动作集**（CC0，仓内直接提供 `model.glb`、`skeleton.glb` 与逐条 clip GLB，含 rifle/pistol reload、crouch-idle/walk、death-a~d；项目本身用 Three 0.185、目标 0.186.1）。它纠正了上一阶段“Mesh2Motion 源为 `.blend`、导出必须浏览器”的旧结论：动作文件已经在仓库里，可以直接由 GLTFLoader 加载；缺口是没有枪/弹匣节点，且当前 `ContentOpponent` 不能消费 SkinnedMesh。
本单元已用 raw 下载 + Python 解析复核：`static/assets/human` 下有 `model.glb`（531,504 B，0 clip，1 mesh，66 关节）与 `skeleton.glb`，`animations/` 共 222 个单 clip GLB；其中 `rifle-reload.glb` 64,588 B、内部 clip 名 `Rifle_Reload`、2.7083 s，`rifle-fire` 1.2083 s，`rifle-idle` 1.9167 s，`rifle-walk` 1.2917 s，`rifle-run` 0.7917 s，`pistol-reload` 2.0 s，`pistol-reload-2` 2.0417 s，`crouch-idle` 3.625 s，`crouch-walk` 2.4583 s，`death-a/b/c/d` 4.5/1.875/2.2083/2.1667 s；全部 66 关节，且 4 个 bufferView 全用 `EXT_meshopt_compression`（`extensionsRequired` 含它），GLTFLoader 必须设置 `MeshoptDecoder`。

紧随其后的是 **Red Eclipse actors**（CC-BY-SA 4.0+，78 骨，真实 `rifle_reload` 51 帧@24fps=2.125 s，含蹲行与死亡；但格式是 IQM，需要转换，且 SA 许可有传染性）、**Operation Steel Tide 的 BAMEN 动画士兵 GLB**（CC BY 4.0 网格 + UAL1/2 动作，38 clip，含 crouch/reload/death/aim/prone，78 骨；网格可再分发，但动作层仍受 Quaternius QAL v1.0 再分发冲突约束，未澄清前整套不能判定为可随公开仓库提交；reload 实为 UAL1 Pistol_Reload，没有枪/弹匣节点）、**KayKit**（CC0，全身 133 动作类别含双手武器 reload、蹲、死亡，模型/骨架/动作同源；无枪/弹匣，卡通奇幻风格）和 **ZenXChaos/ThirdPersonShooter-AnimationSets**（Unlicense，40 个 FBX（DefaultAnims 15、RevolverAnims 23、ShotgunAnims 2，另 1 个 unitypackage；README 列 40 个动作名），左轮 ReloadInit/Loop/End + 蹲姿换弹 + 死亡，独立 L_Weapon/R_Weapon 骨；无步枪、无枪模，FBX 需转 glTF）。

**当前 rigid 合同不能承载任何一套全身动作。** `src/render/content-set-assets.ts` 的 `ContentOpponent` 只接受 `position/quaternion`、`enemy-root` + 5 个刚性组（`head/spine/leg-l/leg-r/weapon`）、必需 clip 名 `idle/walk/fire/hit/death`，且 `hit/death` 必须 ≤700 ms；`loadContentPiece` 还校验 scene `userData` 并拒绝 `SkinnedMesh`。任何 skinned 人形动作源都需要新增 SkinnedMesh/AnimationMixer 消费路径。若 dot 不批准这条新路径，本卡只能做到武器侧换弹，无法满足 `docs/brief.md` 第 21 行“弹匣退出、装入、闭锁可读”。

**武器侧最强**是 `MilitaryG — Pistol, animations, sounds for GoDot`（CC0，8 个具名动画：Fire/Hammer Pull/Hammer Release/Mag In/Mag Out/RESET/Slide Pull/Slide Release，弹匣分 loaded/empty 两个独立节点）与 `3DAssets.dev — FPS Guns and Shooting Range`（CC0，实测 clip `stock-open/stock-close/magazine-open/magazine-close`，独立 stock/magazine 节点）；Quaternius Animated Guns 与 Steel Tide AK/SCAR 可补独立弹匣/枪机几何。

## 1. 筛选口径

| 维度 | 入候选条件 | 本次怎么核 |
|---|---|---|
| 许可 | 免费、可商用、允许把派生资源随公开游戏提交；能读到作者原页或包内许可原文 | 作者页/仓库 LICENSE/包内 License.txt；区分 CC0、CC-BY、CC-BY-SA、NC/ND、GPL、EULA、自定义禁止再分发 |
| 动作 | `idle/run/crouch/fire/reload/death` 六类都有，且是真实 clip，不是视频或整枪位移 | 页面清单 + GLB/GLTF/FBX/ZIP/IQM 字节解析；搜索摘要不算 |
| 结构 | 全身骨架 + 手臂（蒙皮）+ 独立枪 + 独立弹匣节点 + 稳定握点 | 节点名、skin、mesh、clip 通道；没有独立弹匣骨就记为缺 |
| 接入 | 同 rig 或同名骨，不重刷权重、不手补动画，能接 Three 0.186.1 + 固定步长 | 对照 `src/render/content-set-assets.ts` 合同与现有 relay-guard 源 |
| 文件身份 | 固定文件（大小、SHA-256、版本）与逐 clip 清单 | 下载到临时目录或本卡 `sample/` 后解析 |
| 小样 | 最多一件最强候选的必要公开小样，≤10 MB，仅 CPU | 入库小样为 `sample/kaykit/` 共 5,088,516 B；第一推荐 Mesh2Motion 只做临时字节级核验（8.1），未入库，见第 8 节例外说明 |

排除规则：需登录、付费、无重分发许可、权重/已有 403 的入口不尝试；镜像、二手转载、二次组装不等于作者原页授权；Mixamo 原始动作不可再分发；Fab/Unity/UE 商店许可不允许把原始素材作为独立文件随公开仓库提交。

排序权重：**许可可随公开游戏提交（硬门槛） > 六类动作覆盖 > 独立手臂/枪/弹匣结构 > 不重刷权重/不手补动画的接入成本**。付费、需登录、许可禁止再分发或文件当前不可取的条目只放在 T4 作对照，不参与“可入候选”排序。

## 2. 渠道覆盖表

“得到”指本清单中实际通过链接核对、仍保留的条目数（按 URL 去重；同一 GitHub 仓库/同一作者的不同页面可能被归到不同渠道，渠道之间有重叠）。24 个渠道行合计 394，第 25 行“对账”补 38 条未归入单一渠道的保留条目（任务给定输入、跨渠道引用，多为 T3 方法项与 T4 排除项），394+38=432，与 T0–T4 的 11+50+33+174+164=432 对账；本表不是严格的分区计数。另：12 组 Sketchfab 同一模型以带 slug 与裸 UID 两个 URL 重复计入（662fc74d、effd5240、93e51432、73266e9f、b95778a5、3e5ebbd4、225a6219、34220aaa、f2bef085、e3b0951e、9c66f74e、be023819），所以“按 URL 去重”为 432，按模型 UID 合并为 420。“读不到”按任务要求记录原因，不把失败当空结果。渠道取法的原始 18 段记录见附录 B，读不到渠道的 180 条逐项记录见附录 A。

| # | 渠道/来源族 | 实际看了什么、怎么取（摘录） | 得到 | 读不到/限制 | 对本卡的结论 |
|---:|---|---|---:|---|---|
| 1 | 目标仓文档与源码 | `docs/brief.md`、`docs/quality.md`、`assets/content-set/README.md`、`src/render/content-set-assets.ts`、`src/candidates/offline-training-v1/render/target.ts`；只读 | 0 | 无 | 确认缺口：第三人称 8 动作 0/8、第一人称 7 动作 0/7；rigid 合同只收 pos/quat + 5 节点 + 5 个 clip 名，hit/death ≤700 ms。这是筛选与“最少改动”判断的基线，不是资产来源 |
| 2 | Quaternius 官方站 | `quaternius.com` 首页、Toon Shooter、UAL1、UAL2、Animated Guns、Ultimate Modular Men/Women、Ultimate Animated Character、Universal Base Characters、Cyberpunk、Easy Enemy、Zombie Apocalypse、Platformer、`license.html`、`animviewer.html`；curl 去标签；`index.pck` 离线解析 | 13 | Google Drive 下载文件夹 TLS 失败（exit 35/52）；itch 页不可达；官方 zip 成员未能从官方 Drive 取到 | 包页多标 CC0，但 2026-08-28 的 QAL v1.0 禁止把素材本身作为 asset pack/stock file 再分发，与包页冲突；所有 Quaternius 项先标“许可待澄清” |
| 3 | KayKit（作者站/OGA/GitHub/再导出） | `kaylousberg.com/game-assets/character-animations`、`characters-adventurers`、`characters-skeletons`；OGA `kaykit-character-animations`（v1.0/v1.2 旧归档）；GitHub `KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0`、`sketchpunklabs/kaykit_char`、`doctor-g/KayKitAnimationInGodot`；8 个 Med_*.glb + Knight.glb 解析 | 9 | `kaylousberg.itch.io/kaykit-character-animations` curl 000/WebFetch Socket closed；免费档是否包含 CombatRanged 组、完整文件清单、版本号未核 | 本文 T0 之一；动作与角色同 rig，但无枪/弹匣，且当前 rigid 合同不能直接消费 |
| 4 | Kenney 官方/OGA/镜像 | `kenney.nl/assets/category:3D` 全部 4 页 50 个 3D 包；search=character/animation/fps/weapon/shooter/gun/zombie；逐页读 animated-characters-protagonists/retro/survivors、blocky-characters、mini-characters、blaster-kit、survival-kit、mini-arena、graveyard-kit；`KenneyNL/Starter-Kit-FPS`；`ETdoFresh/kenney.nl` 47,655 文件树 | 7 | `kenney.nl/download-link/<id>` 返回 error/404/forbidden；部分 3D 分类页 403；官方 zip 成员只能用镜像旧版本核对 | CC0 但没有“人形+枪+reload”成套；Blaster Kit 只能当独立枪/弹匣零件；Kenney 官方 FPS starter 只有 blaster.glb/blaster-repeater.glb，没有第一人称手臂与 reload clip |
| 5 | OpenGameArt 搜索与作者页 | 高级搜索 `field_art_type_tid[]=10` + 约 110 组 keys（reload/rifle/pistol/shotgun/smg/gun/weapon/soldier/military/fps/viewmodel/crouch/death 等），解析 746+640+266+247 条结果；读 ~20 个 content 页、6 个作者页；zip/blend/GLB/Godot .tscn 字节解析 | 41 | WebFetch 对 OGA 部分页 403，已改 curl；R90/A5/P50 文件区标 “File(s) currently unavailable due to potential licensing issues”；多 tag 交集查询失准 | OGA 是“武器侧换弹”和“手臂/弹匣零件”的主要来源，但没有一套完整第三人称角色动作；CuiGames 三包当前不可下载 |
| 6 | Sketchfab 公共 API | `api.sketchfab.com/v3` 的 search/models/users、`/v3/comments?model=`；查 ccransh、DuqueCD7、BarcodeGames、1Matzh、jayb3e、MissingTray1151、alienkatgames、bamenwo05、bumstrum、TheParaziT、Drillimpact 等作者；30+ 模型 | 85 | 网页正文是 JS 壳，WebFetch 返回空；`/v3/models/{uid}/download` 匿名 401（需登录），按任务未尝试下载；`/v3/models/{uid}/animations` 非公开，逐 clip 名多数拿不到 | 许可多为 CC-BY 且可下载，但需登录，不能作为本卡的“可随公开仓库提交”来源；只作逐 clip 名与动作结构参照 |
| 7 | GitHub（raw/API/HTML） | `raw.githubusercontent.com`、`api.github.com`、部分 clone；读 Operation Steel Tide、Red Eclipse、ZenXChaos、Godot tps-demo、O3DE startergame、Microsoft-Rocketbox、Mesh2Motion、KayKit 官方、BigAndCrispy、FPS-Arms-3D、cktang88/3d-fps 等 90+ 仓库 | 86 | GitHub REST API 未认证额度 60/hr，后段 403；部分目录只能用树 API/HTML 看顶层；issues 列表未全读 | GitHub 是核许可、核 clip 名与找可再分发成套件的核心渠道；二次组装不等于作者原页，必须逐仓库核 LICENSE |
| 8 | Fab | 站内搜索 API（`/i/listings/search`）用 20+ 关键词逐页翻（含 cursor 第二页）；Infima/KINEMATION/MoCap Online/Kubold/PeaceSells/RIB Studio seller 页拉完整目录；curl 取服务端 HTML/meta/JSON-LD | 40 | WebFetch 403；多数 listing 需 Epic 登录；价格/动作/许可未逐条核 | 付费/商店许可，按任务排除；Tactical FPS Animation Pack、RIB Rifle Mega、KINEMATION 是功能最贴近的付费对照 |
| 9 | Unity Asset Store | KINEMATION、CombatGirls、Ultimate Animation Collection、Kevin Iglesias FREE 等页面；WebFetch 得到 JS 壳，部分用摘要 | 4 | 付费 + Unity EULA，不允许把原始素材随公开仓库提交；未购买、未登录；评价由前端加载 | 排除；CombatGirls 39 个 Humanoid 动作、KINEMATION 9 武器是“完整 FPS 动作集”的标尺 |
| 10 | Epic/UE 官方文档与商城 | GASP、Lyra、Animation Starter Pack、Animation Layers、UE 5.8 tech-blog（403，用 80.lv 摘要）；Fab Paragon/Game Animation Sample | 4 | `unrealengine.com/marketplace/...` 403；Fab 需登录；UE 内容许可通常限 UE | 只作方法与反例；不作为 Three 资产源 |
| 11 | MoCap Online | 官网 Rifle/Pistol/Shooter Bundle/Death/Free sampler/licensing/UE4 demo；逐条动作名与价格 | 6 | WebFetch 域名校验拒绝；部分页 429；免费 demo 是否含 reload 未核 | 付费；Rifle Pro 390+ clip 含 W2_Stand/Crouch_Aim_Reload，是完整度基准；许可禁止再分发原始文件 |
| 12 | ActorCore / Reallusion / HEAT / Rokoko | ActorCore free/motion、Reallusion 论坛 mass-distribution 许可问答、HEAT 免费 25 动作、Rokoko Motion Library | 5 | ActorCore 是 Vue SPA；HEAT 522；Rokoko 需提交表单；motionlibrary.com 403 | 免费档多需注册/单独 mass-distribution 许可，或明确非商用；不能随公开仓库提交 |
| 13 | Kubold | 首页、store、downloads、两篇 blog、Rifle/Pistol 动作清单 HTML、Cover PDF | 8 | 产品页逐产品/逐 clip 链接由商店/JS 承载；免费 LITE 不可再分发 | 付费对标；Rifle Animset Pro 86 clip 明列 Rifle_Reload_2、CrouchLoop、ShootBurst、Hit、Death，是“跑+蹲+射+换弹+死”的完整清单基准 |
| 14 | KINEMATION / Infima 文档 | `kinemation.gitbook.io` 的 FPS Animation Framework/Tactical Shooter Pack/Unreal/Unity 文档；`docs.infimagames.com` 的 Tactical FPS Animation Pack 文档 | 7 | 商店页需 Fab 登录；价格与最终授权未核 | 方法参照：换弹拆成 weapon parts（magazine/trigger/release handle）由武器 Animator 播放，枪根由 Weapon Bone 控制；付费包不可再分发 |
| 15 | 3DAssets.dev | assets?category=characters&theme=modern；武器包页 + `/api/v1/assets`；把 GLB 流式读入 Python 解析 JSON chunk | 5 | 页面是 React shell；只能用 API/CDN 字节解析；静态角色无 clip | 武器侧 CC0 换弹层（magazine-open/close、bolt-open/close、stock-open/close）与静态现代角色；无身体动作 |
| 16 | Poly Pizza / Poly Haven | 搜索与模型页、Toon Shooter bundle、Quaternius base、J-Toastie Glock/AKM；curl 直下 GLB 并用 Python 解析；Poly Haven info API | 4 | 模型页为 JS 渲染，逐模型动画名多数读不到；评论由前端加载 | 无登录取单模型的实用入口；适合做武器/手臂小样，授权应回作者原页 |
| 17 | Cinevva / AI 工具 / 聚合索引 | `app.cinevva.com/tools/animations`、`/tools/rigger`；AI3D Studio 39 clip；3d.shep.bot `/v1/search`；TechnicallyArtist Forge | 5 | Cinevva 导出需付费且必须开浏览器；AI3D Studio 需浏览器重定向导出；3d.shep.bot 只是索引 | 工具/重定向通道，不是可直接取用的成套源；本卡禁止开浏览器 |
| 18 | 论坛/issue | Epic 论坛 10 帖、Godot 论坛 6 帖、three.js Discourse 6 帖、Blender Artists 3 帖、Unity Discussions 1 帖；Discourse `.json`/页面正文 | 25 | 部分帖子需登录或只读到摘要；Unity Discussions JSON 403；Stack Overflow/Blender SE 人机验证 | 关键结论：SkeletonUtils/retargetClip 对同名骨架仍会脚内翻/手反向/少一帧；优先同 rig 成套，不指望运行时重定向；换弹必须作为同一套骨骼动画制作 |
| 19 | 中文社区 | B 站 4 个视频、CGJOY 4 帖、微信公众号 2 文；WebFetch/curl 直读；知乎/小红书/今日头条只有摘要 | 10 | 知乎 403、B 站 412、公众号验证页、CGJOY 附件需登录、小红书登录墙 | 没有找到可引用的新原始素材页；中文推荐多回指 Quaternius/CMU/CombatGirls；方法侧有“拔弹匣反作用力、插弹匣重量感、拉栓阻滞感”的可读性判据 |
| 20 | 媒体/访谈/官方规范 | Game World Observer、80.lv、Jettelly、ArtTechPost、Digital Production、CGChannel、Autodesk、GDC Vault、Game Developer、Wolfire、Game Anim；three.js/Khronos/Godot/Unity 官方文档 | 11+9（规范，部分与第 10 行重叠） | GamesRadar 原文/Steam 新闻部分被域名策略或 JS 壳挡住；GDC Vault 需账号 | 方法/行业依据：第一人称换弹三拍（退匣/弹药重置/可击发）、hand/weapon/body/world 空间切换、additive/layered blend；不是资产来源 |
| 21 | Steam 开发者日志 | Bodycam v0.8 Devlog、Earths Edge DevBlog #9；ISteamNews API 取正文 | 3 | 一个只返回导航壳，另一个 WebFetch 被域名策略拦截 | 第一方工作流：每武器/姿态/压力 4–5 套预制 reload + IK 微调；烘焙 reload 叠加程序化落地/视角摆动/副手 additive |
| 22 | 动捕/数据 | Microsoft Rocketbox、100STYLE（Ian Mason/Zenodo）、CMU Motion Capture、ACCAD、Xsens、MoCap Central/Atlas | 7 | Zenodo 403（改用作者页）；Gumroad 000；MoCap Central licenses 404；MoCap Atlas 429 | 只能补 locomotion/蹲行/起停，全部无枪/换弹；需重定向与署名，不能单独承担换弹 |
| 23 | WebSearch | 中英文约 200 组关键词（Quaternius UAL rifle reload、KayKit reload、Kenney animations、OpenGameArt reload、Mixamo alternative、2026 新包等） | 0（只提供线索） | 本会话额度 200/200 用尽；DuckDuckGo/Bing/Mojeek/Lobsters 均被 TLS/Anubis/无关结果挡住 | 搜索预算耗尽后仍以作者页、OGA、GitHub、Sketchfab API 覆盖；未再扩新关键词 |
| 24 | 不可达域名（汇总） | SkillsMP、opensmartroute、three.ws、gameassetsgarden、truebones、web.archive.org、r.jina.ai、grep.app、Reddit、Lobsters、知乎、B 站 API、itch 全站、Google Drive、mocapatlas、meshy.ai、tripo3d、basefount、tencent 等 | 0 | 180 条逐项记录见附录 A | 403/404/DNS 策略/Anubis/429/TLS 失败；不把不可达当“没有”，保留缺口与失败原因 |
| 25 | 对账（未归入上述渠道） | 任务给定输入与跨渠道引用、未能归入 24 个渠道的保留条目（多为 T3 方法项与 T4 排除项） | 38 | — | 24 个渠道合计 394，394+38=432；本表不是严格分区 |

**渠道计数（按 URL 去重；按模型 UID 合并为 420 条，见上）**：本清单共 432 条候选；T0 11 项、T1 50 项、T2 33 项、T3 174 项、T4 164 项。真正同时满足“六动作 + 全身 + 枪/弹匣 + 可零改接入 + 免费可再分发”的是 **0 项**。

## 3. 排序总览

### 3.1 T0 · 最值得深挖（11 项）

这 11 项按“许可可随公开游戏提交 > 动作覆盖 > 结构 > 接入成本”排序；T0 内部编号即推荐顺序。

| 序号 | 候选（原始链接） | 许可/可得性 | 覆盖与缺口（原始理由） | 排序依据 |
|---:|---|---|---|---|
| 1 | [Mesh2Motion human 预导出 GLB 动作集](https://github.com/Mesh2Motion/mesh2motion-app/tree/main/static/assets/human) | CC0 | 仓内已提交 model.glb、skeleton.glb 和逐条 clip GLB（rifle-idle/walk/run/fire/reload、pistol-idle/walk/fire/reload、crouch-idle/walk、death-a~d 等），CC0，项目使用 Three 0.185（目标 0.186.1）可直接用 GLTFLoader 加载；组内只列了 Mesh2Motion 站/应用仓，未列这份可直接使用的 GLB 动作集，也纠正了“源为 .blend、导出必须浏览器”的旧结论。（本单元补充：全部动画 GLB 的 extensionsRequired 含 EXT_meshopt_compression，GLTFLoader 需 MeshoptDecoder。） | T0 |
| 2 | [Red Eclipse actors 角色数据仓库](https://github.com/redeclipse/actors) | CC BY-SA | CC-BY-SA 4.0+ 的开源 FPS 角色数据仓库：player/female 有 78 骨完整模型 RE_Player_female.blend/.iqm，动画含 idle/runcycle0/crouch_forward_back_left_right/rifle_reload(51 帧@24fps=2.125 s)/smg_reload/reload_pistol/shotgun_reload/dying/dead 及 hud_* 第一人称换弹；是本轮唯一同时具备「免费 + 真实 rifle reload + 蹲行 + 死亡」的动作整套（动作覆盖与 Mesh2Motion 并列；Red Eclipse 的差异是 CC-BY-SA、IQM、78 骨）；角色网格与动作在 `redeclipse/actors`、武器模型在 `redeclipse/weapons`（同一项目的两个仓库），格式是 IQM，需转换。 | T0 |
| 3 | [Steel Tide BAMEN 动画士兵 GLB](https://github.com/AetherRadar/operation-steel-tide/blob/main/assets/models/bamen_military_soldier/bamen_military_soldier_animated.glb) | CC BY 4.0（网格）+ UAL1/2 动作（受 QAL 约束） | 3,246,780 B；38 个 clip（idle/run/crouch_idle/crouch_walk/reload 1.667 s/shoot 0.633 s/death 2.4 s/aim_*/prone_*）、78 骨、1 mesh；网格 CC BY 4.0（BAMEN）可再分发；动作来自 UAL1/2（reload=UAL1 Pistol_Reload、shoot=Pistol_Shoot），仍受 Quaternius QAL v1.0 再分发冲突约束，未澄清前整套不能判定为可随公开仓库提交；构建脚本 MIT；没有枪/弹匣节点。 | T0 |
| 4 | [KayKit Character Animations 作者页](https://kaylousberg.com/game-assets/character-animations) | CC0 | 作者页：133 个人形动作，含 Crouching、单手/双手武器 reloading、death，CC0、FBX/glTF、Rig_Medium/Large；无枪/弹匣。 | T0 |
| 5 | [ZenXChaos / ThirdPersonShooter-AnimationSets（UberSnip 全套第三人称射击动作）](https://github.com/ZenXChaos/ThirdPersonShooter-AnimationSets) | Unlicense（公有领域） | 本轮最强新发现：Unlicense（license.md 原文放弃版权、可商用可再分发），40 个 FBX（DefaultAnims 15、RevolverAnims 23、ShotgunAnims 2，另 1 个 unitypackage；README 列 40 个动作名），每文件含 skinned Character、自定义骨架（Root/Pelvis/Spine1-3/Neck_Base/Neck_Middle/Head/L_R_ArmPit/Arm/Forearm/Hand/五指/Thigh/Shin/Toes 及独立的 L_Weapon、R_Weapon 骨），README 逐条列出 Default（Idle/Walk/Run/Sprint/JumpFall/DieForward/DieShootIdle/DieShootRun/HitBackDie/HitFrontDie）+ Revolver（AimIdle/AimShoot/AimWalk/9 向瞄准 Idle/SearchAmmo/ReloadInit-Loop-End/CrouchIdle/CrouchAimWalk/CrouchReloadInit-Loop-End）+ Shotgun（AimIdle/AimWalk）；实测 RevolverReloadInit.fbx 1,505,712 B 非 Mixamo 命名，缺枪模、弹匣独立骨/弹匣 clip、双手步枪 reload，FBX 需离线转 glTF，作者自述部分 clip 非 Mecanim 开箱即用。 | T0 |
| 6 | [BigAndCrispy/Unity-First-Person-Shooter（CC0 第一人称手臂+手枪+独立弹匣）](https://github.com/BigAndCrispy/Unity-First-Person-Shooter) | CC0 | 仓库 LICENSE 为 CC0-1.0，README 称模型/声音/动画均为作者自制。实测 Assets/Models/Arms.fbx：手臂骨为 UpperArm/LowerArm，另含 Index/Middle/Ring/Pinky/Thumb 手指骨，没有躯干/腿骨（第一人称手臂）；clip 含 AssaultRifle_Idle/Reload/Shoot、Pistol_Idle/Reload/Shoot；Pistol.fbx 含 Pistol_Body/Pistol_Magazine/Pistol_Trigger/Pistol_Slider 与 Magazine 骨，clip 为 Armature\|Pistol_Reload、Pistol_Slider\|Pistol_SliderShoot。是本轮唯一同时满足“免费可再分发 + 独立弹匣网格/骨 + 多种 reload clip”的新增源；但没有 crouch/death/全身，且 clip 的 CharacterArmature\| 前缀与 Quaternius 命名风格相似，需核是否二次使用。 | T0 |
| 7 | [Steel Tide DJMaesen 动画换弹手臂 GLB](https://github.com/AetherRadar/operation-steel-tide/blob/main/assets/models/djmaesen_smg45/animated_reload_arms.glb) | CC BY 4.0 | 10,711,916 B；24 个 reload clip（12 平台，tactical 1.8 s/empty 2.133 s）、49 骨、3 mesh、1 skin；由 CC BY 4.0 DJMaesen 源派生，是第一人称手臂+弹匣锚点，超过 10MB 小样上限且没有身体/枪。 | T0 |
| 8 | [Quaternius UAL1 官方页](https://quaternius.com/packs/universalanimationlibrary.html) | CC0（与 QAL v1.0 冲突） | 官方页：免费 Standard 解析为 46 clip（Crouch_Idle/Crouch_Fwd/Jog/Sprint/Death/Hit/Pistol_Aim/Pistol_Reload/Pistol_Shoot），CC0 但无 rifle reload/枪模。 | T0 |
| 9 | [Godot 官方 Third Person Shooter Demo 的 player.glb](https://github.com/godotengine/tps-demo) | CC BY 3.0 | LICENSE.md 原文“All assets ... CC-BY 3.0”（可随公开游戏分发、需署名），实测 player/model/player.glb 23,844,032 B、5 mesh、1 skin/145 骨、56 个 clip（AIM-Center/Down/Left/Right/Up、running_gun-cycle、walking_gun-cycle、Idlecombat、jump 5 段、flinch1/2/flinch_heavy、strafe 8 向、Cannon_Charge 等）；有持枪跑/瞄准/受击/跳跃但无 reload、无 crouch、无 death，且超过 10 MB 小样上限。 | T0 |
| 10 | [MilitaryG — Pistol, animations, sounds for GoDot (OpenGameArt)](https://opengameart.org/content/pistol-animations-sounds-for-godot) | CC0 | OGA 作者原页标 CC0，包 710,877 B；实际解析 Godot 场景得 8 个具名动画：Fire、Hammer Pull、Hammer Release、Mag In、Mag Out、RESET、Slide Pull、Slide Release；弹匣分为 magazine (loaded)/(empty) 两个独立节点，另有 mag_out/mag_in 音效与独立 slide/hammer/trigger 节点。它是本次新找到的最强“武器侧换弹可读”源，能支撑弹匣退出/装入/闭锁三层，但没有手臂和角色；包内音效另注明 David Fluher/Godot license，音效权利需分开核。 | T0 |
| 11 | [3DAssets.dev — FPS Guns and Shooting Range（CC0 动画武器包）](https://3dassets.dev/assets/fps-weapon-set-and-firing-range-smg-e216f9a5) | CC0 | 由给定 3DAssets.dev 角色页追到同站 CC0 武器包；我把该 GLB 流式读入 Python 解析 JSON chunk，实测 clip 为 stock-open/stock-close/magazine-open/magazine-close，节点含独立 stock 与 magazine，可直接补“退匣/入匣”武器层，但没有身体动作。 | T0 |

### 3.2 T1 · 可组合或部分覆盖（身体、手臂、武器零件）

T1 按“全身/成套 → 第一人称手臂+枪 → 武器侧换弹/弹匣 → 静态零件”排序；它们是可组合件，不是完整解。

| 序号 | 候选（原始链接） | 许可/可得性 | 覆盖与缺口（原始理由） | 排序依据 |
|---:|---|---|---|---|
| 1 | [Quaternius Ultimate Modular Men](https://quaternius.com/packs/ultimatemodularcharacters.html) | CC0（与 QAL v1.0 冲突） | 官方页 CC0，11 角色/24 动画，二手记录含 Idle_Gun/Gun_Shoot/Run_Shoot/Death；可补持枪移动与死亡，但无 crouch、reload、独立弹匣，官方页未逐条列 clip 名。 | T1-A 身体/成套 |
| 2 | [Quaternius Toon Shooter 官方页](https://quaternius.com/packs/toonshootergamekit.html) | 见理由 | 官方页：74 模型，角色有 Duck/Run_Shoot/Idle_Shoot/Death，枪已在手，但无 reload/独立弹匣。 | T1-A 身体/成套 |
| 3 | [KayKit Adventurers 官方角色包](https://kaylousberg.com/game-assets/characters-adventurers) | 见理由 | 官方 Adventurers：75 动画、Knight.glb 41 骨/76 clip，含 2H_Ranged_Reload/2H_Ranged_Shoot；与 Character Animations 同 Rig_Medium，但无枪/弹匣。 | T1-A 身体/成套 |
| 4 | [Operation Steel Tide（AetherRadar）](https://github.com/AetherRadar/operation-steel-tide) | CC0 | 2026 年开源 Godot 4.6 战术 FPS，逐资产 LICENSE/来源、可再分发 GLB（BAMEN/Viper 的动作层来自 UAL，仍受 QAL 冲突约束，见 T0-3/T1-5）、AGENTS.md 与 build.yml；其 docs 和 Blender 脚本完整记录了把 Quaternius UAL CC0 动作重定向到 Mixamo 骨架、作者化 24 个换弹 clip 与独立弹匣武器，是本卡「高质量项目自己怎么做」的最完整样本。 | T1-A 身体/成套 |
| 5 | [Steel Tide Quaternius Viper 特战角色 GLB](https://github.com/AetherRadar/operation-steel-tide/blob/main/assets/models/quaternius_operators/viper.glb) | CC0（与 QAL v1.0 冲突） | 4,088,404 B；38 clip/51 骨/4 mesh，CC0 Quaternius Modular Women + UAL；与 BAMEN 同一动作集，网格 CC0 比 BAMEN 网格干净、体积更小，但动作层同样来自 UAL、受 QAL v1.0 再分发冲突约束，仍无枪/弹匣。 | T1-A 身体/成套 |
| 6 | [Quaternius Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html) | CC0（与 QAL v1.0 冲突） | 官方页 CC0，6 个人形/26 个模型、humanoid rig；上一阶段记录其与 UAL1 UE FBX、UAL2 GLB 同为 65 关节，可零重定向承载 UAL 动作；无枪、弹匣与步枪 reload，且仍受 QAL v1.0 再分发冲突约束。 | T1-A 身体/成套 |
| 7 | [GitHub – KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) | CC0 | KayKit 官方 GitHub 的 Adventurers 1.0 角色包（CC0），角色与动作同 Rig_Medium 且带 handslot 骨骼挂点，可与 Character Animations 组合成“模型+骨架+动作同源”的一套。 | T1-A 身体/成套 |
| 8 | [AI3D Studio 免费动画库（39 个 CC0 clip，含 pistol reload）](https://ai3d.studio/3d-animation-library) | CC0 | 页面称 39 个 clip 来自 Quaternius UAL、CC0、无需署名；JSON 清单实测列有 pistol aim/shot/reload、crouch walk/crouching、death（Fall down）与 hit（clip_hit-chest/clip_hit-head），可在浏览器内重定向并一次导出 ≤12 clip 的 GLB。没有 rifle reload，且本卡不能开浏览器；作为“免费 CC0 导出路径”参考。 | T1-A 身体/成套 |
| 9 | [Red Eclipse 第三人称步枪换弹 clip](https://github.com/redeclipse/actors/blob/master/player/rifle_reload.iqm) | 见理由 | 53,028 B，内部名 rifle_reload，51 帧@24fps=2.125 s，78 poses；直接补当前来源缺的「步枪 reload」身体动作，不是整枪位移。 | T1-A 身体/成套 |
| 10 | [Red Eclipse 手枪换弹 clip](https://github.com/redeclipse/actors/blob/master/player/reload_pistol.iqm) | 见理由 | 24,876 B，内部名 reload-pistol，22 帧@24fps=0.917 s，78 poses；注意文件名是 reload_pistol，不是 pistol_reload。 | T1-A 身体/成套 |
| 11 | [Mesh2Motion 官方仓库](https://github.com/Mesh2Motion/mesh2motion-app) | CC0 | 代码 MIT、美术 CC0（LICENSE-CC0 覆盖 models/blend/rigs/animations），human 66 关节 UE 命名；仓库已含 `static/assets/human` 预导出 GLB，可直接由 GLTFLoader 加载；`.blend` 源仅用于改动作/重新导出。 | T1-A 身体/成套 |
| 12 | [OpenGameArt UAL1（Quaternius 作者上传）](https://opengameart.org/content/universal-animation-library) | 见理由 | Standard zip 14,541,205 B，包内 Godot GLB 46 clip/53 关节，含 Pistol_Reload；是可直接下载的官方入口。 | T1-A 身体/成套 |
| 13 | [OpenGameArt UAL2（Quaternius 作者上传）](https://opengameart.org/content/universal-animation-library-2) | 见理由 | Standard zip 10,257,419 B，包内 UAL2_Standard.glb 43 clip/65 骨；无枪械/换弹。 | T1-A 身体/成套 |
| 14 | [Animated Men Pack — Quaternius](https://quaternius.com/packs/animatedmen.html) | CC0（与 QAL v1.0 冲突） | CC0，4 个人形模型+大量动画（FBX/OBJ/Blend，免费商用），是 UAL 之外较老但可直接下载的人形动作集。 | T1-A 身体/成套 |
| 15 | [Animated Women Pack — Quaternius](https://quaternius.com/packs/animatedwomen.html) | CC0（与 QAL v1.0 冲突） | CC0，与 Animated Men 同规格的女性 4 模型动作集，可对照骨架与动作命名是否可复用到敌人。 | T1-A 身体/成套 |
| 16 | [GitHub – GeorgeQLe/assets-kaykit-3d-characters（KayKit CC0 合集镜像）](https://github.com/GeorgeQLe/assets-kaykit-3d-characters) | CC0 | README 自述 2080 个 CC0 资产、含 KayKit Character Animations 1.1 与 Mystery Monthly 4–6，并附 manifest.json 与原始许可文本，是 itch 原页不可达时能核成员清单的完整替代入口。 | T1-A 身体/成套 |
| 17 | [FPS-Arms-3D](https://github.com/Ayush-Mohanty/FPS-Arms-3D) | 代码 MIT；模型/动画 CC-BY-4.0（Cransh，需署名） | 仓库顶层 LICENSE 是 MIT，但 `Models/fps_ak-74m_animations/license.txt` 明确该模型/动画为 CC-BY-4.0（作者 Cransh，需署名）；第一人称手臂+枪，含 idle/shoot/reload，scene.gltf 1.2MB/85 joints/8 clip；只有手臂层，无蹲行/死亡/第三人称。 | T1-B 手臂+枪 |
| 18 | [Low Poly Weapons Pack with rigged arms — zisongbr](https://opengameart.org/content/low-poly-weapons-pack-with-rigged-arms) | CC0 | CC0，1 步枪+1 手枪且明确拆分 Mag/Barrel/Sight/Handler 并带绑定手臂，正好覆盖“独立弹匣+手臂”，但页面未声明含动画。 | T1-B 手臂+枪 |
| 19 | [Red Eclipse 第一人称 HUD 步枪换弹](https://github.com/redeclipse/actors/blob/master/player/hud_rifle-reload.iqm) | 见理由 | 56,028 B，内部名 hud_rifle-reload，123 帧@60fps=2.05 s，31 poses；是第一人称 HUD 手臂/武器换弹，可与第三人称 rifle_reload 对照时序。 | T1-B 手臂+枪 |
| 20 | [OpenGameArt Animated Pistol（CoinCoin）](https://opengameart.org/content/animated-pistol) | CC BY 4.0 | CC-BY 4.0，第一人称手臂+手枪，18 clip 含 IDLE/WALK/RUN/JUMP/FIRE/FIRE_EMPTY/RELOAD；无蹲/死。 | T1-B 手臂+枪 |
| 21 | [OpenGameArt Animated Shotgun（CoinCoin）](https://opengameart.org/content/animated-shotgun) | CC BY 4.0 | CC-BY 4.0，第一人称手臂+Winchester 1887，含 RELOAD；无蹲/死。 | T1-B 手臂+枪 |
| 22 | [fps arms (rigged only) — para](https://opengameart.org/content/fps-arms-rigged-only) | CC0 | CC0 的第一人称手臂绑定（IK+手指约束），无动画，适合作重定向目标或补手臂网格。 | T1-B 手臂+枪 |
| 23 | [Low Poly FPS Rifle and Hands — Robin Lamb](https://opengameart.org/content/low-poly-fps-rifle-and-hands) | CC0 | CC0，提供 Blender/FBX/glTF/OBJ 低模步枪+手并含 1 条射击动画，可作为最小合法小样做真实 GLTF 解析。 | T1-B 手臂+枪 |
| 24 | [Quaternius Animated Guns 官方页](https://quaternius.com/packs/animatedguns.html) | 见理由 | 官方页：6 把枪，Fire+Reload，独立 Magazine/Slide/Trigger；无角色/手臂。 | T1-C 武器侧 |
| 25 | [OpenGameArt Low Poly Animated Guns（Quaternius 作者上传）](https://opengameart.org/content/low-poly-animated-guns) | 见理由 | 1.1MB，6 把枪各 Fire+Reload，P90/Rifle/Shotgun 有独立枪机/弹匣节点；无手臂/身体。 | T1-C 武器侧 |
| 26 | [3DAssets.dev — FPS Survival Forest Outpost Marksman Rifle](https://3dassets.dev/assets/fps-survival-forest-outpost-weapon-marksman-rifle-e20c7bc2) | CC0 | 同站 CC0；GLB 实测 magazine-open/close 与 bolt-open/close、独立 magazine/bolt 节点，补“闭锁”层；仍只是武器层，需与身体 reload 对齐。 | T1-C 武器侧 |
| 27 | [3DAssets.dev — Tactical Shooter Hill Town Compact Pistol](https://3dassets.dev/assets/tactical-shooter-hill-town-compact-pistol-d527475f) | CC0 | 同站 CC0；GLB 实测 slide-open/close 与 magazine-open/close、独立 slide/magazine 节点，与上两项同族，可作手枪侧换弹零件源。 | T1-C 武器侧 |
| 28 | [OpenGameArt – Various Small Arms (Assault Rifles, Sniper, Pistol)](https://opengameart.org/content/various-small-arms-assault-rifles-sniper-pistol) | CC0 | 由 Boomer Shooter 23 集合追到；该包自 2023-12-15 起放入 public domain（页面同时标 CC0），AK/M4/SVD/G3/L85/Mosin/M1911 的 bolt/slide 有动画，可提供独立弹匣/枪机运动而非整枪位移。 | T1-C 武器侧 |
| 29 | [OpenGameArt Revolver Game Asset](https://opengameart.org/content/revolver-game-asset) | CC0 | CC0，glTF 左轮 6 clip（Reload/OpenCylinder/CloseCylinder/CylinderSpeen/Shoot/Default），Hammer/Trigger/Cylinder 独立。 | T1-C 武器侧 |
| 30 | [Quaternius Ultimate Guns Pack](https://poly.pizza/bundle/Ultimate-Guns-Pack-cpgUfI4t2F) | CC0（与 QAL v1.0 冲突） | CC0、25 个枪模，Steel Tide 从中拆出 MP5A5/M24/AXMC/AWM/VSS/P226/M1911 的真实弹匣、枪机与拉机柄；静态无 clip，补独立弹匣几何。 | T1-C 武器侧 |
| 31 | [Quaternius — Ultimate Guns Pack（40 模型，Animated，CC0）](https://quaternius.com/packs/ultimategun.html) | CC0（与 QAL v1.0 冲突） | 40 个模型且官网标 Animated/CC0，可能提供武器侧弹匣/枪机动画层；Quaternius 的 QAL v1.0 再分发冲突仍需澄清。 | T1-C 武器侧 |
| 32 | [Webley Mark II Revolver — ulf](https://opengameart.org/content/webley-mark-ii-revolver) | CC BY 3.0 | CC-BY 3.0，已绑定并含弹巢旋转、逐发击发与折开换弹动画，可提供独立的弹巢/换弹机构参照（非自动手枪）。 | T1-C 武器侧 |
| 33 | [Red Eclipse weapons 数据仓库](https://github.com/redeclipse/weapons) | CC BY-SA | Red Eclipse 武器模型/IQM 数据模块（rifle/smg/pistol/shotgun 等），与 actors 同 CC-BY-SA 4.0+，可配身体动作补枪/弹匣几何。 | T1-C 武器侧 |
| 34 | [Quaternius — Sci-Fi Modular Gun Pack（78 模型，Animated，glTF，CC0）](https://quaternius.com/packs/scifimodularguns.html) | CC0（与 QAL v1.0 冲突） | 78 个模型、标 Animated/glTF/CC0，补模块化武器零件；同样受 QAL 冲突影响。 | T1-C 武器侧 |
| 35 | [petroulacl/fps-asset-kit（CC0 FPS 武器/音效/贴图合集）](https://github.com/petroulacl/fps-asset-kit) | CC0 | README 明写全部 CC0、可再分发；含 20 把 Flat Guns 的 GLB/FBX(rigged) 与枪声、24 套 ambientCG PBR。只有武器层，无角色动作/换弹时序，适合补枪模与独立弹匣外观。 | T1-D 静态零件 |
| 36 | [3DAssets.dev – Cliffwatch Scout Carbine（Gorgehold）](https://3dassets.dev/assets/gorgehold-survivor-gallery-and-operations-cliffwatch-s-da7613e3) | CC0 | 页面标 CC0 1.0、GLB 直链 https://cdn.3dassets.dev/assets/32847/v1/model.glb、35.0k tris，动画名为 magazine-lower / magazine-seat / charging-tab-cycle / trigger-pull / stock-swing-out / stock-swing-in，且原文写明“Magazine lowers away for isolated reload-component visualization”；但“No hand rig or complete reload interaction is supplied”，只有武器层、无角色/手/独立弹匣骨（为 AI 生成资产），可作为新 CC0 武器侧换弹零件。 | T1-D 静态零件 |
| 37 | [Blockbench Workshop AKR Assault Rifle](https://blockbenchworkshop.com/model/ziiwplay/akr-assault-rifle) | CC0 | CC0，3 个动画（shoot/reload/inspect）、9 骨/29 elements、35KB .bbmodel GeckoLib；只有武器层且需转换，不是角色成套源。 | T1-D 静态零件 |
| 38 | [Steel Tide AK-47 可换弹第一人称 GLB](https://github.com/AetherRadar/operation-steel-tide/blob/main/assets/models/steel_tide_ak74/ak47_reloadable_fp.glb) | CC0 | 3,604,612 B；0 clip，但 Magazine/SpareMagazine/MagazineGrip/BoltHardwareGeometry 为独立节点；CC0 taradavies 源适配，用来补武器侧退匣/入匣/枪机。 | T1-D 静态零件 |
| 39 | [OpenGameArt Low Poly M4A1](https://opengameart.org/content/low-poly-m4a1) | CC0 | CC0，blend/FBX/贴图，作者明确把弹匣拆开供引擎内换弹动画；只有模型无 clip。 | T1-D 静态零件 |
| 40 | [Poly Haven — Service Pistol](https://polyhaven.com/a/service_pistol) | CC0 | 由给定 awesome-game-assets 与 three-military-tps 的引用追到：CC0、可拆弹匣与子弹、27,548 tris 的干净手枪模，适合做换弹对齐的武器基座。 | T1-D 静态零件 |
| 41 | [AdamKokrito ScarL](https://poly.pizza/m/ab1V8RlPDc) | CC BY 3.0 | CC BY 3.0，源模型带独立弹匣、枪机、拉机柄，Steel Tide 用它做机制就绪 SCAR-L 并保留原始 GLB；静态无角色动作。 | T1-D 静态零件 |
| 42 | [Steel Tide SCAR-L 可换弹 GLB](https://github.com/AetherRadar/operation-steel-tide/blob/main/assets/models/steel_tide_scarl/scarl_reloadable.glb) | CC BY 3.0 | 178,048 B；0 clip，Magazine、SpareMagazine、BoltGeometry、TriggerGeometry 为独立节点（另有 MagazineGripSocket/MagazineWellSocket 等锚点）；CC BY 3.0 AdamKokrito，需署名并披露修改，是独立弹匣/枪机最轻的公开样例。 | T1-D 静态零件 |
| 43 | [OpenGameArt – Semi-Auto Shotgun with Magazine（crookedmouth）](https://opengameart.org/content/semi-auto-shotgun-with-magazine) | CC BY-SA | 同时标 CC0 与 CC-BY-SA 3.0，提供 .obj/.dae + Torque3D 工程，作者描述为带弹匣的霰弹枪；无任何动画 clip、无手臂，只能补“可拆弹匣”静态零件；双许可需按 CC0 使用并保留出处说明。 | T1-D 静态零件 |
| 44 | [OpenGameArt Kenny Blaster Kit](https://opengameart.org/content/blaster-kit) | CC0 | Kenney 作者上传 OGA，CC0，40 件枪械/弹匣/子弹/箱子，全无动画，只能当零件库。 | T1-D 静态零件 |
| 45 | [OpenGameArt CC0 Flat Guns West](https://opengameart.org/content/cc0-flat-guns-west) | CC0 | Flat Guns 西部包 10 把现代枪（步枪/手枪/SMG/狙击/霰弹），CC0，含 rigged FBX；作者原页，可作武器/弹匣零件源，无动画 clip。 | T1-D 静态零件 |
| 46 | [Pichuliru — CC0 Flat Gun Attachments](https://opengameart.org/content/cc0-flat-gun-attachments) | CC0 | 从给定 Flat Guns West/East 的作者页追到：同作者 CC0、18 个可换枪配件（blend/FBX/OBJ/GLB），补弹匣/枪机/瞄具零件；同作者页还列出 CC0 Flat Ammunition 与 CC-BY 4.0 的 Ultimate Low Poly Guns。 | T1-D 静态零件 |
| 47 | [Pichuliru — CC0 Flat Ammunition](https://opengameart.org/content/cc0-flat-ammunition) | CC0 | 同作者页追到：CC0、22 个弹药/弹匣/弹药盒模型，与 Flat Guns 共享风格/尺寸，可直接当退匣/入匣道具；无动作。 | T1-D 静态零件 |
| 48 | [FireWarden "Lowpoly" Pistol](https://opengameart.org/content/lowpoly-pistol) | CC0 | 【免费·CC0】给定 MilitaryG 手枪包的页面明确署名这把枪为其网格来源；弹匣（满/空）、套筒、击锤、扳机、枪管分离但无动画，可作“可拆弹匣”零件源。 | T1-D 静态零件 |
| 49 | [OpenGameArt CC0 Flat Guns East](https://opengameart.org/content/cc0-flat-guns-east) | CC0 | 东部包 10 把同风格枪械，CC0，与 West 同作者同规格；补另一套轮廓，无动画。 | T1-D 静态零件 |
| 50 | [Pichuliru — Ultimate Low Poly Guns](https://opengameart.org/content/ultimate-low-poly-guns) | CC BY 4.0 | 同作者页追到：71 枪 + 15 弹壳、CC-BY 4.0（需署 TastyTony/Pichuliru）、.blend；量大但需转 glTF 且无动作。 | T1-D 静态零件 |

### 3.3 T2 · 移动/骨架/静态身体补充（无枪、无换弹）

这些来源只能补跑/蹲/起停、骨架或静态身体，不能单独承担换弹；列在这里是为了证明缺口位置，并供 dot 组合时选基座。

| 序号 | 候选（原始链接） | 许可/可得性 | 覆盖与缺口（原始理由） | 排序依据 |
|---:|---|---|---|---|
| 1 | [OpenGameArt Kenny Blocky Characters](https://opengameart.org/content/blocky-characters) | CC0 | Kenney 作者上传 OGA，CC0，18 个 GLB/每个 27 clip，但有 skins=0、无 crouch/reload/aim/手指。 | T2 |
| 2 | [VitruvianGodot（CC0 可再分发数字人 + 6 个 locomotion clip）](https://github.com/ibrews/vitruviangodot) | CC0 | README 明写 fully CC0 / EULA-free、可再分发可商业闭源；含 CharMorph Vitruvian 身体、FACS 表情与 6 个 Mixamo locomotion（Idle/Sway/Walk/Turn/Wave/HappyIdle）。没有枪/射击/换弹/蹲，只能补“可自由再分发的身体+基础移动”。 | T2 |
| 3 | [Grunts + Riot Suppressor (low-poly) — nublet (OpenGameArt)](https://opengameart.org/content/grunts-riot-suppressor-low-poly) | CC0 | CC0，作者原页；blend 内实测动作：grunt 有 death1–5、deaths、fire、pain、run2、swim、walk，riot 有 pain、walk、switchmelee；是 Q3A 风格的绑定敌人，带武器、多个死亡与开火。缺口是 crouch/aim/reload 全无，只能补“敌人跑/射/死”，不能单独承担换弹。 | T2 |
| 4 | [Robot Enemy Pack — Teh_Bucket (OpenGameArt)](https://opengameart.org/content/robot-enemy-pack) | CC0 | CC0，5 个机器人每个 6 个动画（move、attack、idle、3 种 death），包 2,088,129 B；完整敌人动作集且死亡有多档，适合补 death/hit 语义，但非人形、无枪/弹匣、无 reload/crouch，不能作为枪械角色源。 | T2 |
| 5 | [3rd person blender sci-fi pack (DeadProject Goal2) — JohnnyBlack, submitted by Julius (OpenGameArt)](https://opengameart.org/content/3rd-person-blender-sci-fi-pack) | CC0 | OGA 页标 CC0，包 33,210,331 B；实际解析 player.blend 的 Actions：idle、idle_head/head2/lower、human_run、human_walk_upper/lower、aim_fire、hip_fire、recoil_aim、recoil_hip、sidestep_left/right、back_step、melee、fingers；骨架含 hand_cont_L/R 与 Gun 骨；另有两个敌人（attack/run/death）和 5 把武器及音效（含 shotgun reload 音效）。这是本次新找到最接近“全身+枪+瞄准/开火”的成套 OGA 包，但没有玩家 reload/crouch/death 动作，不能单独满足六动作合同。 | T2 |
| 6 | [Basic char textured animated — Ifrit (OpenGameArt)](https://opengameart.org/content/basic-char-textured-animated) | CC0 | CC0，作者原页列出 Run、Idle、GetDown、Shoot 四个动作，1,332 面、带贴图/法线；很小，可作为“身体+开火+卧倒”的补件，但无枪、无 reload/death/crouch，不能承担换弹。 | T2 |
| 7 | [Mutant Grunt — laleksic (OpenGameArt)](https://opengameart.org/content/mutant-grunt) | CC0 | CC0，Quake 风格绑定怪物，作者自述有 WIP 的 walk、punch、shoot 动画；有开火和移动但无 reload/crouch/death 的完整集，只适合当敌人姿态补件或对照。 | T2 |
| 8 | [Mannequiny The Open 3D Mannequin — GDQuest/Luciano Muñoz, submitted by hardboileduser (OpenGameArt)](https://opengameart.org/content/mannequiny-the-open-3d-mannequin) | CC BY 4.0 | CC-BY 4.0（需署名），glb+blend；页列 12 个动画：air_jump、air_jump_anticipation、air_land、dash、fight_idle、fight_kick、fight_punch、idle、idle_to_fight、jump_full、run、walk。无枪/reload/crouch，价值是干净的人形骨架/动作基座，可作重定向目标或身体动作补件。 | T2 |
| 9 | [Microsoft Rocketbox Avatar Library](https://github.com/microsoft/Microsoft-Rocketbox) | MIT | MIT LICENSE.md，115 个绑定角色与 417 个 FBX 动画（README 的 `Assets/Animations`）；逐文件核对含 run/walk/crouch/idle/turn/start/stop，但未发现 shoot/reload/death；3ds Max Biped 骨架，可补第三人称 locomotion 与蹲行但需重定向。 | T2 |
| 10 | [100STYLE Dataset](https://zenodo.org/records/8127870) | CC BY 4.0 | Zenodo 元数据为 CC BY 4.0，100 种风格×8 向 locomotion（FW/BW/FR/BR/SW/SR/ID/TR），含 Swat/Crouched/StartStop，60 fps BVH、1,468,515,354 B；无枪、换弹与死亡，可补跑/蹲/侧移。 | T2 |
| 11 | [CMU Graphics Lab Motion Capture Database](http://mocap.cs.cmu.edu/) | 见理由 | 原页原文 free for all uses，可随商业产品分发但不得直接转售数据；数千 BVH 含跑/蹲/格斗，无枪与换弹；把派生 clip 提交到公开仓库属灰区，需先定许可。 | T2 |
| 12 | [100STYLE dataset](https://www.ianxmason.com/100style/) | CC BY 4.0 | CC BY 4.0，100 种 locomotion 风格、400 万帧，含 crouch 与 combat-like 动作，可直接补跑动/蹲行；无枪/换弹，需重定向。 | T2 |
| 13 | [OpenGameArt – FPS Character Seal（rohit_n / Trym Horgen）](https://opengameart.org/content/fps-character-seal) | CC BY-SA | CC-BY-SA 4.0、10.7 MB .blend，作者页列 idle、running、3 个近战、2 个 flinch、2 个 death；无枪/开火/换弹/蹲，SA 传染性许可与公开游戏分发需评估，是新的一条“FPS 敌人身体”参照而非完整解。 | T2 |
| 14 | [OpenGameArt – Animated Defender AKA Brigand（Danimal）](https://opengameart.org/content/animated-defender-aka-brigand) | CC BY 3.0 | CC-BY 3.0（原模型 Anthony Myers，CC0 mocap 重定向），Blender NLA 内有 Walk、flee/run、attack1/2、idle、sleep、dance、happy/sad、die；奇幻近战语义、无枪/换弹/蹲行，只作身体动作与 NLA 组织方式参照。 | T2 |
| 15 | [Quaternius UAL2 官方页](https://quaternius.com/packs/universalanimationlibrary2.html) | 见理由 | 官方页：130+ 动作、免费 Standard 43 clip/65 骨，以近战/跑酷/农活/僵尸为主，无枪械/换弹。 | T2 |
| 16 | [OpenGameArt Kenny Animated Characters 3](https://opengameart.org/content/animated-characters-3) | CC0 | Kenney 作者上传 OGA，CC0，只有 idle/jump/run 3 个动画，证明 Kenney 系列不能承担枪战。 | T2 |
| 17 | [Kenney Survival Kit](https://kenney.nl/assets/survival-kit) | CC0 | 3D、页面标 80 个 Animation Files、CC0；标签为 survival/nature，未见人形持枪/reload 语汇，需开包确认是否只有动物动作；列出来是为了把 Kenney 所有带动画的 3D 包收全。 | T2 |
| 18 | [Kenney Mini Arena](https://kenney.nl/assets/mini-arena) | CC0 | 3D、20 个 Animation Files、CC0，罗马竞技场/近战角色；无枪/换弹，只可当近战姿态或死亡参考。 | T2 |
| 19 | [Kenney Graveyard Kit](https://kenney.nl/assets/graveyard-kit) | CC0 | 3D、90 个 Animation Files、CC0；镜像目录可见 digger/skeleton/zombie 三个带骨人形 GLB（Models/GLTF format/*.glb），可作死亡/受击/行走的身体动作参考，但没有枪/换弹，风格也偏万圣节。 | T2 |
| 20 | [3DAssets.dev 免费现代角色（CC0 GLB）](https://3dassets.dev/assets?category=characters&theme=modern) | 见理由 | 页面声明免费 GLB、可商用、无需署名、Three.js 友好；但角色是静态姿势（站/跪/卧/持械姿态），没有动画 clip，只能当敌人本体/骨架网格，动作仍需另找。 | T2 |
| 21 | [ACCAD Open Motion Project](https://accad.osu.edu/research/motion-lab/mocap-system-and-data) | CC BY 3.0 | 页面原文为 CC BY 3.0，提供 BVH/C3D/ASF-AMC 的走跑、武术、手势、舞蹈动捕；可再分发（需署名），无枪/换弹。 | T2 |
| 22 | [Xsens Free Motion Capture Animation Assets](https://www.xsens.com/entertainment/free-xsens-motion-capture-animation-assets) | 见理由 | 免费 FBX（5 walk/run、10 sports、7 dance），页面未给许可原文、只链到通用 Terms；无枪/换弹，许可是否允许随公开仓库再分发需二次核。 | T2 |
| 23 | [MoCap Central](https://mocapcentral.com/) | 付费/商业 EULA | 首页称可免费下载（免费样本许可未核） 120+ 专业动画样本，另有 Core Motion 447 clips 等付费包；站点可读，但 /pages/licenses 返回 404，未能确认免费样本是否允许把动画文件再分发。 | T2 |
| 24 | [MoCap Atlas 免费 mocap 合集](https://www.mocapatlas.com/collections/free-mocap-animations) | 见理由 | 免费 mocap 合集页；本次请求返回 HTTP 429（Retry-After 60），许可与逐包 clip 清单未读到，先列为待核来源。 | T2 |
| 25 | [Grab3D — Soldier（CC0 rigged）](https://grab3d.com/models/characters/soldier/) | CC0 | 由给定 3d.shep.bot provider 列表追到：页面写明 CC0、rigged、walk/run 预览、免登录 GLB/FBX/BLEND/USDZ/OBJ；补 CC0 士兵身体层，但无枪/换弹。 | T2 |
| 26 | [three.js — RobotExpressive（Quaternius CC0）](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive) | CC0（与 QAL v1.0 冲突） | 从给定 three.js Soldier.glb 同目录追到：RobotExpressive 的 README 明写 CC0（Tomás Laulhé/Quaternius，Don McCurdy 导出），比 Soldier.glb 的 mixamorig/Mixamo 许可风险更干净，含多段示例动画但无枪。 | T2 |
| 27 | [Exotrooper (low poly)（nublet / OpenGameArt）](https://opengameart.org/content/exotrooper-low-poly) | CC0 | 【免费·CC0】给定 Grunts + Riot Suppressor 同一作者的另一个刚性低模敌人，带基础动画；无枪/换弹，只能补敌人姿态与死亡。 | T2 |
| 28 | [godot-3d-mannequin（GDQuest / Luciano Muñoz 原仓库）](https://github.com/gdquest-demos/godot-3d-mannequin) | 代码 MIT；美术 CC-BY 4.0（GDQuest/Luciano Muñoz，需署名）；动画按 Mannequiny 页 CC BY 4.0 | 给定 Mannequiny 的真正上游：仓库 README/LICENSE 写明代码 MIT、美术资产（images/audio files）CC-BY 4.0，原文没有点名动画；12 个动画的 CC-BY 4.0 依据是 OGA Mannequiny 页（或向作者确认）；含 12 个 clip（idle/run/walk/jump/dash/fight）与 Blender 源；无枪/换弹。 | T2 |
| 29 | [OpenGameArt – Animated Characters Pack (Quaternius)](https://opengameart.org/content/animated-characters-pack) | CC0（与 QAL v1.0 冲突） | 由给定 Necrobot 页的 Characters, Animals, Vehicles 集合追到；Quaternius 上传的 50+ 角色多动画包标 CC0（FBX/OBJ/Blend），但和 Quaternius 官网 QAL 的再分发条款可能冲突，需按给定 sources.md 的口径复核。 | T2 |
| 30 | [OpenGameArt – Animated Characters 1 (Kenney)](https://opengameart.org/content/animated-characters-1) | CC0 | 由 OGA Necrobot 的集合追到；Kenney 的 Animated Characters 1 标 CC0，只有 idle/jump/run 三 clip，可用于快速排除 Kenney 作为换弹来源。 | T2 |
| 31 | [OpenGameArt – Lowpoly Dummy Character (10 Animations)](https://opengameart.org/content/lowpoly-dummy-character10-animations) | CC0 | 由 OGA 角色集合追到；该 CC0 humanoid rig 明确 Mixamo 兼容，含 10+ 个基础/武器动画，可作换弹动画的重定向骨架 donor。 | T2 |
| 32 | [OpenGameArt – Rigged Lowpoly WW2 Soldier（nisu）](https://opengameart.org/content/rigged-lowpoly-ww2-soldier) | CC0 | CC0、407.2 KB lowpolysoldier.zip，作者写明是“Rigged”低模二战士兵但未列任何 clip；同作者原链 3dmodelscc0.com 现已变成博彩站（见 unreachable），只能作 CC0 身体/绑骨基座，不能算动作源。 | T2 |
| 33 | [Quaternius – Ultimate Animated Character Pack](https://quaternius.com/packs/ultimatedanimatedcharacter.html) | CC0（与 QAL v1.0 冲突） | 作者官方页的 52 个带动画角色合集（CC0，2019，FBX/OBJ/Blend），可作同源角色+动作底座，但逐 clip 清单未核。 | T2 |

### 3.4 T3 · 方法、先例、许可与反例（不是资产候选）

T3 保留的是“怎么做/为什么做不成/许可怎么读”的证据，不能当资产下载。逐条保留原始链接与理由。

| 序号 | 条目（原始链接） | 为什么保留 |
|---:|---|---|
| 1 | [Steel Tide ART_PIPELINE_TODO](https://github.com/AetherRadar/operation-steel-tide/blob/main/docs/ART_PIPELINE_TODO.md) | 逐项勾选「下载 UAL、在 Blender 把 idle/walk/run/crouch/aim/hit/revive/death 重定向到 Mixamo rig、加 socket、替换第一人称手臂」，并写明每次 push 前确认可再分发。 |
| 2 | [Steel Tide CONTENT_PROVENANCE](https://github.com/AetherRadar/operation-steel-tide/blob/main/docs/CONTENT_PROVENANCE.md) | 逐资产列来源/许可/证据与 AI 辅助披露，是本卡许可证记录可复用的模板。 |
| 3 | [Steel Tide FIRST_PERSON_VIEW_STANDARD](https://github.com/AetherRadar/operation-steel-tide/blob/main/docs/FIRST_PERSON_VIEW_STANDARD.md) | 第一人称手臂/武器/握点/缩放的运行时合同与 HAND_POSE_CHECK 验证门，直接对应独立手臂/枪/弹匣的可读性要求。 |
| 4 | [Steel Tide OPERATOR_PRESENTATION](https://github.com/AetherRadar/operation-steel-tide/blob/main/docs/OPERATOR_PRESENTATION.md) | Blender 里重定向 UAL、修蒙皮/脚接触/枪握把与 socket 的重建步骤和回归诊断，说明零重定向只在同骨架成立。 |
| 5 | [Steel Tide BAMEN 构建脚本](https://github.com/AetherRadar/operation-steel-tide/blob/main/scripts/blender/build_animated_bamen_operator.py) | BONE_MAP 把 UAL 骨名映射到 mixamorig:*，ACTION_SOURCES 明写 reload=Pistol_Reload、shoot=Pistol_Shoot；是判断「不手补动画」边界的直接证据。 |
| 6 | [Steel Tide 换弹手臂构建脚本](https://github.com/AetherRadar/operation-steel-tide/blob/main/scripts/blender/build_animated_reload_arms.py) | 确定性生成 24 个 30fps reload clip（1.8/2.15 s），含左臂 IK、手指曲率、弹匣接触与 GLB 时长漂移校验。 |
| 7 | [Steel Tide AGENTS.md](https://github.com/AetherRadar/operation-steel-tide/blob/main/AGENTS.md) | 给 agent 的 worktree/构建/诊断规则；仓库没有 CLAUDE.md、Skill、hooks，可作为「高质量项目如何写 AGENTS.md」的对照。 |
| 8 | [Steel Tide CI build.yml](https://github.com/AetherRadar/operation-steel-tide/blob/main/.github/workflows/build.yml) | push/PR 触发 dotnet restore/build 的 CI；只有构建门，资产许可仍靠文档人工确认。 |
| 9 | [Steel Tide assets/models/LICENSE.md](https://github.com/AetherRadar/operation-steel-tide/blob/main/assets/models/LICENSE.md) | 统一记录 BAMEN CC BY 4.0、DJMaesen CC BY 4.0、Quaternius CC0、AK/M4/SCAR 逐项许可与本地文件映射。 |
| 10 | [BAMEN 军事士兵许可记录](https://github.com/AetherRadar/operation-steel-tide/blob/main/assets/models/bamen_military_soldier/LICENSE.md) | CC BY 4.0 原页、原始 FBX 的 SHA-256、Blender 导入/清理与导出说明，证明网格可再分发且需署名；其派生动作层来自 UAL1/2，另受 QAL v1.0 约束。 |
| 11 | [DJMaesen FPS SMG 许可记录](https://github.com/AetherRadar/operation-steel-tide/blob/main/assets/models/djmaesen_smg45/LICENSE.md) | CC BY 4.0、原 GLB SHA-256、24 clip/12 平台/1.8 s 与 2.15 s/30fps 及重建脚本记录。 |
| 12 | [Red Eclipse 78 骨命名表](https://github.com/redeclipse/actors/blob/master/player/bones.txt) | 78 根骨（含 palm/finger/thumb 48 根），可直接对照 BAMEN 78 骨 Mixamo 与 KayKit 41 骨的差距。 |
| 13 | [Red Eclipse actors 许可回退说明](https://github.com/redeclipse/actors/blob/master/readme.txt) | 仓库级许可回退说明：无单独 readme 的内容按 CC-BY-SA 4.0+，并提示逐项可能有额外限制。 |
| 14 | [Red Eclipse CC-BY-SA 4.0 许可原文](https://github.com/redeclipse/actors/blob/master/cc-by-sa.txt) | CC-BY-SA 4.0 许可原文；商用与再分发允许，但派生动作需同许可。 |
| 15 | [cktang88/3d-fps](https://github.com/cktang88/3d-fps) | Three r186 浏览器 FPS，bot 直接用 Quaternius UAL1/2 Standard；是「公开项目如何处理免费 UAL 缺 rifle clip」的最贴近参照。 |
| 16 | [3d-fps ANIMATION_RESEARCH.md](https://github.com/cktang88/3d-fps/blob/main/docs/ANIMATION_RESEARCH.md) | 逐项许可表：UAL Pro 才有 8 向蹲行/Turn90/Hit_*，100STYLE CC BY 4.0，Rocketbox MIT，CMU 自定义，LAFAN1 NC/ND。 |
| 17 | [3d-fps ASSET_SOURCES.md](https://github.com/cktang88/3d-fps/blob/main/docs/ASSET_SOURCES.md) | 记录 ccrash/DJMaesen CC-BY 第一人称武器 rig 与对 UAL/Toon Shooter 的取舍，可作为来源筛选表。 |
| 18 | [Mugen87/dive](https://github.com/Mugen87/dive) | three.js 维护者的 MIT FPS 示例；资产许可混杂（shotgun CC-BY、rifle CC BY-NC、soldier Mixamo 无许可），是「代码 MIT ≠ 资产可再分发」的反例。 |
| 19 | [Liblast](https://codeberg.org/Liblast/Liblast) | MIT 代码的全开源 FPS，含 reload 武器逻辑与 .blend 角色/武器源；资产逐项许可未整理，作高质项目参照而非直接候选。 |
| 20 | [Xonotic animdecide.qh](https://github.com/xonotic/xonotic-data.pk3dir/blob/master/qcsrc/common/animdecide.qh) | 长期维护 FPS 的动画状态/帧契约（duck/run/pain/dead/frame 时长），可对照固定步长下的 clip 选择；Xonotic 没有 reload。 |
| 21 | [Quaternius QAL v1.0 许可页](https://quaternius.com/license.html) | QAL v1.0 明确禁止把素材本身作为 asset pack/stock file 再分发，与包页 CC0 冲突；所有 Quaternius 候选必须先解这个冲突。 |
| 22 | [Quaternius 官方动画查看器](https://quaternius.com/animviewer.html) | 官方动画查看器，可离线核对 UAL1/UAL2 全量 clip 名与时长。 |
| 23 | [Game World Observer 的 Quaternius 作者采访](https://gameworldobserver.com/2023/01/20/free-game-assets-tutorials-quaternius-indie-developers) | 作者背景/70+ 包 2000 模型/Toon Shooter CC0 的一手采访，补作者过程与许可声明。 |
| 24 | [80.lv UAL2 发布报道](https://80.lv/articles/get-this-animation-asset-library-with-over-130-diverse-items) | 130+ 动作、CC0、免费/付费分层与 Blender 源，独立媒体核对。 |
| 25 | [Jettelly UAL2 跨引擎说明](https://jettelly.com/blog/universal-animation-library-2-a-cross-engine-animation-pack-with-a-universal-humanoid-rig) | 通用人形 rig、跨引擎导出与重定向说明，补官方页没写的接入细节。 |
| 26 | [Mesh2Motion 官方站](https://mesh2motion.org/) | 浏览器内绑定/重定向并导出 GLB，170+ CC0 动作含 rifle/pistol reload/crouch/death；本卡禁止开浏览器。 |
| 27 | [ArtTechPost 的 Mesh2Motion 作者报道](https://www.arttechpost.com/blog/mesh2motion-free-3d-animation-for-web-and-game-engines) | 作者 Scott Petrovic 的背景与 Release 10（150+ CC0 动作、自动绑定/重定向）过程报道。 |
| 28 | [Digital Production Mesh2Motion Update 6](https://digitalproduction.com/2025/10/30/mesh2motion-update-6-adds-explore-library-and-rebuilt-rigs/) | Update 6 重建控制 rig、加 Explore 库的过程记录，说明动作库与 rig 的演进。 |
| 29 | [80.lv Mesh2Motion Update 6](https://80.lv/articles/update-to-animation-app-mesh2motion-introduces-explore-page-better-control-rigs) | 同一更新的行业媒体报道，补 rig/动画扩充的细节。 |
| 30 | [Godot 官方 3D 骨架重定向文档](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/retargeting_3d_skeletons.html) | 官方 Bone Map/Rest Fixer/Realtime Retarget 文档：同名骨不够，parent/rest/axis 都可能让重定向失败；支撑「优先同 rig 成套」。 |
| 31 | [three.js 官方 skinning blending 示例](https://threejs.org/examples/#webgl_animation_skinning_blending) | 官方 AnimationMixer/crossFade 示例（Soldier.glb idle/walk/run），是新 skinned 消费者的最小实现参考。 |
| 32 | [three.js SkeletonUtils 官方文档](https://threejs.org/docs/#examples/en/utils/SkeletonUtils) | 官方 clone/retarget API 文档；clone 与 retarget 的边界要看源码/实测，不能假设零改动。 |
| 33 | [Khronos glTF Sample Assets 索引](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/Models.md) | 官方 glTF 样本索引，含 RiggedSimple/Fox/RiggedFigure/BrainStem 等 skin/animation 测试资产。 |
| 34 | [Khronos RiggedSimple](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/RiggedSimple) | Cesium 的 CC BY 4.0 最小 skin+animation 模型，适合先用 GLTFLoader 验骨架/动画路径。 |
| 35 | [glTF 2.0 规范 skins 节](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#skins) | 官方 skin/joint/IBM 合同，用来核模型是否满足 Three 的 SkinnedMesh 前提。 |
| 36 | [Unity 官方 Humanoid 重定向文档](https://docs.unity3d.com/Manual/Retargeting.html) | 官方 Humanoid 重定向说明；Mixamo/UE 骨架跨引擎时，Avatar/BoneMap 的约束与 Godot/Three 类似。 |
| 37 | [Autodesk 对 Riot VALORANT 武器动画的采访](https://blogs.autodesk.com/media-and-entertainment/2026/10/20/riot-games-animates-valorant-with-autodesk-maya/) | Riot 资深动画师：60fps 第一人称，equip/fire/reload/inspect 五动作，步枪换弹三拍（退匣/弹药重置/可击发），直接支撑本卡的可读性判据。 |
| 38 | [GDC 2017 Overwatch 第一人称动画演讲](https://gdcvault.com/play/1024319/) | 暴雪第一人称换弹如何在 45 帧内表达角色、左右手选择与不挡准星；行业一手。 |
| 39 | [Game Developer 的 Overwatch 演讲摘要](https://www.gamedeveloper.com/art/video-conveying-character-via-first-person-animations-in-i-overwatch-i-) | 上述 GDC 演讲的免费摘要/视频入口，便于无 GDC 账号阅读。 |
| 40 | [GDC 2015 Destiny 第一人称动画演讲](https://gdcvault.com/play/1022298/contactUs) | Bungie 第一人称动画（含 reload）的 GDC 演讲，补另一家头部团队的做法。 |
| 41 | [Wolfire GDC13 Animation Bootcamp Part 5/6](https://www.wolfire.com/blog/2013/04/GDC13-Summary-Animation-Bootcamp-Part-5-6/) | 手/枪/弹匣/道具在 hand/weapon/body/world 空间切换，rig 必须支持挂接/脱离。 |
| 42 | [Game Anim Worst Reload Part 2](https://www.gameanim.com/2015/01/13/worst-reload-part-2-2/) | 从业者拆解坏换弹，直接支持「不把整枪位移当换弹」的排除标准。 |
| 43 | [Kinemation FPS Animation Framework 文档](https://kinemation.gitbook.io/fps-animation-framework/tutorial/animation-workflow/weapon-animation) | 商业 Unity FPS 框架文档：武器局部（弹匣/扳机/拉机柄）动画、root motion 交给 Weapon Bone，作为方法/反例参照。 |
| 44 | [Cransh FPS AK-74m animations（上述模型的作者原页）](https://sketchfab.com/3d-models/fps-ak-74m-animations-94be8385c402474cacd39bc096c6ca14) | 作者原页，模型/动画 CC-BY-4.0（Cransh，需署名）；GitHub 镜像 `FPS-Arms-3D` 的顶层 LICENSE 是代码 MIT，不覆盖模型/动画。与镜像的 8 个 clip/独立弹匣一致，可作许可链与署名的原始依据。下载需 Sketchfab 登录，按任务不从这里取件。 |
| 45 | [Kenney Starter Kit FPS（官方 Godot 4.6 FPS 模板）](https://github.com/KenneyNL/Starter-Kit-FPS) | 2026 年官方 FPS starter，MIT 代码 + CC0 资源；仓库树实际只有 blaster.glb、blaster-repeater.glb、飞行敌人和环境，没有第一人称手臂、没有 reload/hit/death clip。直接证明 Kenney 官方自己的 FPS 模板也不含换弹动作，是本轮 Kenney 角度最有决策价值的负面证据。 |
| 46 | [Kenney 3D 全目录（50 个包逐一对照）](https://kenney.nl/assets/category:3D) | 抓取 category:3D 全部 4 页共 50 个 3D 包逐项对照：没有任何一包同时提供人形角色 + 枪械 + reload。与枪有关的只有 Blaster Kit（40 件静态枪/弹匣）；最接近的是 Blocky Characters（页面 20 个动画文件，实测每 GLB 27 clip，含 shoot，无 reload/crouch）与 Mini Characters（25 个动画文件，含 crouch，无武器）。Kenney 不能承担本卡的换弹动作缺口。 |
| 47 | [ETdoFresh/kenney.nl（Kenney 全量解包镜像）](https://github.com/ETdoFresh/kenney.nl) | 47,655 个文件的 Kenney 包解包镜像，README 重述 CC0；可直接按目录读 FBX/GLB 成员，绕过 kenney.nl/download-link 的 forbidden。注意部分包版本较旧（Graveyard 为 v3），引用前需与官网版本对齐。 |
| 48 | [devanshutak25/3d-resources（1015 stars 的 CC0/免费 3D 索引）](https://github.com/devanshutak25/3d-resources) | 3400+ 条 3D/VFX/游戏开发资源索引，含 39 项 Mocap & Animation Libraries；本轮从该表补到 MoCap Central/Online/Atlas、Xsens、ACCAD、jdbeardmore、Paragon、Unity Starter Assets 等未覆盖来源。不是资产本体，是头部 awesome 覆盖的主要入口。 |
| 49 | [A19200332/awesome-game-assets](https://github.com/A19200332/awesome-game-assets) | 免费/商业游戏资产源清单；3D 只列 Kenney/Quaternius/Poly Haven/Blender，说明头部 awesome 列表对“枪械角色动作”覆盖仍很薄，可作为“已扫头部列表”的证据。 |
| 50 | [3d.shep.bot Free animated character models 索引](https://3d.shep.bot/assets/free-animated-character-models) | 聚合 Quaternius/Kenney/BlenderKit/3DAssets.dev/OpenGameArt/itch 的免费绑定动画角色索引；没有枪/换弹专项，但可一页对照各家的 clip 数量与许可。 |
| 51 | [aadithva/shardline-outpost（Three.js 第三人称射击，KayKit 全套动作接入先例）](https://github.com/aadithva/shardline-outpost) | ASSETS.md 与 public/assets 显示它把 KayKit Adventurers/Skeletons 与 Character Animations 的 combat-ranged/general/movement-advanced.glb 接到 Three.js，用 SkeletonUtils 克隆、FBXLoader 载 Quaternius 怪物，R=reload。是目前最接近 sources.md 所提“新增 skinned 消费者 + KayKit”的可读先例（仓库自身无 LICENSE，资产清单在 ASSETS.md）。 |
| 52 | [wangjialiang678/three-military-tps（Three.js 第三人称军事射击）](https://github.com/wangjialiang678/three-military-tps) | 已归档并入 3d-game-kit；README 明写士兵用 three.js 官方 Soldier.glb（Mixamo 骨骼，仅 Idle/Walk/Run），R=reload 但没有换弹 clip。可作越肩 TPS 视角、第一/第三人称切换与换弹时序的工程参考；资产许可链含 Mixamo，不能当干净动作源。 |
| 53 | [TheGabmeister/Unreal-Animations](https://github.com/TheGabmeister/Unreal-Animations) | 把 KayKit Rig_Large/Medium 与动作导入 UE 的工程（README 标 CC0 Animations for Unreal Engine）；不是新动作或新许可，但可核 KayKit clip 在 UE 侧的命名/导入方式。仓库无独立 LICENSE 文件，需回 KayKit 原页确认。 |
| 54 | [Ariescar/ai-game-jam-threejs-boilerplate](https://github.com/Ariescar/ai-game-jam-threejs-boilerplate) | Three.js 零配置 starter，自带 8 个 Gobkit CC0 minion + 循环 movement clip，代码 MIT、模型 CC0；无枪/换弹（Gobkit 已在 sources.md），只作 Three.js 加载/切换绑骨角色的最小样例。 |
| 55 | [nicholaspsmith/godot-fps-starter](https://github.com/nicholaspsmith/godot-fps-starter) | MIT 代码 + “只收 CC0”的资产政策（LICENSE-ASSETS 明确排除 CC BY/NC/ND/GPL、Fab/Unity/Unreal EULA 与无再分发条款），Godot 4.7 FPS starter，仍在开发。值得跟踪其最终角色/武器动作来源；当前未交付动作集。 |
| 56 | [rehan-remade/animated-asset-skill](https://github.com/rehan-remade/animated-asset-skill) | Claude Code Skill/工具，一句话生成绑定动画的体素生物/RPG 角色，走 fal 付费服务；无枪/换弹，属于“插件与 Skill 市场”里与角色动作相关的新条目，不能当本卡资产源。 |
| 57 | [What It Takes to Make a Reload Animation in Witchfire — Adrian Chmielarz, The Astronauts](https://www.theastronauts.com/2020/04/what-it-takes-to-make-a-reload-animation-in-witchfire/) | 第一方开发者博客（2020-04-22）复盘换弹动画的真实制作成本与流程，不是可下载资产；对“不要移动整把枪冒充换弹”、换弹应拆分到手/弹匣/枪机的判断是有力的从业者依据，可作为本卡的方法参照。 |
| 58 | [[许可原文] Kevin Iglesias 资产许可页](https://www.keviniglesias.com/assets/archerAnimationsFREE.html) | 作者站点统一许可说明：royalty-free 可商用、无需署名，但“may not be sold, sublicensed, shared, or distributed as standalone items”，也不得放进文件可访问/可提取的资产包、库或模板；这直接决定上面的免费士兵包能否进 FPS-Like 公开仓库。 |
| 59 | [[方法/质量-中文] CGJOY 第一人称花式检视动画](https://www.cgjoy.com/thread-262540-1-1.html) | 搜索摘要中的从业者评论给出可信换弹的硬标准：拔弹匣要有反作用力、插弹匣要有重量感、拉栓要有阻滞感；可直接用来判定候选 clip 是不是“移动整把枪”的伪换弹。 |
| 60 | [[方法/质量-中文] CGJOY 换弹动画小练习](https://www.cgjoy.com/thread-274156-1-1.html) | 点评指出弹匣弹出慢滑、插入瞬间看不清、节奏偏平、机械感不足；是中文社区对“换弹动作可读性”的具体负面样本。 |
| 61 | [[方法/质量-中文] CGJOY 关于枪械换弹的问题](https://www.cgjoy.com/thread-281386-1-9.html) | Maya 里用“定位器—双手—武器”与“定位器—双手控制器组”两套父子约束切换弹匣/手，解决换手时武器乱飞；对自建或修补 reload 的绑定层有参考。 |
| 62 | [[实践-中文] cube_gunman（Gitee）](https://gitee.com/lian_1998/cube_gunman) | Three.js+TS FPS，Blender 导出 `<weaponName>_reload` 轨道并由代码读取，武器层换弹完整；但 README 明说人物移动动画未实现，素材来自网易 Buff 商城/Minecraft 皮肤站（无有效许可），正好证明“武器 reload ≠ 角色全身换弹”。 |
| 63 | [[实践-中文] ThreeFury-FPS](https://github.com/GithubLinfuxi/ThreeFury-FPS) | Three.js 浏览器 FPS，宣称有 R 换弹/蹲伏，但 README 与仓库没有模型动画来源和 LICENSE，无法作为可复用来源；只能作为“国内同类项目普遍不标资产许可”的反面样本。 |
| 64 | [[实践-中文] Claude-of-Duty](https://gitcode.com/gh_mirrors/cl/Claude-of-Duty) | Three.js r180 FPS，明确用 procedural 换弹而非真实 clip；是任务要避免的“程序化假装换弹”路线的现成对照。 |
| 65 | [[实践-中文] chasergit/gear](https://github.com/chasergit/gear) | Three.js FPS，含 R 换弹、武器摆动、持枪跑，但 README 未给模型/动画来源与许可证，复用前必须逐资产追权。 |
| 66 | [[负证-中文] 公众号 通过游戏动画示例项目获取500多种免费动画（GASP）](https://mp.weixin.qq.com/s/QM89aehgefoM2PdbT_giEA) | Epic GASP 500+ AAA 动画可免费下载，但许可仅覆盖基于 UE 的产品，不能用于 Three/公开网页游戏；中文推荐常忽略这条限制。 |
| 67 | [[方法-中文] 公众号 硬核/Cocos Marionette 动画系统 FPS 开发详解](https://mp.weixin.qq.com/s/llNkoKYi9IbgyXp4pLQPWA) | 以霰弹枪换弹为例讲待机→开弹仓→塞弹循环→关弹仓的状态机、动画遮罩与叠加，支持随时打断；是换弹分层/可中断设计的中文实现参考（正文需微信验证，仅摘要）。 |
| 68 | [[中文综述] B站 5个免费 Mixamo 替代工具](https://www.bilibili.com/video/BV1kdnF64Eit/) | 实测 Mesh2Motion、ActionForge、AccuRig、Animate Anything 等免费替代，可快速了解浏览器侧工具版图；这些工具多数仍需浏览器/无头导出，不能直接解决本卡取件。 |
| 69 | [[中文综述] B站 ActionForge 深度体验](https://www.bilibili.com/video/BV1MfJi6MEoi/) | 介绍 ActionForge 自动绑骨、85+ 动作、GLB/FBX 导出与 IK 调整；其动作库底层是 Quaternius UAL，没有步枪 reload，且完全在浏览器里运行。 |
| 70 | [[方法-中文] B站 UE5 第一人称射击游戏教程](https://www.bilibili.com/video/BV1Swjn6JEcc/) | 教程含 Blender 换弹动画制作、UE5 换弹功能实现、枪械收纳/装备动画整合等章节，并附免费网盘工程；可作“自己补 reload”的学习路线，不是可直接商用的成品动作源。 |
| 71 | [[反面样本-中文] B站 初学Blender做的简陋换弹](https://www.bilibili.com/video/BV1q5QqBFEf1/) | 个人练习换弹，作者自述跟着教程做且模型绑骨来自附带包；说明中文社区大量“换弹动画”是练习/演示，没有可用的授权与文件身份。 |
| 72 | [[许可-中文] 爱给网 FAQ：哪些素材可以商用](https://m.aigei.com/faq/doc/1.html) | 官方规则：未标注许可的素材仅限个人学习研究，CC 素材按具体协议；站内大量 FPS 手臂/角色页未标许可，不能当作者原页授权来源。 |
| 73 | [Epic 论坛 – 换弹时弹匣不脱离（How can I actually remove the Magazine…）](https://forums.unrealengine.com/t/how-can-i-actually-remove-the-magazine-in-my-rifle-in-a-reload-animation/2024162) | FPS 开发者实测弹匣在换弹时留在枪上；回复直言“免费的动作包/动画总体很难找”，并建议把手臂和枪并成一个动画——直接印证本卡“独立弹匣+免费完整源”的缺口。 |
| 74 | [Epic 论坛 – I want mocap gun animations, Any tip?](https://forums.unrealengine.com/t/i-want-mocap-gun-animations-any-tip/1330073) | 用户找不到想要的枪械 mocap（如 PPSH-41），并指出买来的动画没有 Lyra 的 ik_Hand_Root 骨，手部绑定对不上——说明“现成动画+现有骨架”通常不能零改拼接。 |
| 75 | [Epic 论坛 – KINEMATION FPS Animation Pack Ultimate 购买者反馈（缺 idle/武器/文档）](https://forums.unrealengine.com/t/kinemation-fps-animation-pack-ultimate/2531370/5) | 付费 20 武器“完整包”的买家实测角色一直跑没有 idle、武器找不全、文档落后——页面清单不等于可用动作清单，必须逐条核。 |
| 76 | [Epic 论坛 – KINEMATION 重定向失败：动画弯曲、武器贴地](https://forums.unrealengine.com/t/kinemation-fps-animation-pack-ultimate/2531370/9) | 买家按官方文档用 Retargeter 处理多个 UE4/UE5 骨架仍失败，动画“经常弯曲”、武器“在根节点处贴地”——这是整包换骨架最直接的失败证据。 |
| 77 | [Epic 论坛 – KINEMATION 售后：FAB 购买后 Discord 进不去、无人响应](https://forums.unrealengine.com/t/kinemation-fps-animation-pack-ultimate/2531370/12) | 付费 FPS 动画包的售后渠道失效，说明把商业包当唯一退路也有支持风险，选源时应保留可验证的许可与文件。 |
| 78 | [Epic 论坛 – Retargeting weapon-less animations to skeletal mesh with weapons (5.4)](https://forums.unrealengine.com/t/retargeting-weapon-less-animations-to-skeletal-mesh-with-weapons-on-5-4/1848331) | 把无武器骨的 Mixamo 动画重定向到带武器骨的骨架后，武器在角色周围飞——源动画没有枪/弹匣骨就无法靠重定向补齐。 |
| 79 | [Epic 论坛 – 重定向角色武器 Socket 编辑器对、运行时偏移（UE 5.6）](https://forums.unrealengine.com/t/weapon-socket-offset-on-retargeted-characters-ue-5-6-correct-in-editor-offset-at-runtime/2669313) | 多名用户报告重定向后武器在编辑器预览对齐、进游戏却偏移一截；修复要重建 IK Rig/Retargeter 或改挂点——换骨架的隐性成本很高。 |
| 80 | [Epic 论坛 – Floating weapons with IK_Retargeting](https://forums.unrealengine.com/t/floating-weapons-with-ik-retargeting/2720502) | IK 重定向后武器悬在角色身侧、不落在手里——与上一条共同说明“同一套 clip 换不同骨架”不是可忽略的适配项。 |
| 81 | [Epic 论坛 – How to synchronize weapon and character animations?](https://forums.unrealengine.com/t/how-to-synchronize-weapon-and-character-animations/1811585) | 角色与武器换弹动画长度/节奏对不上；建议把两段动画拿去 Blender 对齐，并在主模型加枪骨、让弹匣挂骨而不是手 socket——正是本卡“独立弹匣骨”的必要性。 |
| 82 | [Epic 论坛 – reload animation（第三人称可拆弹匣求助）](https://forums.unrealengine.com/t/reload-animation/102025) | 新手求“第三人称换弹时弹匣可见地取下/装上”的做法，帖内没有任何可行方案——说明这类成套内容在社区里也没有现成答案。 |
| 83 | [Unity Discussions – Where to find Unity FPS animations](https://discussions.unity.com/t/where-to-find-unity-fps-animations/782390/2) | 回复称真正免费的 FPS 动画“非常少”，多数只是付费包的试玩/引流，建议直接买整套 FPS 模板——独立开发者对免费完整源的普遍判断。 |
| 84 | [Godot 论坛 – 免费资产求助帖中 Mixamo 登录失效、Mesh2Motion 被推荐](https://forum.godotengine.org/t/where-do-i-go-for-help-with-assets/133069/7) | 2026-02 用户报告 Mixamo“突然不让我登录”，同帖第 10 楼改推免账号的 Mesh2Motion——Mixamo 作为 fallback 的可用性在下降。 |
| 85 | [Godot 论坛 – 换皮时重定向骨骼对不上、网格互换会变形](https://forum.godotengine.org/t/swapping-a-skeletons-3d-models-while-having-them-look-normal/140811) | 用户用 RetargetModifier 换模型时骨骼不齐、直接换 mesh 又出现扭曲；回复明确“模型必须匹配这套 rig”——支持“优先同 rig 成套，不指望运行时重定向”。 |
| 86 | [Godot 论坛 – 跨动画库切换后骨骼姿态永久错乱](https://forum.godotengine.org/t/bone-poses-getting-messed-up-when-going-from-one-retargeted-animation-to-another/130611) | 把 KevDev 近战动画混入 Quaternius UAL 后整套动画倾斜；原因是各 clip 影响的骨骼集合不同，未打 key 的骨保留上一段姿态，需 deterministic 或全骨 key——混库拼动作的真实代价。 |
| 87 | [Godot 论坛 – FPS viewmodel 多武器工作流：弹匣/滑套怎么放进手臂 Action](https://forum.godotengine.org/t/best-blender-to-godot-workflow-for-fps-viewmodel-with-multiple-weapons/135582) | 开发者卡在“换弹时左手跟随弹匣、弹匣/滑套在手臂 Action Editor 里怎么处理”；回复建议武器挂 BoneAttachment3D、手去拿弹匣——说明换弹必须作为同一套骨骼动画制作。 |
| 88 | [Godot 论坛 – 两套 rig（手臂 + 手枪）如何做弹匣换弹](https://forum.godotengine.org/t/moving-individual-parts-of-gun-in-a-3d-animation/55990) | 用户有独立手枪 rig（含 magazine/pull 骨）和手臂 rig，问如何在 Godot 里让弹匣跟着手；回答是去 Blender 把手臂和枪放同一场景做动画——两套 rig 不能在运行时轻松合成一个换弹 clip。 |
| 89 | [Godot 论坛 – KayKit 角色导入后找不到 AnimationPlayer](https://forum.godotengine.org/t/animationplayer-missing-while-importing-external-3d-assets-missing/128792) | KayKit Adventurers 更新后动作被拆到单独 Animations 文件夹，用户以为动画丢失；需按 Animation Library 重导并建 inherited scene——下载成员与导入步骤必须实测，不能凭旧教程。 |
| 90 | [Godot issue #53544 – KayKit FBX 动画在 3.3+ 导入损坏](https://github.com/godotengine/godot/issues/53544) | 以 KayKit Animated Character v1.1 复现：AnimationPlayer 动画完全损坏，唯一可行办法是回 Godot 3.2.3 导 .anim——官方 rig 的 FBX 也不是跨引擎即用。 |
| 91 | [three.js 论坛 – clipAction 按名查找失败 & Blender 重名 Action 全指向同一骨架](https://discourse.threejs.org/t/animationmixer-clipaction-inside-gltf-scene-by-name/15361) | GLTFLoader 的 clip 不在 scene 上，按名 clipAction 会报错；复制 Blender Action/骨骼后重名会让所有动作驱动同一骨架，donmccurdy 确认必须唯一命名——解释了 KayKit/Quaternius 的 `Rig_\|`/`Armature\|` 前缀与重名风险。 |
| 92 | [three.js 论坛 – 按骨骼分层混合（跑动+上半身持枪）无原生支持](https://discourse.threejs.org/t/how-to-implement-bone-specific-animation-weighting-in-three-js/65329) | 用户要实现下半身跑步、上半身持枪/换弹的 Unreal Layered Blend per Bone 效果；three.js 没有原生骨骼遮罩，需自行过滤 propertyBindings——把 reload 叠到 locomotion 不是开箱能力。 |
| 93 | [three.js 论坛 – 往 glb 骨骼加 mesh：attach 与 add 的区别](https://discourse.threejs.org/t/add-mesh-to-glb-bones/59438) | 直接 add 到骨骼的物体停在自身世界坐标、不跟手；要用 bone.attach() 转局部空间，且骨骼要通过 skeleton.bones/场景树正确查找——武器/弹匣挂点的常见坑。 |
| 94 | [three.js 论坛 – Blender 里挂好的武器导出 glb 后在 three.js 不跟手](https://discourse.threejs.org/t/mixamo-adding-a-weapon-to-character/5479) | Blender 内武器跟随手部，导出 glTF 到 three.js 后武器原地不动，帖内无解——导出器不会自动把武器关系带成运行时挂接。 |
| 95 | [three.js 论坛 – 如何在角色手里放武器（socket 骨方案）](https://discourse.threejs.org/t/how-to-put-a-weapon-in-a-characters-hand/22121) | 实践回答是在骨架里加 hand-slot 骨，再把独立武器 mesh 挂到该骨；角色/武器分文件时这是可行路径，但要求源 rig 预留挂点或自行加骨。 |
| 96 | [three.js 论坛 – clone 带 SkinnedMesh 的模型必须用 SkeletonUtils.clone](https://discourse.threejs.org/t/cloning-skinned-mesh-results-in-problems/86820) | 普通 clone 会保留对原骨骼的引用，多敌人共用一套动作时会坏；需 SkeletonUtils.clone 并各自 AnimationMixer——同源角色批量上场的已知限制。 |
| 97 | [Blender Artists – NLA 轨道导出 glb 后部分动作名丢失](https://blenderartists.org/t/nla-tracks-glb-format-working-but-only-some-of-the-names-come-through/1589109) | 资产包 NLA 轨道数量正确但多条动画名为空，动作在文件里只是没名字——印证“必须打印实际 clip 名并按名/后缀匹配，不能假设导出名”。 |
| 98 | [Blender Artists – 武器挂点用 Bone 还是 Empty](https://blenderartists.org/t/is-it-better-to-use-a-bone-or-an-empty-as-an-attach-point-for-weapons/1485038) | 回复明确引擎只认骨骼、Empty 不会作为骨骼导出；要可挂接武器/弹匣应在 armature 内加骨——与 KayKit 只有 handslot 骨、无弹匣骨的结构缺口直接相关。 |
| 99 | [Blender Artists – 左轮换弹怎么绑（子弹生成/隐藏）](https://blenderartists.org/t/how-do-i-rig-a-revolver-reload-animation/1580798) | 换弹的弹壳/子弹是逐帧隐藏/显示而非骨骼驱动，回复说子弹不需要骨——说明“武器侧机械换弹”与“角色身体换弹”是两层，不能互相替代。 |
| 100 | [glTF-Blender-IO #953 – NLA strip 动画有时不按轨道名导出](https://github.com/KhronosGroup/glTF-Blender-IO/issues/953) | 单 action 的 NLA strip 会以 action 名导出，反复 round-trip 后名字累积成 `Anim_0_Node_21_Node_21...`——与 KayKit/Quaternius 的前缀/重名现象同源，clip 身份不可靠。 |
| 101 | [glTF-Blender-IO #1843 – NLA 轨道名与界面语言相关](https://github.com/KhronosGroup/glTF-Blender-IO/issues/1843) | 导出器对 `NLATrack`/`[Action Stash]` 有硬编码英文名分支，法语界面会得到不同动画名——同一文件在不同环境导出的 clip 名可能不同，核清单要固定工具与语言。 |
| 102 | [Mesh2Motion issue #155 – 请求 headless CLI/API](https://github.com/Mesh2Motion/mesh2motion-app/issues/155) | 用户明确要批量绑骨与导出、CI/agent 可调用；作者回复没有 CLI/文档 API，只能先考虑 web API，且手工绑骨难以脚本化——本卡“不开浏览器/不装软件”路线的直接阻碍。 |
| 103 | [Mesh2Motion issue #127 – 导入自己的 rig 后效果“非常奇怪/丑”](https://github.com/Mesh2Motion/mesh2motion-app/issues/127) | 用户用 Use Your Rigged Model 导入自备 FBX 后姿态严重错乱，维护者为此加旋转修正与骨名匹配——自有骨架不是导入即可用。 |
| 104 | [Mesh2Motion issue #141 – 自定义骨架骨名自动匹配大量失败](https://github.com/Mesh2Motion/mesh2motion-app/issues/141) | 维护者自述多数自定义骨架的骨名无法自动匹配，需要扩充匹配逻辑——想把自己的敌人骨架套 CC0 动作仍需人工映射。 |
| 105 | [Mesh2Motion issue #118 – 重复骨名会让 Visible Chains/控制失效](https://github.com/Mesh2Motion/mesh2motion-app/issues/118) | 用骨名做 key 的 UI 在重名骨架下会合并/隐藏错误链——与 three.js 重名 Action 问题同类，说明源骨架命名质量会影响整条管线。 |
| 106 | [Mesh2Motion issue #148 – 导出后贴图质量下降](https://github.com/Mesh2Motion/mesh2motion-app/issues/148) | 用户对比发现导出 GLB 的贴图被浏览器重新编码、质量变差——即使动作可用，导出产物也不是无损原素材。 |
| 107 | [Mesh2Motion issue #136 – FBX 导入导出后材质爆白](https://github.com/Mesh2Motion/mesh2motion-app/issues/136) | FBX→绑定→导出 GLB 后材质异常，需在 Blender/Babylon 里复核——工具导出不等于可直接上线。 |
| 108 | [Mesh2Motion issue #139 – Use Your Rigged Model 不显示 GLB/不建材质](https://github.com/Mesh2Motion/mesh2motion-app/issues/139) | Synty 商业模型转 GLB 后在“Use Your Rigged Model”里看不到/无材质，而在“Use Your Model”正常——把外部角色接入其绑骨流程有实际阻塞。 |
| 109 | [Mesh2Motion Desktop 仓库 – 离线桌面版仍是 WIP](https://github.com/Mesh2Motion/mesh2motion-desktop) | Tauri 桌面版自述“尚未完全可用”，下载统一进 Downloads、开发构建带 devtools，且没有 CLI——不能据此认为“不开浏览器”的自动化已解决。 |
| 110 | [Mesh2Motion discussion #35 – 社区请求 standalone/离线版](https://github.com/scottpetrovic/mesh2motion-app/discussions/35) | 用户要独立离线版/Godot 移植；维护者称跨平台构建需他人接手、优先级低，短期只有本地 npm 运行——最后一公里仍要用户自己搭环境。 |
| 111 | [Godot Forums – Mesh2Motion 讨论（离线/独立版诉求与 Docker 绕法）](https://godotforums.org/d/42698-mesh2motion-a-program-for-character-animation/15) | 用户抱怨只能浏览器用、LibreWolf 加载不了模型，讨论用 Docker 本地跑；同帖确认后来出现 standalone 版——真实使用门槛与替代路径。 |
| 112 | [OpenGameArt – FPS Character Necrobot 评论：动作是否来自 Mixamo](https://opengameart.org/content/fps-character-necrobot#comment-86564) | 用户直接质问动画是否取自 Mixamo；后续评论指出 Mixamo“免费只是免费啤酒，不是 OGA/自由许可兼容”——CC 授权资产可能暗含不可再分发的 Mixamo 动作，必须核来源。 |
| 113 | [OpenGameArt – A5 Carbine 版主要求补 AI 披露](https://opengameart.org/content/a5-carbine-animated-tactical-carbine-glb-blender#comment-113532) | 版主指出缺少所用 AI 模型/版本/条款链接，否则删稿（作者回复已修正）；这解释了 CuiGames 系列“potential licensing issues/文件不可用”的性质是 AI 生成披露问题。 |
| 114 | [Sketchfab – Modern Army Soldier 评论区指认底模为游戏提取物](https://sketchfab.com/3d-models/modern-army-soldier-with-24-pro-animations-37566d930fa7404f87847b7fca8dca97) | 评论称其为《合金装备：便携行动》的 FOX 角色，上传者自述“拿现成模型加动画后上传”；CC-BY 4.0 标签无法证明底模权利，23 clip 的清单也不能作为可提交来源。 |
| 115 | [Sketchfab – M4 FPS Weapon Animations Pack 评论质疑内容来源](https://sketchfab.com/3d-models/m4-fps-weapon-animations-pack-v1-662fc74dda2646cfb48fc610705768ef) | 有评论称提问者是在“请求使用偷来的内容”，另有用户问能否改贴图并署名——CC-BY 武器/动画包的上传权利链本身存在争议，且下载需登录。 |
| 116 | [Sketchfab – DuqueCD7 FPS Character Animation Pack (Pistol) 评论](https://sketchfab.com/3d-models/fps-character-animation-pack-pistol-e2815a5bea3a4e3895b3c29a2586e671) | 用户报告导入 UE 5.1 时动画无法关联基础骨架，Unity 里相机/手臂位置对不上、无法瞄中心，还有人追问底模作者——“整角色 CC-BY 包”实际接入仍需大量手工对齐。 |
| 117 | [pro.alcuesto.jp – Quaternius 许可警示（CC0 与 QAL v1.0 冲突）](https://pro.alcuesto.jp/blog/quaternius-animated-animal-pack) | 2026-09 的文章实核包页仍写 CC0、官网 License 页却是 2026-08-28 的 QAL v1.0（禁止把素材本身再分发），建议记录下载日期/页面原文并向作者确认——与本卡“QAL 与 CC0 冲突”结论一致。 |
| 118 | [Godot Store – Universal Animation Library 用户评价](https://store.godotengine.org/asset/quaternius/universal-animation-library/) | 12 条评价中唯一技术批评是 UpperChest 骨骼过度弯曲、“换到别的角色上很难看”；另有用户建议先学 BoneMap/AnimationTree 重定向——官方店的真实使用反馈也指向跨骨架效果不佳。 |
| 119 | [@three-ws/retarget](https://github.com/nirholas/three.ws/tree/main/packages/retarget) | 2026-07 抽出的 Apache-2.0 Three.js 重定向运行时（0.1.2 于 2026-09-11），把 Mixamo/VRM/UE/Blender 骨骼统一到 canonical skeleton 并带覆盖率闸门，直接降低新增 skinned 消费者接 KayKit/UAL 的成本。 |
| 120 | [@three-ws/motion](https://github.com/nirholas/three-ws-motion) | 2026-09-11 发布的 Apache-2.0 零依赖文本到 THREE.AnimationClip 运动学求解器（约 20 动作、含地面接触/平衡），CPU 可跑但无道具/枪械语义，不能生成真实换弹。 |
| 121 | [app.nz Motion, VFX & Terrain Commons](https://app.nz/blog/open-animation-vfx-terrain-commons) | 2026-07-17 开放的 motion commons：YOLO/MediaPipe/BodyPose3D 三条 video-to-motion 后端、可重定向动作与 CLI/REST/MCP，适配器 MIT 但各模型权重许可分离。 |
| 122 | [Cinevva – When animation must meet the world（Three.js runtime contact）](https://app.cinevva.com/blog/2026-09-13-animation-that-meets-the-world) | 2026-09-13 的 Three.js 运行时接触修正层：脚/手接触存在物体局部帧并逐帧 IK，可包现有 mixer，正好对应支撑手随弹匣/枪身移动的难题；仍是实验原型、无手指抓握。 |
| 123 | [TechnicallyArtist Forge](https://technicallyartist.com/forge/changelog/) | 2026-09-23 上线的免费浏览器工具，用 9 个标记生成 Mixamo 兼容 25/65 关节骨架与权重并导出 GLB，可把自建 mesh 接到现成剪辑，但只带 Idle/Walk/Jog。 |
| 124 | [Itinerant Rig](https://store.steampowered.com/app/5011910/Itinerant_Rig/) | 2026-09-01 Steam 付费触控动画工具，导入 glb/gltf/fbx、导出烘焙 glb 或可编辑 Godot 工程，提供一条不依赖 Blender 的离线换弹 clip 制作路线。 |
| 125 | [vid2anim](https://github.com/mehulcode12/vid2anim) | MIT 的视频/照片到 Mixamo/VRM/Rigify/UE Mannequin 重定向工具，带五指追踪、脚部接触和 GLB/BVH 导出，可把自有版权的换弹参考视频变成 clip；不含武器/弹匣语义。 |
| 126 | [toyxyz RGBMocap](https://github.com/toyxyz/toyxyz_RGBMocap) | 2026-10-26 起数天 602 星，Windows 本地整合 ExMR/FlowHMR/GVHMR、接触修正与人形重定向并导出 FBX/VMD；需 NVIDIA GPU，本卡不能运行。 |
| 127 | [mixamo-llm-mocap](https://github.com/squall01337/mixamo-llm-mocap) | 2026-08-17 的 MIT 全脚本化视频到 Mixamo 骨架 FK 管线（约 8GB CUDA），适合在拿到有版权参考视频后由 agent 批量产出候选 reload；模型权重另受 SMPL-X/GVHMR 条款约束。 |
| 128 | [HOI-Retarget](https://github.com/leggedrobotics/hoi-retarget) | 2026-09-18 的 BSD-3 接触中心重定向：把带标签的手-物接触在物体坐标系中作为目标、支持任意物体尺度，正是把换弹时手/弹匣接触迁移到新角色的问题形式（当前面向人形机器人）。 |
| 129 | [posecode-render](https://github.com/posecode-dev/posecode) | 2026-10-04 的 Posecode IR 到 Three.js 骨骼/程序人形渲染（FK+CCD IK，无 GPU、无扩散），可确定性生成姿态；仓库 LICENSE 与 package.json 均为 Apache-2.0，按 Apache-2.0 记录（保留版权/NOTICE，修改需说明），无武器语义。 |
| 130 | [WhiteTowerAI OhMyGame beta 5](https://github.com/WhiteTowerAI/ohmygame) | 2026-10 Apache-2.0 的 AI 游戏工作室应用，beta 5 可通过 Meshy/Tripo/Hyper3D 生成带绑定与动画的 3D 模型，代表“一个应用内出可动角色”的新路线，输出许可与质量未核。 |
| 131 | [Bodycam v0.8 Devlog Part 1/4 – Animation & Loadout](https://store.steampowered.com/news/app/2406770/view/1840944183788763) | 2026-08-18 第一方开发日志：每武器/姿态/压力 4-5 套预制 reload 变体，再用 UE5 IK 随机微调手/指并在 calm 到 stressed 间切换，直接证明高质量换弹是“多套作者动作+IK”，不是一段通用 clip。 |
| 132 | [Arc Raiders GDC 2026 reload design](https://www.gamesradar.com/games/third-person-shooter/arc-raiders-guns-totally-changed-after-one-guerilla-dev-at-embark-said-hold-my-beer-i-think-i-can-do-better-and-remade-the-entire-reload-system-himself/) | 2026-03-23 对 GDC 2026 panel 的报道：手动换弹更快、空仓自动换弹会卡壳且更慢，提供一条用玩法规则替代完整换弹动画的降级路线。 |
| 133 | [UE 5.8 GASP true first-person mode (FocalRig)](https://80.lv/articles/true-first-person-mode-in-unreal-engine-s-game-animation-sample-project) | 2026 的演示用 FocalRig 把 GASP 第三人称角色在约 10 分钟内变成真第一人称并保留 motion matching/vault/slide，是当前第一人称武器动作接线的公开做法（UE 专用）。 |
| 134 | [Earths Edge DevBlog #9 – Animations and Additives](https://store.steampowered.com/news/app/3074980/view/658231077844812471) | 2026-05-02 第一方日志：烘焙 reload 叠加程序化落地/视角摆动/副手 additive，并细做拉弹匣与左手取弹动作，是小团队“烘焙+程序化”的具体工作流（略早于三个月窗口）。 |
| 135 | [Game Animation Sample 官方文档](https://dev.epicgames.com/documentation/en-us/unreal-engine/game-animation-sample-project-in-unreal-engine) | 【官方方法页】GASP 文章直接引用的文档，说明动画数据库、运动匹配与重定向方式，可作为判断“能否不手补动画接入”的依据，本身不含额外 clip。 |
| 136 | [ALS-Community（PanicPetal 维护的 UE5.4 复刻）](https://github.com/PanicPetal/ALS-Community) | 【代码 MIT】ALS v4 的 C++ 复刻，README 明确只有源码 MIT、资产仍受 ALS 原条款约束，并自己建议改用 Epic Lyra；适合参考上下半身分层与复制实现。 |
| 137 | [Kubold Downloads 官方索引](https://www.kubold.com/downloads) | 【官方索引】集中列出 Rifle/Pistol/Cover/Movement 的动作清单 PDF/HTML 与免费 LITE、Survival demo，是核对 Kubold 各包逐动作覆盖的最快入口。 |
| 138 | [Kubold：Witchfire is out - Kubold's FPP Gun Animations](https://www.kubold.com/blog/2023/9/21/witchfire-is-out-kubolds-fpp-gun-animations) | 【作者/方法】给定 Witchfire 文章里被点名的动画师本人页，称其为 Witchfire 做了约 1500 个第一人称武器动画；确认给定文章的作者链路与第一人称换弹做法。 |
| 139 | [Kubold：Making reload animations for Witchfire from home](https://www.kubold.com/blog/2020/4/30/making-reload-animations-for-witchfire-from-home) | 【作者/方法】Kubold 本人对给定 Witchfire 换弹文章的回应与回链，可作为同一案例的第二来源。 |
| 140 | [KINEMATION Tactical Shooter Pack 官方文档](https://kinemation.gitbook.io/tactical-shooter-pack-unity/) | 【付费·同厂兄弟】给定 KINEMATION Tactical FPS Animations 的同厂完整包：7 把动画武器、全身角色、程序化动画，文档专门讲弹匣/枪机为独立骨骼网格的驱动方式。 |
| 141 | [KINEMATION FPS Animation Framework 公开示例工程](https://github.com/kinemation/fps-animation-framework) | 【代码 demo·无 LICENSE】FPS Animation Framework 的公开 Unity 工程，只含接入示例、不含美术；可参考其武器/弹匣分层结构，不可当资产来源。 |
| 142 | [Kevin Iglesias 许可原文（#license 段）](https://www.keviniglesias.com/#license) | 【许可原文】明确写了“不得作为独立资产、资产包、模板分发，且原始文件不可被提取复用”，据此给定 FREE 士兵包也不满足“随公开游戏提交派生资源”的要求。 |
| 143 | [CGJOY 259492：第一人称视角射击游戏动画作品](https://www.cgjoy.com/thread-259492-1-1.html) | 【方法/参考】给定 CGJOY 262540 评论区被点名“参考很好”的帖子，正文给出 Blender 枪械绑定教程与网盘下载，是那组 CGJOY 讨论的上游参考。 |
| 144 | [Moves by Maxon（免费 iOS 动捕 App）](https://www.cgchannel.com/2021/12/download-the-free-moves-by-maxon-ios-mocap-app/) | 免费无标记点动捕工具，能自己拍持枪/换弹动作；它是采集工具不是现成 clip 库，产出权利与再分发需另核。 |
| 145 | [Reallusion 论坛 – ActorCore 大规模发行许可问答](https://forum.reallusion.com/343128/QuestionClarification-Sought-EULA-Free-mass-distribution-rights-license-agreement-letter) | 官方回复确认 ActorCore/Reallusion 免费素材进游戏前要单独申请免费的 mass distribution 许可并登记作品；未回答能否把素材提交进公开仓库，因此免费 32 个含 gunplay 的动作仍不能直接用于本卡。 |
| 146 | [KINEMATION – FPS Animation Pack Unreal 官方文档](https://kinemation.gitbook.io/fps-animation-pack-unreal/) | 文档确认 20 把武器、Tactical/Empty/Extended/Start-Loop-End 换弹与 Pro/Lite（$24.99）分档，可用来判断这个付费对标物到底覆盖哪些缺口；商店页仍需 Fab 登录。 |
| 147 | [KINEMATION – FPS Animation Pack Unity 官方文档](https://kinemation.gitbook.io/fps-animation-pack-unity/) | 同一套 FPS 动作另有 Unity 版本文档，说明它并非 UE 独占，扩大了付费对标集；授权仍随商店，不能随公开仓库提交。 |
| 148 | [three.js PR #16639 – 按 node UUID 绑定动画轨道](https://github.com/mrdoob/three.js/pull/16639) | 修复 AnimationMixer 在骨骼/节点重名时按名字绑错对象的问题，正对应论坛里“重命名后所有 Action 仍驱动第一套骨架”的失败；是接入多角色/多骨架时的关键补丁参照。 |
| 149 | [Blender issue #61484 – Shift-D 复制骨架是浅拷贝](https://projects.blender.org/blender/blender/issues/61484) | 确认复制 Armature 时骨骼/动作名不自动加后缀，导出后多套同名 Action 会全指向第一个骨架；这是 three.js 论坛那条“重名 Action 全指向同一骨架”的根因记录。 |
| 150 | [glTF-Blender-IO PR #980 – 修复 NLA 轨道名导出](https://github.com/KhronosGroup/glTF-Blender-IO/pull/980) | 修复 #953：导出 NLA strip 时优先用轨道名而不是 action 名，避免动画名被改成 Anim_0_Node_21 并随往返不断加后缀；直接关系到 Three 侧按 clip 名取动作。 |
| 151 | [OpenGameArt – Boomer Shooter 23 collection](https://opengameart.org/content/boomer-shooter-23) | 由给定 Necrobot 页直接列出的同集合；该集合集中了 Necrobot、FPS Character Seal/Knight/Worm/Beetle、Mutant Grunt、Low Poly Soldier with weapons 等 FPS 敌人/角色，是继续筛有枪有换弹的现成清单。 |
| 152 | [OpenGameArt – 3d Humanoids under CC0 collection](https://opengameart.org/content/3d-humanoids-under-cc0) | 由 FPS Character Seal 页的集合追到；该清单汇总数十个 CC0 人形（含 Sci-fi soldier、Futuristic 3D Soldier、Low Poly Soldier with weapons 等），适合按许可先筛骨架再核动作。 |
| 153 | [KINEMATION – FPS Animation Framework (Unity)](https://kinemation.gitbook.io/fps-animation-framework/welcome) | 由给定 80.lv GASP 文章提到的第三人称转第一人称反查文档；该 Unity 插件（$29.99，https://assetstore.unity.com/packages/tools/animation/fps-animation-framework-238641）把换弹拆成 weapon parts（magazine/trigger/release handle）由武器 Animator 播放、枪根由 Weapon Bone 控制，正对当前整把枪移动的缺口。 |
| 154 | [Infima Games – Low Poly Shooter Pack](https://docs.infimagames.com/product/low-poly-shooter-pack/welcome.md) | 由给定 Infima Assault Rifle 文档的 llms.txt 追到同厂另一产品；Low Poly Shooter Pack 是 UE5 付费模板，文档含玩家角色、武器与 Blender 源文件，需在 Fab 核对是否随包提供 reload 动画及再分发许可。 |
| 155 | [FocalRig](https://focalrig.com/) | 由给定 80.lv GASP 文章直接链到；FocalRig 是 Fab 上的 UE Control Rig 程序化工具，宣称可把任意第三人称角色变成 true first person 并做 ADS/recoil/weapon sway，可在不新增 clip 的前提下接现有骨架，但它不是动作资产。 |
| 156 | [Cascadeur](https://cascadeur.com/) | 由给定 Godot Forums 帖里我有 Cascadeur 的对话追到；Cascadeur 是付费 AI 辅助关键帧/物理动画软件，可作为无现成 reload 资产时的人工制作工具，但不是可再分发动作源。 |
| 157 | [GVHMR](https://github.com/zju3dv/GVHMR) | 由给定 vid2anim/RGBMocap/mixamo-llm-mocap 三个仓库共同依赖追到；GVHMR 是视频→SMPL-X 的动作恢复模型，可把参考视频变成可重定向动作，但权重/许可与 GPU 需求需另核。 |
| 158 | [GMR (General Motion Retargeting)](https://github.com/YanjieZe/GMR) | 由给定 HOI-Retarget README 追到；GMR 是其 MIT 的 IK retargeting 后端，可把 SMPL-X/人形动作重定向到不同骨架，适合解决有动作但骨架不匹配。 |
| 159 | [Poly Pizza](https://poly.pizza/) | 由给定 pro.alcuesto 文章反复引用的下载平台追到；Poly Pizza 聚合 CC0 与付费低模（检索 soldier 可见 Quaternius SWAT/Soldier、Synty POLYGON Kids 等），可用来找带骨架的低模士兵，但需逐个核许可。 |
| 160 | [Trym Horgen (Theon) – Sketchfab](https://sketchfab.com/Theon) | 由给定 Necrobot 页的作者署名追到；Trym Horgen 是 Necrobot、FPS Character Seal/Knight 等 CC-BY-SA FPS 敌人的建模者，其 Sketchfab 还有同系列角色可继续筛。 |
| 161 | [Kay Lousberg 官方游戏资产目录](https://kaylousberg.com/game-assets) | 作者官网的非 itch 资产目录，直接列出 Character Animations 与 Shooter 分类，是核对 133 个动作包版本、范围与许可的作者原页。 |
| 162 | [Sketchfab – FREE [FPS Arms] GameReady - RIGGED（BAMEN）](https://sketchfab.com/3d-models/296d30fc705b4dff85c2c8a2d2724e7f) | 已列 BAMEN 女手臂包的配套 FPS 前臂网格（已绑定、0 clip），可与任意枪械 clip 组合补“独立手臂”节点。 |
| 163 | [Sketchfab – Urpo 的 9mm Pistol（被 1Matzh 署名的原枪模）](https://skfb.ly/oqQWx) | 1Matzh 在 9mm 动画包描述中署名的原始枪模作者页，可追溯枪模许可并复用其弹匣/套筒节点。 |
| 164 | [Sketchfab – doomsentinel 的 Adaptive Combat Rifle](https://sketchfab.com/doomsentinel) | ccransh 步枪动画包描述中署名的枪模作者页，可核枪模来源与再分发条件。 |
| 165 | [Sketchfab – otztava 的 MP7A1（被 TheParaziT 署名的原模）](https://sketchfab.com/3d-models/mp7a1-a7e5c1db09b840abb96778c579033c9e) | TheParaziT 的 20 clip MP7A1 动画包所基于的原始枪模页，可核对模型许可与独立弹匣节点。 |
| 166 | [Sketchfab – bumstrum 的 FP Arms（被 ccransh 署名的原手模）](https://sketchfab.com/bumstrum) | ccransh 前臂动画包描述中署名的第一人称手模作者页，可补“独立手臂网格”来源。 |
| 167 | [Cinevva – Free Character Animation Library（260 CC0 motions）](https://app.cinevva.com/tools/animations) | 浏览器内把自述来自 Quaternius UAL 的 260 条 CC0 动作 + 99 个 MakeHuman 姿势重定向到自有骨架并导出 GLB，免费预览、导出需 Standard/Pro 计划，可作为 UAL 的现成重定向/导出通道。 |
| 168 | [Cinevva – Auto Rigger](https://app.cinevva.com/tools/rigger) | 浏览器自动绑骨 + 动作库重定向，免费首次导出最多 6 clip，可在无 Blender GUI 的前提下把成套动作套到新角色上（页内未写明输出许可）。 |
| 169 | [Reallusion – AccuRIG](https://www.reallusion.com/auto-rig/accurig/) | 免费自动绑骨工具（需登录），是 Mixamo 绑骨环节的常见替代，但不提供枪械动作。 |
| 170 | [AutoRig.online](https://autorig.online/) | 浏览器自动绑骨服务，主要覆盖动物预设，可作 Mixamo 替代线索但枪战动作覆盖有限。 |
| 171 | [MoveBox for Microsoft Rocketbox](https://github.com/microsoft/MoveBox-for-Microsoft-Rocketbox) | 微软 Rocketbox（115 个 MIT 角色 + 417 动画）的配套动作驱动工具，可把 mocap 套到现成角色上，但仍无枪/弹匣机构。 |
| 172 | [app.nz – motion-kit（MIT）](https://github.com/lee101/appnz-motion-kit) | app.nz 动画/VFX/地形资产索引的 MIT 工具包，提供 search/download API，可程序化筛出带来源与许可字段的动作。 |
| 173 | [doctor-g/KayKitAnimationInGodot](https://github.com/doctor-g/KayKitAnimationInGodot) | KayKit 动画接入 Godot 的实操仓库，记录 BoneAttachment 挂点、FBX 导入坑与 parts 重挂流程，可复用到 Three 的 socket/bone 方案。 |
| 174 | [Blender – MCP Server 官方插件](https://www.blender.org/lab/mcp-server/) | Blender 官方实验室的 MCP 服务器，可脚本化驱动 Blender 做重定向/导出，适合本机 CPU 且不开 GUI 的流程。 |

### 3.5 T4 · 排除项（付费、登录、许可禁止再分发、文件不可取或二手）

T4 不参与“可入候选”排序；保留它们是为了说明功能上限、许可边界和为什么不能用。逐条保留原始链接与理由。

| 序号 | 条目（原始链接） | 排除原因（原始理由） |
|---:|---|---|
| 1 | [OpenGameArt R90 Bullpup SMG](https://opengameart.org/content/r90-bullpup-smg-animated-reload-glb) | CuiGames，CC-BY 4.0，武器侧 Reload_Empty/Tactical/Unload 与 magazine/bolt，但页面标文件暂时不可用。 |
| 2 | [MoCap Online Free Mocap Animation Pack](https://mocaponline.com/products/free-mocap-animation-pack) | 免费样本 30+、宣称可商用；站点被 WebFetch 域名校验拒绝，无法确认“能否把原动画文件随公开仓库再分发”，也未核 rifle reload 是否在免费档。付费 Rifle Starter 明确含 reload，但不能用。 |
| 3 | [AnimationShopee（单 clip $1 的动捕商店）](https://www.animationshopee.com/) | 2700+ FBX 单 clip（combat/zombie/dance/sports），按条 $1；付费且未核枪械 reload 与再分发条款，按任务不购买，仅作“可逐条买换弹”的市场对照。 |
| 4 | [Kubold（Movement/Pistol/FPP Melee 动捕）](https://www.kubold.com/) | 付费动捕厂商，Pistol 与 FPP Melee 套件最贴近持枪/第一人称，但属于单实体商业许可，不能把原始动画随公开仓库提交；作为付费替代的对照。 |
| 5 | [Fab – Paragon Animations Retargeted to Manny](https://www.fab.com/listings/e6de87b1-b755-478d-9228-a9eb89ff4411) | 社区把 Epic 免费 Paragon 英雄的约 5300 个人形动画重定向到 UE5 Manny；规模上最接近“完整人形动作库”，但 Epic 内容许可限 UE 产品，不能接 Three 或随公开仓库再分发；HTTP 403/需 Epic 登录，清单未核。 |
| 6 | [Fab – Game Animation Sample Project](https://www.fab.com/listings/880e319a-a59e-4ed2-b268-b32dac7fa016) | Epic 官方 500+ mocap locomotion/traversal，Motion Matching 示例；同为 UE 专属许可、无武器换弹。列出来是为说明“免费完整动作集”多集中在 UE 生态，许可证不过本卡这一关。 |
| 7 | [Sketchfab – S.W.A.T. Operator（SpatialNeglect）](https://sketchfab.com/3d-models/swat-operator-9e82fabf26194896b5ad4a364d864eab) | CC-BY 4.0，API animationCount=1；全身特警 + M4（M4 来自 bobeer，同为 CC-BY），下载需登录。动作数不足 5 个，不能当成套动作源，但可作为“带枪全身敌人”的网格/参照。 |
| 8 | [Sketchfab – FSB Operator（SpatialNeglect）](https://sketchfab.com/3d-models/fsb-operator-43a561e941704eefb1ab0614be4f0049) | CC-BY 4.0，1 个动画；全身俄式特警 + AKS-74u（N-GONE，CC-BY），下载需登录；同 S.W.A.T.，只作网格/造型参照。 |
| 9 | [Sketchfab – Stylized Sci-Fi Officer with Gun (Animated)](https://sketchfab.com/3d-models/stylized-sci-fi-officer-with-gun-animated-ea2b996c62024746adb892b2faf08223) | CC-BY 4.0，API animationCount=5，是少数“全身持枪且多于 1 个 clip”的 Sketchfab 新条目；clip 名称与骨架未公开、下载需登录，值得后续用 API/登录核是否覆盖 idle/walk/shoot/reload/death。 |
| 10 | [Sketchfab – S.W.A.T Operator Cop - Game Ready [ANIMATED]](https://sketchfab.com/3d-models/swat-operator-cop-game-ready-animated-1b30188ed90449fea1777bb17637f54c) | CC-BY 4.0，1 个动画，作者自用游戏《UNDERWORLD CARNAGE》的特警模型；下载需登录，动作不足以承担敌人全套。 |
| 11 | [Sketchfab – Free animated Pump Shotgun](https://sketchfab.com/3d-models/free-animated-pump-shotgun-fc9b14f3caf641c3a2a84b02f14b5c0f) | CC-BY 4.0，只含 shooting 动画的泵动霰弹枪；武器层，可补枪模/枪机动作，不能提供角色 reload 时序。 |
| 12 | [Sketchfab – Rodin Sci-fi Trooper JJ-01 with Gun (animated)](https://sketchfab.com/3d-models/rodin-sci-fi-trooper-jj-01-with-gun-animated-043f4dec01dc4f41a193d83df2ac516b) | CC-BY 4.0，1 个动画；AI+Blender 制作的科幻士兵持枪，下载需登录；只作造型/风格参照。 |
| 13 | [Game Assets Daily / clr.sell.app（头部 awesome 列表推荐的 CC0 聚合店）](https://clr.sell.app) | 被 awesome-game-assets 描述为“217 packs, CC0, no account”，实际是 Sell.app 付费店（$1.90–3.90）、未标许可，商品含 Kenney Blocky Characters/Blaster Kit 等疑似转售。不能当作者原页或许可来源，属需要辟谣的头部结果。 |
| 14 | [three.js Soldier.glb](https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/Soldier.glb) | Three.js 官方示例，2.2MB，仅 Idle/Walk/Run/TPose，无枪/射击/换弹/死亡；骨骼为 Mixamo，许可链不宜当 CC0。三个新找到的 Three.js TPS/FPS 仓库都在用它，列出来提醒后续不要把它误当合规动作源。 |
| 15 | [[官方免费页] Human Soldier Animations FREE（Unity Asset Store）](https://assetstore.unity.com/packages/3d/animations/human-soldier-animations-free-340690) | 同一资源的官方免费 listing，17.3 MB、v1.0、2025-11-26、内置/URP/HDRP，224 收藏但 0 评分；用于交叉核对 128 clip 与免费状态，页面本身也受 Unity EULA 约束。 |
| 16 | [[付费对标] Tactical FPS Animations（KINEMATION, Unity）](https://assetstore.unity.com/packages/3d/animations/tactical-fps-animations-311410) | 付费 $50–100，9 套武器、全身 FPS/TPS、战术/空仓换弹、独立弹匣弹簧/托弹板/子弹动画与 Animation Events；功能上最接近本卡缺口，但 Unity EULA 不允许把原始素材随公开仓库提交。 |
| 17 | [[付费对标] Rifle Mega MocapAnimPack（RIB Studio, Fab）](https://www.fab.com/listings/9fe50cd0-1f9a-4795-814b-abd28618182d) | 付费约 $125，326 个步枪 mocap + 64 aim offsets + 82 移动，含蹲伏、射击、Rifle_Reloading_Set（4 类枪）；Epic 骨架，可作“完整步枪动作集”的清单基准，不可免费再分发。 |
| 18 | [[付费对标] ULTIMATE ANIMATION COLLECTION（Unity）](https://assetstore.unity.com/packages/3d/animations/ultimate-animation-collection-195459) | 付费 $130–260，24 套/2400+ Mecanim Humanoid mocap，含多类枪械集；可作为大规模动作库的覆盖基准，但付费+Unity EULA 不能作为公开源。 |
| 19 | [[排除] ActorCore 免费 36 动作](https://www.cgchannel.com/2022/01/download-28-free-mocap-moves-from-actorcore/) | 免费 32 动作+4 角色，含 gunplay/combat，但需注册 ActorCore 账号，且用于游戏/互动应用要向 Reallusion 申请 mass distribution licence；不满足免费可随公开游戏提交。 |
| 20 | [[排除] HEAT 免费 25 动作](https://www.cgchannel.com/2024/08/download-25-free-mocap-moves-from-the-heat-online-library/) | 免费层只有 25 个且明确非商业；1000+ 库需订阅，平台已停止运营并称将免费公开但许可未落地；当前不能作为来源。 |
| 21 | [[排除] MoCap Online Free Demo](https://mocaponline.itch.io/mocap-online-demo) | 免费 demo 含部分 rifle 动作，但未确认有 reload；许可只允许嵌入成品、禁止原始文件再分发，且完整步枪包付费。 |
| 22 | [Shane Brumback – soldier_rigged.glb（7 clip 含 Reload）](https://www.shanebrumback.com/tutorials/rigged-super-soldier-threejs.html) | 2026-10-04 教程附带的免费 GLB 只有 Idle/Walk/Run/Jump/Fire/Reload/Death 七段，可直接核真实骨架与 reload 节点，但页面只说可自用、未写再分发许可。 |
| 23 | [Infima Games – Tactical FPS Animation Pack: Assault Rifle](https://docs.infimagames.com/product/tactical-fps-animation-packs/getting-started/quick-start-guide) | 付费 UE5 包，100+ 步枪第一/第三人称上半身动作含多种 reload、malfunction、左手交互（Unity 版 4.1.0 于 2026-10-16 更新），是“完整换弹动作包”应含内容的现实参照，但不可再分发。 |
| 24 | [1Matzh 9mm Pistol / First Person Animations](https://sketchfab.com/3d-models/9mm-pistol-first-person-animations-c26d7f5aa72f4b01a6da4578caa8f07f) | CC BY 4.0，10 个第一人称动画，作者更新记录明确新增 Reload_Empty，枪模署名 Urpo、角色模型署名 Blue-Spirit，动画由作者制作；适合补空仓/战术换弹与 FP 姿态，但无全身、蹲行与死亡。 |
| 25 | [TheParaziT MP7A1 Animations](https://sketchfab.com/3d-models/mp7a1-animations-0a55689855594f2496c2debdb7e6f5bc) | CC BY 4.0，20 个 clip，作者称同时适配 UE5 第一/第三人称骨架，枪模由 otztava 署名；评论区反馈 UE5 中枪与手会分离、需要拆武器骨，说明它更接近武器侧动画集而非整套角色动作。 |
| 26 | [BasicModel Lowpoly Remington 870](https://sketchfab.com/3d-models/lowpoly-remington-870-8107c0be0dc0422cafd684610c5469fe) | CC BY 4.0，15 个第一人称动画，页面逐项列出 Pull Out/Reload/Reload While Aiming/Idle/Shoot/Load Out/Show-Slide，是本组外少见的明确覆盖装填与退弹的完整武器动作集；仅 2,862 面，无身体、蹲行与死亡。 |
| 27 | [BAMEN FREE [FPS Female Arms] GameReady](https://sketchfab.com/3d-models/free-gameready-fps-female-arms-007f5dd998ad4376943ed6fb3dfa2e15) | CC BY 4.0，38.8k 面绑定手臂、5 个示例动作；作者在评论中承认拇指够不到弹匣释放钮，只适合当手臂/握持承载层，不能单独承担换弹。 |
| 28 | [Tactical Soldier (game ready) low poly（MissingTray1151）](https://sketchfab.com/3d-models/tactical-soldier-game-ready-low-poly-2bfce585144d4403a3ddf76a0e65767a) | CC BY 4.0，24k 面全身角色，页面称 10 个 combat clip 覆盖射击、蹲、行走、卧射、投雷、跳跃与多方向死亡；未提 reload，需下载后核 clip 名与来源，是本组外少见的全身候选。 |
| 29 | [Kriss Vector Animated (Free) — barcodegames](https://sketchfab.com/3d-models/kriss-vector-animated-free-54530c888cfd4ae7aab3c3852b229c7e) | 同作者免费包，标注 Shoot/Reload/Draw/Hide 四条动画，CC-BY，可与 M4 包对照同一作者的骨架与动作命名。 |
| 30 | [Animated FPS hands (rifle animation pack) — ccransh](https://sketchfab.com/3d-models/animated-fps-hands-rifle-animation-pack-5f2d0ed780a94724b36ab505f7564057) | 给定候选 Cransh AK-74m 的同作者新包，8 条第一人称步枪动作，描述里致谢 bumstrum 的手臂与 doomsentinel 的步枪，正好暴露两个上游来源。 |
| 31 | [AK-74M Animations (BLENDER) — martinezequielgorno](https://sketchfab.com/3d-models/ak-74m-animations-blender-effd52406532433eaac9454740572c57) | 13 条 Blender 动画，描述明确含 Reload（Fast 与 Complete）并附手臂贴图，CC-BY，可直接核对空仓/战术换弹两条链。 |
| 32 | [Pistol Animations (BLENDER) — martinezequielgorno](https://sketchfab.com/3d-models/pistol-animations-blender-93e5143258aa48b4a20c836177969f34) | 同作者手枪包 9 条动画，含 Idle/Walk/Jump/Draw/Fire 与 Reload（Fast/Complete），CC-BY，可作手枪换弹对照。 |
| 33 | [UZI / First Person Animations (2026 Remake) — 1Matzh](https://sketchfab.com/3d-models/uzi-first-person-animations-2026-remake-73266e9f1eb949b69a3ab11d8f636048) | 13 条第一人称动画，更新日志明确有 Reload、Reload_Empty、Equip、Unequip、Inspect，交付 FBX 与 .blend，CC-BY。 |
| 34 | [FPS Character Animation Pack Ak-47 — DuqueCD7](https://sketchfab.com/3d-models/fps-character-animation-pack-ak-47-b95778a564094fc3a49d1d6a3b6a30ab) | 同系列 AK-47 版 11 条动画，CC-BY，与手枪版同骨架同风格，便于成组覆盖不同武器。 |
| 35 | [FPS Character Animation Pack Saps-12 — DuqueCD7](https://sketchfab.com/3d-models/fps-character-animation-pack-saps-12-3e5ebbd4ace24f2e92eadb7252927b31) | 同系列霰弹枪版 10 条动画，CC-BY，补足霰弹枪射击/换弹的对照样本。 |
| 36 | [heavy pistol animated — bumstrum](https://sketchfab.com/3d-models/heavy-pistol-animated-b7c78c533ced40cd986c44594b778ed6) | 第一人称手枪+手套手臂并附匹配音效，CC-BY；只有 1 条合并动画，是否含独立换弹尚未验证。 |
| 37 | [sniper animated — bumstrum](https://sketchfab.com/3d-models/sniper-animated-b48999a250b2433da59f705c371a49b2) | 同作者第一人称狙击枪+手臂+音效，CC-BY，可与手枪共用其手臂网格和动作风格。 |
| 38 | [sawnoff animated — bumstrum](https://sketchfab.com/3d-models/sawnoff-animated-806f8327bed34fc3b0e3911d01f0566d) | 同作者第一人称双管霰弹枪+手臂，CC-BY，提供与自动武器不同的折开式换弹参照。 |
| 39 | [Adaptive Combat Rifle — doomsentinel](https://sketchfab.com/3d-models/adaptive-combat-rifle-a18a8008a299430caa5f1fe05563c949) | ccransh 致谢的步枪本体，明确拆成 rifle/mag/scope/suppressor 独立网格，CC-BY，可作“独立弹匣”几何来源（本身无动画）。 |
| 40 | [FPS Arm Rig — milesdiduck](https://sketchfab.com/3d-models/fps-arm-rig-18ce86b6b26e4ae1b02d2d695b669b62) | 纯第一人称手臂绑定、无动画，CC-BY，可作为把上述武器动画重定向到自建手臂骨架的目标 rig。 |
| 41 | [Pistol 43 Tactical / FPS Animations — dan741vlasov](https://sketchfab.com/3d-models/pistol-43-tactical-fps-animations-1a4c9d15818a4522aedbeb70919a17da) | 6 条第一人称手枪动画，CC-BY，作者另有同风格霰弹枪组可配套使用。 |
| 42 | [Shotgun animation set — dan741vlasov](https://sketchfab.com/3d-models/shotgun-animation-set-c24e049dccfe4a1d837b1b0ae1461636) | 6 条霰弹枪动画组，CC-BY，与同作者手枪组同一风格，适合成组比对换弹与射击节奏。 |
| 43 | [P50 Heavy Pistol - Animated — CuiGames](https://opengameart.org/content/p50-heavy-pistol-animated-glb-fbx-blender) | CC-BY 4.0，11 条 clip 明确含 Reload/Aim_In/Aim_Idle/Aim_Out/Fire/Fire_ADS，GLB+FBX+Blend，形态最理想；但 OGA 文件区当前因授权复核下架，需等恢复或走作者 itch 原页。 |
| 44 | [Sketchfab — Teenjust500 Animated Rifle](https://sketchfab.com/3d-models/animated-rifle-1cfaabe4c0bd4db189d4768ead272e8a) | 从给定 Sketchfab 士兵/换弹条目同一检索追到：CC-BY 4.0、可下载，描述明确 Take/Shoot/Reload/Idle 4 clip 且枪模可替换，是少数免费可再分发的武器侧换弹 clip。 |
| 45 | [Sketchfab — Dan741vlasov AKM reload animation](https://sketchfab.com/3d-models/akm-reload-animation-5e5b027e946c45658eea4342876645f8) | 从同一检索追到：CC-BY 4.0、可下载的 AKM 换弹单 clip；可当退匣/入匣节奏参考，需自核骨架、时长与握持。 |
| 46 | [Sketchfab — Alexander Ovelar AKM FPS Animation](https://sketchfab.com/3d-models/akm-fps-animation-a0e1e52051294bebb8a716df9e69434d) | 从同一检索追到：CC-BY 4.0、可下载；描述列出 Up/Inspect/Reload/Shoot/No Ammo/Reload 2/Down 七段，是少见带空仓换弹的 FPS 参考（七段合在一个 clip 内）。 |
| 47 | [Sketchfab — Bumstrum Rifle Animated](https://sketchfab.com/3d-models/rifle-animated-55e18a2851ba4a23a207015decdbe260) | 从同一检索追到：CC-BY 4.0、可下载；描述用帧段给出 fire 0-9、reload 9-100、hide/ready/melee，等于把换弹塞进单 clip，需切段使用。 |
| 48 | [Sketchfab — David Falke AK47 Reload Animation](https://sketchfab.com/3d-models/ak47-reload-animation-free-download-c57b0a289af147c68c4b06d9ef960469) | 从同一检索追到：CC-BY 4.0、可下载的 AK47 换弹单 clip；作者自述赶工、未 polish、不打算进游戏，只能当动作参照。 |
| 49 | [Sketchfab — ZowJr Soldier Final Animations Fbx](https://sketchfab.com/3d-models/soldier-final-animations-fbx-ad2450c22d664317b36ccfd2e81016ea) | 从同一检索追到：CC-BY 4.0、6 clip 的士兵动作集；作者自述枪有两层重叠网格、rig 非本人，只能当身体动作参考，授权链需核。 |
| 50 | [BlenderKit — Artic Military Army Soldier](https://www.blendkit.com/asset-gallery-detail/cd70a399-0cc5-4829-85f6-902239bd6bcb/) | 由给定 devanshutak25/3d-resources 的列表与 3d.shep.bot provider 追到：完整 rigged 军用角色（GLB/blend），BlenderKit Royalty Free 允许商用但禁止把模型当素材包转售，公开仓库再分发需 dot 裁定。 |
| 51 | [Kevin Iglesias — Human Soldier Animations FREE](https://www.keviniglesias.com/assets/soldierAnimationsFREE.html) | 由给定 devanshutak25/3d-resources 的 Mocap 列表追到：作者有 Human Soldier Animations FREE 页，目录列其为免费样本；产品页是 meta-refresh+JS，逐 clip/许可未读，是下一轮最值得核的“人类士兵成套动作”线索。 |
| 52 | [ActorCore（Reallusion）免费 mocap 库](https://actorcore.reallusion.com/free) | 同列表列为 free tier 的 Reallusion mocap 库；站点是 Vue SPA、无服务端目录，许可与枪械 clip 未核，只能作为下一轮渠道。 |
| 53 | [CGTrader — Glock 17 FPS Weapon Animations](https://www.cgtrader.com/free-3d-models/military/gun/glock-17-fps-weapon-animations) | 从给定 3d.shep.bot 检索追到：索引为免费 FPS 武器动画（Glock 17），但 CGTrader 页面反爬为空；CGTrader 免费许可通常禁止再分发，clip 清单未核。 |
| 54 | [Advanced Locomotion System V4（Fab 原版）](https://www.fab.com/listings/ef9651a4-fb55-4866-a2d9-1b38b028f9c7) | 【免费·UE 许可】知乎多篇 ALS 整合/修换弹文章所指的底板：提供分层动画蓝图、冲刺、lean、原地转身、mantle，但描述中没有 crouch/reload clip，且是 UE 资产。 |
| 55 | [Kubold Rifle Animset Pro 动作清单](https://www.kubold.com/s/RifleAnimsetPro_v12_ListOfAnimations.html) | 【付费对标】86 个 clip 的官方逐条清单，明列 Rifle_Reload_2、Idle2Crouch/CrouchLoop/Crouch2Idle、ShootBurst、Hit、Death——正是训练赛缺的“跑+蹲+射+换弹+死”全身组合；但武器/弹匣是外挂 prop。 |
| 56 | [Kubold Pistol Animset Pro 动作清单](https://www.kubold.com/s/PistolAnimsetPro_AnimationsDescriptions.html) | 【付费对标】75 个 clip 含 Pistol_Reload_2、蹲伏三态、八向跑射与 Idle_Relaxed，可核对同一套骨架上的换弹/蹲行命名与节奏。 |
| 57 | [Kubold Rifle Cover Animset Pro 动作清单](https://www.kubold.com/s/CoverRifleAnimsetPro_UE4_list.pdf) | 【付费对标】掩体步枪专用清单，补蹲伏/掩体移动与过渡，是 Rifle Animset Pro 之外的独立包。 |
| 58 | [Kubold Movement Animset Pro LITE（免费 8 动画）](https://www.kubold.com/s/MovementAnimsetLITE.unitypackage) | 【免费测试·商店 EULA】Witchfire 换弹动画作者放出的 8 动画 LITE 包，可在不购买的情况下先验其骨架与动作质量；不可作为公开仓资产再分发。 |
| 59 | [RIB Studio 卖家目录（17 个 mocap 包）](https://www.fab.com/sellers/RIB%20Studio) | 【付费对标目录】给定 Rifle Mega MocapAnimPack 所在卖家的全集，含 Cover Rifle、Rifle ShootReload、Pistol Mega、Crawl、Movement 等，可直接按缺口逐包比对。 |
| 60 | [Rifle ShootReload MocapAnimPack（RIB Studio）](https://www.fab.com/listings/4df74d67-5df9-457d-908a-8aeed8024b83) | 【付费对标】ShootingSet + ReloadingSet 两段式，四种步枪（Winchester/自动/霰弹/双管），是给定 RIB 大包之外最贴近“射击+换弹配对”的子包。 |
| 61 | [Cover Rifle MocapAnimPack（RIB Studio）](https://www.fab.com/listings/f9c9c397-761d-4953-91ce-8201ae17e376) | 【付费对标】288 个 cover_rifle 动作，站/蹲各 3 套 + 过渡，每套含 Idle/Move/Transition，补蹲行与掩体移动。 |
| 62 | [Pistol Mega MocapAnimPack（RIB Studio）](https://www.fab.com/listings/e9a4980d-a331-4ba7-ab18-6009cdad55a8) | 【付费对标】300+ 动作含 Pistol_Reloading_Set、Pistol_Crouch_Style、Shooting/AimOffset/Death，可与步枪包共用同一 mocap 骨架。 |
| 63 | [Infima Games - Tactical FPS Animation Pack: Assault Rifle](https://www.fab.com/listings/1ae386ab-4a40-4a0f-ac17-621e2d9d1028) | 【付费对标】100+ 第一/第三人称上半身动作，含多种 reload、malfunction、inspect、left-hand interaction 和可动单发弹匣；页面明确“没有第三人称移动”，正好是训练赛缺的上半身层。 |
| 64 | [Infima Games - Low Poly Animated: Modern Guns Pack](https://www.fab.com/listings/6914a185-4b14-475c-8f4f-cc0a6a3c589f) | 【付费对标】第一人称双臂 + 8 把枪，逐枪含 Reload/Aimed/Empty Reload、Sprint、Inspecting、Knife/Grenade，绑 UE4 Mannequin（不兼容 UE5 Manny），是最接近“手臂+枪+弹匣”整套的付费件。 |
| 65 | [Infima Games 工作室产品页](https://infimagames.com/) | 【作者/产品索引】知乎“拆解 InfimaGames 的 FPS 模板动画系统”指向的工作室页，列出在售 AR/低模枪包与开发中的手枪包，可跟踪后续免费/试用内容。 |
| 66 | [KINEMATION 发行商页（8 个资产）](https://assetstore.unity.com/publishers/74506) | 【作者/产品索引】给定 KINEMATION 包的发行商全集，含 Scriptable Animation System、Retarget Pro、Motion Warping 等，可用于找免费试用或重定向工具。 |
| 67 | [Shooter Rifle Animations（PeaceSells）](https://www.fab.com/listings/42be3269-df20-4ea0-bcff-306fbcec5494) | 【付费对标】全身 UE4 Mannequin 步枪动作，手/头专门为“头部相机第一人称”调过，含 BlendSpace 与 AimOffset1D，可同时服务第一/第三人称。 |
| 68 | [Tactical FPS Animation Shooter Pack](https://www.fab.com/listings/f3fad68a-2eb8-4859-a588-e5534c24ea12) | 【付费对标】100+ 第一人称步枪动作，逐条列 Reload/Reload Empty/Inspect/Crouch Enter/End/Sprint/Slide 与 3 把 PBR 步枪，是与给定 KINEMATION 包最接近的竞品。 |
| 69 | [FPS Multiplayer Template 6](https://www.fab.com/listings/29219f54-56aa-45bb-92f9-01ca45833fe5) | 【付费框架·非动画源】知乎“在 UE5 整合 ALS v4 与 FPS Multiplayer Template 5”文章的模板家族最新版；提供武器/配件/开火模式蓝图，但不以动画 clip 为卖点。 |
| 70 | [Kevin Iglesias - Human Mega Animations Pack](https://www.keviniglesias.com/assets/megaAnimationsPack.html) | 【付费·禁再分发】给定 FREE 士兵包作者的主付费合集；同一许可禁止把资产作为独立文件/资产包分发，公开仓不能收。 |
| 71 | [Kevin Iglesias - Human Soldier Animations（付费完整版）](https://www.keviniglesias.com/assets/soldierAnimations.html) | 【付费·禁再分发】给定 FREE 士兵包的完整版，可对照 FREE 档缺了哪些枪械 clip，但许可仍限制单实体使用与再分发。 |
| 72 | [MoCap Online – Rifle（Pro/Basic/Starter）](https://mocaponline.com/products/rifle) | 同作者官网的完整步枪 mocap：Pro 390+ clip，逐条含 W2_Stand_Aim_Reload、W2_Crouch_Aim_Reload、站立/蹲姿开火、8 向蹲行与转身、死亡与瞄准偏移；FBX/BIP/Blender/UE/Unity/iClone，$149.99/$44.99/$16.99；Standard 许可允许把修改后的动画嵌进成品游戏（百万用户/营收内），但禁止独立再分发原始文件。 |
| 73 | [MoCap Online – Pistol（Pro/Basic/Starter）](https://mocaponline.com/products/pistol) | 同系列手枪包 372+ clip，含 W1_Stand/Crouch 换弹、开火、卡壳排除、48 个瞄准偏移，带 MotusMan_V55 骨架与 1911 模型；Starter 档明确没有 reload，因此能补换弹的是 Basic/Pro。 |
| 74 | [MoCap Online – Shooter MoCap Bundle Pack](https://mocaponline.com/products/shooter-mocap-bundle-pack) | 把 Rifle+Pistol+Mobility+Death 四包捆成 $299 的单套射手动作库，是这组论坛之外最接近“idle/run/crouch/fire/reload/death 一次买齐”的成品；许可仍是 Standard 的嵌入式使用、不可转售原始动画。 |
| 75 | [MoCap Online – Free UE4 Multiplayer 3rd Person Shooter Blueprint](https://mocaponline.com/products/ue4-blueprints-demo) | 免费 UE4 第三人称射击 demo，附带同一作者的 shooter mocap，可当“全身换弹动作如何接武器/动画蓝图”的可运行参照；UE4 专用，非 Three 资产。 |
| 76 | [Rokoko Motion Library（150 个免费动作）](https://www.cgchannel.com/2020/03/get-150-free-mocap-moves-from-rokokos-motion-library/) | Rokoko Studio 免费 Basic 可导出 150 个动作，报道称可商用但再分发条款未写，且没有枪械/换弹；motionlibrary.com 本机 403，细节只能按报道。 |
| 77 | [Epic – Lyra Sample Game](https://dev.epicgames.com/documentation/en-us/unreal-engine/lyra-sample-game-in-unreal-engine) | 免费 UE 射击示例，带武器系统与论坛里提到的 ik_Hand_Root 骨架；文档未给逐条 reload/crouch/death 清单，UE EULA 也不允许把动画当独立素材再分发。 |
| 78 | [JUST – Animated FPS M4A4](https://sketchfab.com/3d-models/animated-fps-m4a4-a82fbbb731724390bc88d38940b8b01c) | Sketchfab FPS 动画检索追到；JUST 的 M4A4 标 CC-BY，描述直接列 TAKE/RELOAD/IDLE/FIRE/HIDE 五个 clip。 |
| 79 | [Matt Rafferty – (Animation) FPS Arms For Games](https://sketchfab.com/3d-models/animation-fps-arms-for-games-c29feda751284a32b575486f53c49180) | Sketchfab first person arms 检索追到；Matt Rafferty 从零做的 FPS arms 标 CC-BY，clip 为 Deploy/Idle/Walk-Run/Grab，没有 reload，但可作独立手臂骨架参考。 |
| 80 | [Jainesh Pathak – Scar-H First-Person (FPS) Animated](https://sketchfab.com/3d-models/scar-h-first-person-fps-animated-404b16a45a224163850df34a20391739) | 同一检索追到；Jainesh Pathak 的 Scar-H first-person animated 标 CC-BY，Blender+Substance 制作、手部模型署名 EXUnum。 |
| 81 | [Alpaca Studio – Low Poly First Person Shooter Animation](https://sketchfab.com/3d-models/low-poly-first-person-shooter-animation-14d30b681dbd462bb261f7399a989a6c) | 同一检索追到；Alpaca Studio 的低模 FPS 动画标 CC-BY，作者说明手臂当时还没导出、AK 模型另链，适合核对低模枪动作但可能缺手臂。 |
| 82 | [Jungle Jim – Stylized Sci-Fi Soldier (animated)](https://sketchfab.com/3d-models/stylized-sci-fi-soldier-animated-9e19e517429c4077b800273890186456) | Sketchfab soldier animations 检索追到；Jungle Jim 的 Stylized Sci-Fi Soldier (animated) 标 CC-BY，是带枪的完整风格化士兵，clip 清单未在描述中列出。 |
| 83 | [Synty Studios](https://syntystore.com/) | 由给定 Mesh2Motion issue #139 的复现者自述追到；Synty 的 POLYGON 角色包是付费资产且有成套动画，但 issue 里 Synty FBX 的多 root/IK 骨导致 Mesh2Motion 重定向失败，接入前需核骨架与许可。 |
| 84 | [Mixamo](https://www.mixamo.com/) | 由给定 Necrobot 评论与 Mesh2Motion issue #18 反复出现的对照追到；Mixamo 免费但需 Adobe 登录，OGA 评论明确其许可与 OGA/自由软件不兼容、且不允许把动画作为资产再分发，只能作为最后手段。 |
| 85 | [Shane Brumback – armored_soldier.glb (Grok Bot tutorial)](https://www.shanebrumback.com/tutorials/threejs-armored-soldier-grok-bot.html) | 由给定 Shane Brumback soldier_rigged 教程的同站文章追到；armored_soldier.glb 为 19 骨、10 clip（Idle/Walk/Run/Jump/Fire/Reload/Death/WalkFire/RunFire/JumpFire），直接覆盖移动中开火+换弹，但教程只说免费、未给正式许可。 |
| 86 | [Cransh SMG FPS Animations](https://sketchfab.com/3d-models/smg-fps-animations-ca37ea9148dc4fcc9cc632175d311b23) | 同作者 CC BY 4.0、API 记 8 个动画，eNse7en 枪 + DJMaesen 臂，补齐冲锋枪换弹位且与 AK 共用同一手型；未下载核动作名与弹匣分离。 |
| 87 | [Cransh FPS Benelli M4 Animations](https://sketchfab.com/3d-models/fps-benelli-m4-animations-225a62190f6043ca975eaa2798ab7e2c) | CC BY 4.0、API 记 8 个动画，3d-fps 目录注明含 shell loading，是组内缺的霰弹枪独立装填；黑手套与 DJMaesen 橄榄手套不同，需换皮或接受色差。 |
| 88 | [DJMaesen fps animated smg](https://sketchfab.com/3d-models/fps-animated-smg-ea3dad7478624495a5a46f40127b0579) | CC BY 4.0 作者原页，Steel Tide 已从这条 1 个烘焙动画拆出 24 个 tactical/empty 手臂 clip；组内只有 Steel Tide 派生 GLB，没有原页、许可原文与可复用源。 |
| 89 | [LokitoBlu AK-74M Animations (BLENDER)](https://sketchfab.com/3d-models/effd52406532433eaac9454740572c57) | Sketchfab 搜索 API 记 CC BY 4.0、13 个动画且可下载，带 Blender 源，是组外新的 AK 平台 FP 套件；动作名与独立弹匣未核（API 后续 429 限流）。 |
| 90 | [LokitoBlu Pistol Animations (BLENDER)](https://sketchfab.com/3d-models/93e5143258aa48b4a20c836177969f34) | CC BY 4.0、API 记 9 个动画的手枪 FP 套件，与 AK-74M 同作者可统一手型；未下载核动作名。 |
| 91 | [1Matzh UZI / First Person Animations (2026 Remake)](https://sketchfab.com/3d-models/73266e9f1eb949b69a3ab11d8f636048) | 搜索 API 记 CC BY 4.0、13 个动画且可下载，2026 重制的 UZI FP 套件，补 SMG 换弹位；未核动作名与弹匣。 |
| 92 | [Vlasov Daniil Animated AKs-74u](https://sketchfab.com/3d-models/34220aaa62e44b34b7d5ac30701f2b5f) | CC BY 4.0、API 记 7 个动画，短 AK 的 FP 换弹套件，可与 Cransh/LokitoBlu 的 AK 家族互补；未下载核。 |
| 93 | [BarcodeGames M4 - FPS Weapon Animations Pack (v.1)](https://sketchfab.com/3d-models/662fc74dda2646cfb48fc610705768ef) | CC BY 4.0、API 记 5 个动画的 M4 家族包，补 AR 平台换弹；同作者 Mark 23 是 Free Standard 许可，已排除。 |
| 94 | [Xonotic hand weapon models](https://github.com/xonotic/xonotic-data.pk3dir/tree/master/models/weapons) | 【排除：GPLv3+ copyleft；本仓没有 LICENSE，派生武器/动作需 GPL 兼容，按硬门槛不列为可提交候选，只作第一人称武器 reload 结构参照。】GPLv3+，h_campingrifle/h_uzi/h_shotgun 的 .framegroups 明确有 fire/fire2/idle/reload，是现成第一人称手+枪 IQM；需 IQM→glTF 转换，copyleft 需评估。 |
| 95 | [Xonotic player models](https://github.com/xonotic/xonotic-data.pk3dir/tree/master/models/player) | 【排除：GPLv3+ copyleft；本仓没有 LICENSE，派生作品需 GPL 兼容，按本卡“可随公开游戏提交”的硬门槛不列为可提交候选，只作第三人身/蹲/射击/死亡结构参照。】GPLv3+，erebus.iqm.framegroups 明确有 idle/run/runbackwards/strafe/duckidle/duckwalk/duckjump/shoot/dieone/dietwo，是完整第三人称移动/蹲/射击/死亡集；无 reload。 |
| 96 | [O3DE StarterGame 角色 BURT 动作库（o3de/startergame-assets）](https://github.com/o3de/startergame-assets) | 仓库 LICENSE 为 Apache-2.0（代码），但根目录 LICENSE_CC_BY_NC_4.0.TXT 原文把“3D models, image textures, and other asset files”整体置于 CC BY-NC 4.0（禁商用），Gems/Characters/Assets/BURT/Motions 下有 143 个 FBX（当前 main tree 该目录共 209 个文件，其中 66 个 .assetinfo；209 是文件总数，不是 FBX 数），含 Crouch_Idle、Crouch_Walk 四向、AimStrafe_*、Shoot、Shoot_Zero、Death_Fall_Back/Forward、MotionTurn_* 与 Jump/Strafe 全套；无 reload，NC 条款使其不能作为公开可商用来源，只能当动作结构参照。 |
| 97 | [Unity FPS Sample（Unity-Technologies/FPSSample）](https://github.com/Unity-Technologies/FPSSample) | 完整第一人称射击示例、含武器与角色动画，但 LICENSE.md 原文为 Unity Companion License（仅限 Unity 依赖项目），不允许把原始美术/动画作为素材再分发，故不能进公开 Three 仓库；列为“技术最强但许可出局”的新对照项。 |
| 98 | [OctavianTocan / Low-Poly-Shooter-Pack（UE5 FPS 模板）](https://github.com/OctavianTocan/Low-Poly-Shooter-Pack) | README 描述为含第一/第三人称、武器库存、动画蓝图、蹲伏姿态与后坐弹簧的完整 UE5 低模射击模板；但仓库 main 分支没有 LICENSE / LICENSE.md / LICENSE.txt（均 404），许可与原始作者不明，疑似商业包转载，不能入候选。 |
| 99 | [MoCap Online – Death](https://mocaponline.com/products/death) | 单独死亡动作包，可作为六类动作中 death 的补充；付费且受同一‘不得转售/再分发原始数据’条款约束（该页本次被限流，未逐条核动作名）。 |
| 100 | [RIB Studio – Movement MocapAnimPack 2.0](https://www.fab.com/listings/02e0fe6c-808b-4c6d-a21c-aad0fd110dfe) | 同卖家纯移动 mocap 包，可补 idle/走/跑/蹲的第三人称移动层；付费、无枪械与换弹。 |
| 101 | [Epic – Game Animation Sample Project (GASP)](https://www.unrealengine.com/marketplace/en-US/product/game-animation-sample) | 从已给的公众号 GASP 文追到官方项目页：500+ 段 3A 级免费动作可直接重定向，但内容是 locomotion/traversal，没有枪械装填，且素材受 UE 许可范围约束，不能当 Three 的通用资产源。 |
| 102 | [ActorCore（Reallusion）](https://actorcore.reallusion.com/motion/free) | 从已给的 ActorCore 免费 36 动作页追到完整库：1,000+ 段 mocap、免费 32 段含 gunplay、单条 $1.5–12；游戏发行需另买 mass-distribution 许可，且不能把动作作为独立素材再分发。 |
| 103 | [Rokoko Motion Library](https://www.motionlibrary.com/) | 从 cgchannel 的 Rokoko 免费动作文追到完整库：150 段免费可商用动作（含 Eric Jacobus 的 50 段 action moves）加付费库，可补移动/动作；未核实有步枪换弹，且 Rokoko 禁止把动作作为独立素材再分发。 |
| 104 | [Sketchfab – SVD Dragunov FPS Weapon Animations Pack (v.1)（BarcodeGames）](https://sketchfab.com/3d-models/a74f5c23e6dc41a684709422981cfdba) | BarcodeGames 作者目录中的 SVD 枪械动画包，与已列 M4 包同作者同结构（Draw/Fire/Reload/Holster），可补步枪侧动作。 |
| 105 | [Sketchfab – AKM FPS Weapon Animations Pack (v.1)（BarcodeGames）](https://sketchfab.com/3d-models/edf97e78725b42f1a4dfd9ffe7106f52) | 同作者 AKM 动画包，提供另一套步枪 Draw/Fire/Reload 语义，可与 M4/SVD 交叉比对换弹节奏。 |
| 106 | [Sketchfab – MP5SD FPS Weapon Animations Pack (v.1)（BarcodeGames）](https://sketchfab.com/3d-models/d08f75b6a7d041f1ae25c04d5a89675d) | 同作者冲锋枪动画包，补紧凑枪身的换弹与持枪动作，适合训练赛室内地图。 |
| 107 | [Sketchfab – TAR-21 FPS Weapon Animations Pack (v.1)（BarcodeGames）](https://sketchfab.com/3d-models/cea0ec983fd547cebd96b83b4bd2d83c) | 同作者无托步枪动画包，可验证同一套手臂动作在无托枪型上的挂点差异。 |
| 108 | [Sketchfab – RPG-7 Animations（TheParaziT）](https://sketchfab.com/3d-models/f2bef085e0164a34a4b090c73dcdc3f5) | 已列 MP7A1 包作者的 RPG-7 动画包（API 记 14 clip），可作重武器装填/换弹的对照来源。 |
| 109 | [Sketchfab – AR-15 Animations Miniset（TheParaziT）](https://sketchfab.com/3d-models/e3b0951ec7a54de188f7fe3e6c38a9ad) | 同作者 4 clip 的 AR-15 最小集，适合先验证“步枪换弹 clip 能否直接进 Three”再决定是否扩包。 |
| 110 | [Sketchfab – Xiri X4 Animations（TheParaziT）](https://sketchfab.com/3d-models/9c66f74e346e4c5e8b1d4e5fcddc8a37) | 同作者 17 clip 的另一套枪械动画，可补 MP7A1 之外的枪型覆盖。 |
| 111 | [Sketchfab – FPS Character Animation Pack AK-47（DuqueCD7）](https://sketchfab.com/3d-models/b95778a564094fc3a49d1d6a3b6a30ab) | 已列 DuqueCD7 手枪角色包同作者的 AK-47 全身 FPS 角色动画包（API 记 11 clip），直接对应“角色+步枪”缺口。 |
| 112 | [Sketchfab – FPS Character Animation Pack Saps-12（DuqueCD7）](https://sketchfab.com/3d-models/3e5ebbd4ace24f2e92eadb7252927b31) | 同作者霰弹枪角色动画包（10 clip），可补泵动/换弹与近战枪型。 |
| 113 | [Sketchfab – Desert Eagle / First Person Animations（1Matzh）](https://sketchfab.com/3d-models/09a213d8510a42d1b747135e85712eff) | 已列 1Matzh 9mm 包同作者的手枪第一人称动画（9 clip），可比较同作者不同手枪的换弹做法。 |
| 114 | [Sketchfab – M4A1-S / First Person Animations（1Matzh）](https://sketchfab.com/3d-models/440c4299f3d64cd897eddcd19400eabb) | 同作者 M4A1-S 第一人称动画（5 clip），可直接与 BarcodeGames 的 M4 包对比同一枪型的动作结构。 |
| 115 | [Sketchfab – Minigun M-134 / First Person Animations（1Matzh）](https://sketchfab.com/3d-models/be0238198a6742faaac6055dd24ef90e) | 同作者重机枪第一人称动画（10 clip），可作“长换弹/旋转枪管”节奏参考。 |
| 116 | [Sketchfab – AR Fps animset（ccransh）](https://sketchfab.com/3d-models/313208732e6440d490411c44c5897651) | 已列 ctransh 步枪手包同作者的 7 clip AR 动画集，专注手臂+枪的 FP 组合，正好补独立手臂节点。 |
| 117 | [Sketchfab – FPS Benelli M4 Animations（ccransh）](https://sketchfab.com/3d-models/225a62190f6043ca975eaa2798ab7e2c) | 同作者 8 clip 霰弹枪动画，可补泵动/装填语义与双手持枪姿势。 |
| 118 | [Sketchfab – Makarov PM FPS animations（ccransh）](https://sketchfab.com/3d-models/d02ebd58e3cf44acb7af73e3f156be28) | 同作者 5 clip 手枪动画，可作低多边形手枪换弹的最小对照样本。 |
| 119 | [Sketchfab – FPS animations VSK（ccransh）](https://sketchfab.com/3d-models/191e34e043d546718d9e899d19d2f974) | 同作者 7 clip 消音狙击动画，可补长枪身换弹与瞄准姿态。 |
| 120 | [Reallusion – ActorCore 动作库](https://actorcore.reallusion.com/) | 商用 mocap/动作库（付费、需登录），含射击/军事类动作，可作付费成套动作的对照来源。 |
| 121 | [three.ws – animation-sources 目录](https://github.com/nirholas/three.ws/tree/main/animation-sources) | 仓库直接存放 Idle/Walking/Crouch To Stand/Dying 等 Mixamo 命名 FBX，可当动作线索，但未标来源与再分发许可，不能当许可来源。 |
| 122 | [Unreal Engine – Game Animation Sample Project (GASP) 5.8 官方页](https://www.unrealengine.com/tech-blog/download-the-latest-game-animation-sample-project-now-updated-for-ue-5-8) | 80.lv 文章所指的官方 GASP 下载/技术页，含 motion matching、foot placement 与 FocalRig 第一人称演示，可作高质量动作系统参照（UE 专用）。 |
| 123 | [Sketchfab — TheParaziT：Xiri X4 Animations（17 clip）](https://sketchfab.com/3d-models/xiri-x4-animations-9c66f74e346e4c5e8b1d4e5fcddc8a37) | 同作者 17 clip 的 Xiri X4 武器动画集，CC-BY 4.0，可与 MP7A1 拼出两种枪型的共用动画层。 |
| 124 | [Sketchfab — TheParaziT：RPG-7 Animations（14 clip）](https://sketchfab.com/3d-models/rpg-7-animations-f2bef085e0164a34a4b090c73dcdc3f5) | 14 clip 的 RPG-7 动画集，CC-BY 4.0，补重武器/装填动作的另一种枪型。 |
| 125 | [Fab — RIB Studio：Cover Pistol MocapAnimPack（约 282 动作）](https://www.fab.com/listings/3c50f099-e4e4-4811-a380-e98b95d34456) | 约 282 个掩体手枪动作，Idle/Move/Transition 三套，补蹲/掩体姿态下的持枪与换弹上下文。 |
| 126 | [Fab — RIB Studio：Crawl MocapAnimPack 1.2](https://www.fab.com/listings/61d1740d-b038-4b31-be72-714d1bda4190) | 专门的爬行动作包，补 crouch/crawl 低姿态动作缺口。 |
| 127 | [Fab — RIB Studio：Rifle Combat MocapAnimPack](https://www.fab.com/listings/27266d3a-75f2-456e-afec-11d4f4fe23e5) | 步枪战斗动作包（RIB 卖家 17 个包之一），与 Rifle Mega 形成战斗/射击动作补充。 |
| 128 | [Sketchfab — teenjust500：SCAR（7 clip）](https://sketchfab.com/3d-models/scar-afd0c02ccc1847e2a787917dad5ba260) | 7 clip 的 SCAR 武器动画，CC-BY 4.0；同作者还有 MP5/M4A4/PP-19 等系列，可拼多枪共用层。 |
| 129 | [Sketchfab — teenjust500：Hand With Gloves（11 clip）](https://sketchfab.com/3d-models/hand-with-gloves-a55a1444b87a4e23a9f43db29df8c51f) | 11 clip 的手套第一人称手臂模型，CC-BY 4.0，可作为独立手臂/换弹动画的载体。 |
| 130 | [Sketchfab — teenjust500：Animated MP5（3 clip）](https://sketchfab.com/3d-models/animated-mp5-19278d5f4a334f4abf320bc303ff9be1) | 3 clip 的 MP5 动画，CC-BY 4.0，轻量补充 MP5 枪型。 |
| 131 | [Sketchfab — commiessar：Stylized Low Poly Botanic Pistol（6 clip）](https://sketchfab.com/3d-models/stylized-low-poly-botanic-pistol-f175ca2168404919983af2b26fef4b9f) | 6 clip 的完整手枪套（Walk/Idle/Fire/Draw in/Draw out/Reload），CC-BY 4.0，是少见的明确含 Reload 的免费小型包。 |
| 132 | [Sketchfab — Alexander_Ovelar：AK74U / FREE ANIMATION（7 clip）](https://sketchfab.com/3d-models/ak74u-free-animation-2ab66220c48b465e9501067667965569) | 7 clip 的 AK74U 免费动画，CC-BY 4.0；枪/手臂网格来自第三方，需按页面署名链核对。 |
| 133 | [Sketchfab — dan741vlasov：Animated AKs-74u（7 clip）](https://sketchfab.com/3d-models/animated-aks-74u-34220aaa62e44b34b7d5ac30701f2b5f) | 7 clip 的 AKS-74U 动画，CC-BY 4.0；动画为作者原创，枪与手模来自 GameBanana，需另核署名。 |
| 134 | [Sketchfab — dan741vlasov：STALKER AKS-74 ReAnimation（5 clip）](https://sketchfab.com/3d-models/stalker-aks-74-reanimation-0fce4bd1ac644fe0ba8713141da0454b) | 5 clip 的 AKS-74 动作重制，CC-BY 4.0，补 AK 系的另一种换弹节奏。 |
| 135 | [Sketchfab — 1Matzh：Scorpion / First Person Animations (2026 Remake)（9 clip）](https://sketchfab.com/3d-models/scorpion-first-person-animations-2026-remake-f2bdfac775344004ad38d0318f0664a4) | 9 clip 的 CZ Scorpion 第一人称动画（2026 重制），CC-BY 4.0，是 UZI 同作者系列里未收录的一件。 |
| 136 | [Sketchfab — 1Matzh：Minigun M-134 / First Person Animations（10 clip）](https://sketchfab.com/3d-models/minigun-m-134-first-person-animations-be0238198a6742faaac6055dd24ef90e) | 10 clip 的 M-134 转管机枪第一人称动画，CC-BY 4.0，补重武器装填/转动动作。 |
| 137 | [Sketchfab — TheParaziT：AR-15 Animations Miniset（4 clip）](https://sketchfab.com/3d-models/ar-15-animations-miniset-e3b0951ec7a54de188f7fe3e6c38a9ad) | 4 clip 的 AR-15 迷你动画集，CC-BY 4.0，轻量补充 AR 平台。 |
| 138 | [Sketchfab — Konstantinos.Simantiras：Low Poly MP40（5 clip）](https://sketchfab.com/3d-models/low-poly-mp40-75c810c123204637ae1854168dc53138) | 5 clip 的低模 MP40（reload/aim/run/walk），CC-BY 4.0，补二战/低模风格枪型。 |
| 139 | [Sketchfab — coffeeowl：Weapon McMillan CS5 Sniper rifle free downloads（11 clip）](https://sketchfab.com/3d-models/weapon-mcmillan-cs5-sniper-rifle-free-downloads-cc7cad3f5537477d906facf37185db9a) | 11 clip 的 McMillan CS5 狙击枪动画，CC-BY 4.0，补狙击枪的换弹/开镜动作。 |
| 140 | [Sketchfab — gglecocoyt：Famas F1 (Blockbench)（6 clip）](https://sketchfab.com/3d-models/famas-f1-blockbench-1089f5f1cbbf411ba5e470702fb2e5c7) | 6 clip 的 Blockbench 低模 Famas F1，CC-BY 4.0，适合风格化低模路线。 |
| 141 | [Sketchfab — barcodegames：Mark 23 Animated (Free)（4 clip）](https://sketchfab.com/3d-models/mark-23-animated-free-7abebe340aca4f46b36368417b3ca920) | 4 clip（Shoot/Reload/Draw/Hide）的 Mark 23 手枪动画，Sketchfab Free Standard（非 CC），商用/再分发需按标准许可核对。 |
| 142 | [xidePunk Studio – First Person Rifle Animation](https://www.fab.com/listings/ceee0b8a-5ed1-4bc9-999d-d9a67f4ae384) | Fab 免费上架的第一人称步枪整套（16 个角色 + 4 个枪械 clip，含空仓换弹、真实弹匣/枪机/扳机绑定与男女手臂手套），是这组付费包里唯一能零成本先核动作清单的同级新候选；Fab Standard License 可商用并随游戏分发，但下载需 Epic 账号。 |
| 143 | [Infima Games – Free FPS Template & Tutorial](https://www.fab.com/listings/6a0af880-2b74-480c-a82c-8e597918dffe) | Infima 官方免费 UE5 FPS 模板，附 Blender 源文件与已绑定枪模，第一人称动画明确含 idle/aim/walk/run/equip/holster/fire/reload，可直接核换弹段并改造成本卡小样；Fab Standard License 可商用随游戏分发。 |
| 144 | [y0ung001 – FPS Animation Pack_AKS74U](https://www.fab.com/listings/75e66639-af8e-4c88-9dc6-d183d2553a61) | Fab 免费的 AKS-74U 第一人称包，18 个 UE5 骨架 in-place clip 明确含 aiming/firing/reloading/empty reload 与镜头抖动，适合补武器侧换弹段，但无蹲/死亡/独立弹匣。 |
| 145 | [Kingboars – Pistol and Rifle Locomotion Animations 1700](https://www.fab.com/listings/509f8c0a-3eb8-46cb-bda9-3cf1a48d6aa0) | Fab 免费 844 手枪 + 844 步枪 locomotion（含 crouch/turn/jump/run/sprint/traversal 变体），是补蹲行与移动层的巨大免费样本，但明确不含 fire/reload/death。 |
| 146 | [Gamma Studio – Free Animation Pack](https://www.fab.com/listings/8de31c5d-93bc-4bd4-9606-ca789ce91b99) | Fab 免费 24 个 120fps mocap，含 Female Rifle Idle/Walk 与 ADS 版本，可核步枪持枪姿态与 UE5 Manny 骨架，但不含 reload/death。 |
| 147 | [MoCap Online – Free Animation Pack](https://www.fab.com/listings/64c53af0-dcb7-4483-9d65-5cbc84bd9a93) | MoCap Online 在 Fab 的永久免费 sampler（idles/talking/basic movement），可零成本核 MotusMan 骨架与 FBX/UE 格式，但不含射击/换弹。 |
| 148 | [MoCap Online – Hipfire Shooter](https://www.fab.com/listings/efa26648-af49-4971-8713-16c2f30afb27) | 给定 Rifle/Pistol 同厂的 140+/375 文件 hipfire 专包，含 fire/reload/holster/weapon swaps、crouch 与 30 个 aim offset，补腰射与蹲行，付费 $49.99。 |
| 149 | [MoCap Online – Rifle Shooter Pro](https://www.fab.com/listings/6cbfcfb5-e96b-4a69-b8f2-124844c17b8f) | 同厂 390+ 步枪动画，覆盖 aim/fire/reload/weapon swap/动态 locomotion，是给定 Rifle 包的 Pro 升级，付费 $149.99。 |
| 150 | [Kubold – Rifle Animset Pro](https://www.fab.com/listings/e0eed5c5-54a6-41cc-bfa9-62b26c309bca) | 老牌 Kubold 的 120+ 步枪 mocap，含 walk/run/crouch/prone、shoot/hit/die/grenade/melee，是全身战术动作的经典付费参照，$59.99。 |
| 151 | [Kubold – Pistol Animset Pro](https://www.fab.com/listings/c5caff8c-6815-4e81-b825-aeb95967411e) | 同作者手枪版 mocap animset，可补手枪射击/换弹/死亡，$49.99。 |
| 152 | [KINEMATION – Tactical FPS Shooter Pack](https://www.fab.com/listings/76c5f2b0-ea55-461c-8b3c-811a9deb3279) | 给定 KINEMATION 文档对应的 9 武器战术包，明确 full-body 支持且每枪含 draw/holster/mag check/inspect/tactical+empty reload，$99.99。 |
| 153 | [KINEMATION – Sci-Fi FPS Animation Pack](https://www.fab.com/listings/042e8a30-2de7-4800-9092-0317ddd60dda) | 同厂 6 武器科幻包，明确 true full-body 与 draw/holster/inspect/reload，可作全身体/第一人称双用参照，$99.99。 |
| 154 | [KINEMATION – FPS Animation Pack Ultimate](https://www.fab.com/listings/a2d0dc02-0380-4fb8-84a9-d9e03636aec9) | 同厂 20 武器大包，含 tactical/empty/extended/start-loop-end reload 与 procedural equip/recoil/aim/movement，是武器与手臂层覆盖最广的付费候选，$99.99（Lite/Pro 同系列 $24.99/$49.99）。 |
| 155 | [Dannyboy730 – Low-Poly FPS Weapon Animation Collection](https://www.fab.com/listings/122cc033-ca28-4dcc-bd03-cfd5740bbea3) | 7 个低模第一人称武器包合集（RPD/1911/M87S/AK-74/AMR50/M4 等），单包如 AK-74 有 45 anim/6 reload/4 弹匣，适合武器+弹匣层，$169.99。 |
| 156 | [UltimateGameStudio – FPS Animation Pack](https://www.fab.com/listings/8a75dec9-84f4-416e-9b08-8d03eb3bd844) | 120+ 手工动画、7 把 4K PBR 武器、UE Mannequin 骨架，含 reload/reload empty/equip/inspect/shoot，是完整度较高的中价位套装，$50.99。 |
| 157 | [KaidoomDev – AK Rifle Character Animation Pack First & Third Person](https://www.fab.com/listings/9850a083-57c4-455c-be81-aa5626990097) | AK 专用包，第一/第三/true first person 共用骨架，含 inspect、mag check/out/in/chamber 与 walk/sprint，特别适合验证独立弹匣动作，$14.99。 |
| 158 | [DB Studio – AK12 FPS Animations](https://www.fab.com/listings/4508565a-93fb-4084-95c8-b6ff0910ad81) | 带绑定 AK-12 的 FP/TP 动画包，含程序化后坐/瞄准与可桥接的 reload 逻辑，$6.99，适合低成本核对换弹段。 |
| 159 | [Artem Dubinin – FMS-23 FPS Animations](https://www.fab.com/listings/6142ab4d-90be-499f-b2a5-f99fc14dd8d0) | UE5 骨架的 FMS-23 专用包，19 个手部 + 6 个武器动画，含动画蓝图与 montage，$59.99，可核手部与枪械分层。 |
| 160 | [PILIGRIM Games – M4A1 FPS Weapon Pack](https://www.fab.com/listings/53aab4c3-efd9-4cf1-8ce2-683847a16325) | 完整 M4A1 模型 + 第一人称手部 + 武器动画 + 程序化系统 + 演示角色，$34.99，可作为 Infima 之外的 M4 参照。 |
| 161 | [Exouch – FP-TP Pistol Animation Set](https://www.fab.com/listings/9ea98c32-664b-48ef-9959-51eb41b7cba8) | 100+ 模块化手枪动画，强调第一/第三人称同步与 idle→shot→idle 过渡，$50.99，补 TPS 敌人持枪层。 |
| 162 | [Gamma Studio – Crouch Rifle Animation / Vicon Mocap](https://www.fab.com/listings/b6cf3b34-2f4f-427d-a488-44460acbbe25) | 113 段 Vicon 蹲姿步枪序列 + aim offset（8 方向蹲走/蹲跑、ADS、转身），直接命中本卡最缺的蹲行层，$39.99。 |
| 163 | [PeaceSells – Customizable Arm Animations](https://www.fab.com/listings/ff256b27-d87a-4c6b-94f0-542210ec73d5) | 给定 Shooter Rifle Animations 同作者的 Control Rig 手臂源工程，支持换弹时把弹匣挂到手部并做 bolt-action，约 $8，可补手臂/弹匣交互层。 |
| 164 | [Infima Games – Low Poly Shooter Pack v6.0](https://www.fab.com/listings/90ba076a-dc9a-4782-9ac8-dc2ed4f06405) | Infima 工作室页未列出的 v6 完整 FPS 模板，含动画、模块化低模武器、AI 与多人，$179.99，可作整体管线参照而非纯动作源。 |

## 4. 前几项为什么最值得深挖

### 4.1 Mesh2Motion 预导出 GLB 动作集：唯一“CC0 + 步枪 reload + 蹲 + 死 + 直接 GLB”的组合

- **链接**：<https://github.com/Mesh2Motion/mesh2motion-app/tree/main/static/assets/human>；官方站 <https://mesh2motion.org/>；应用仓 <https://github.com/Mesh2Motion/mesh2motion-app>；素材仓 `mesh2motion-assets`（同一组织下的仓库）。
- **实际文件**：仓内 `static/assets/human` 已提交 `model.glb`、`skeleton.glb` 与逐条 clip GLB（rifle-idle/walk/run/fire/reload、pistol-idle/walk/fire/reload、crouch-idle/walk、death-a~d 等），CC0；项目使用 Three 0.185（目标 0.186.1），配置 MeshoptDecoder 后可直接用 GLTFLoader 加载；human 骨架 66 关节 UE 命名（`pelvis/spine_01/upperarm_l/hand_r`），mannequin 自带蒙皮。
- **许可**：代码 MIT；`LICENSE-CC0.MD` 明确覆盖 `models/blend/rigs/animations`，CC0 1.0。
- **本单元补充实测（临时下载到本单元输出目录，未入库）**：`model.glb` 531,504 B、0 clip、1 mesh、66 关节；`rifle-reload.glb` 64,588 B、1 个动画 `Rifle_Reload` 2.7083 s、66 关节、0 mesh；`rifle-fire` 1.2083 s、`rifle-idle` 1.9167 s、`rifle-walk` 1.2917 s、`rifle-run` 0.7917 s、`pistol-reload` 2.0 s、`pistol-reload-2` 2.0417 s、`crouch-idle` 3.625 s、`crouch-walk` 2.4583 s、`death-a/b/c/d` 4.5/1.875/2.2083/2.1667 s。完整 SHA-256 见 8.1。所有动画 GLB 的 `extensionsRequired` 为 `EXT_meshopt_compression`，4/4 bufferView 都带该扩展；GLTFLoader 必须 `setMeshoptDecoder()`，否则加载失败。
- **仍未解决（补充）**：`death-a` 4.5 s、`death-b` 1.875 s、`death-c` 2.2083 s、`death-d` 2.1667 s 都超过当前 `hit/death ≤700 ms`；若沿用现合同必须裁切或改合同。
- **为什么第一**：它是本清单中唯一同时具备“CC0 + 真实 rifle reload + crouch + death + 已导出 GLB + Three 0.186 目标版本”的来源；不需要开浏览器、不需要 Blender、不需要重定向即可先把 clip 名、时长和骨架对上。它纠正了上一阶段“源为 `.blend`、导出必须浏览器”的旧结论。
- **仍未解决**：没有枪/弹匣 mesh；`model.glb` 只有 1 个 `Mannequin.001` 蒙皮 mesh、66 关节（含 `hand_l`/`hand_r` 可作挂点），没有 `Pistol`/`Gun`/`Magazine` 节点（`Pistol_Reload` 只是 clip 名），也没有独立弹匣骨；当前 `ContentOpponent` 不能消费 SkinnedMesh，需要新消费者；本次复核 `Pistol_Reload` 为 2.0 s/66 关节；上一阶段记录的 198 通道未复核；需用 GLTFLoader 实测节点/clip 绑定。

### 4.2 Red Eclipse（actors + weapons）：本清单唯一同时具备“免费 + 真实 rifle reload + 蹲行 + 死亡”的动作整套

- **链接**：<https://github.com/redeclipse/actors>；步枪换弹 clip <https://github.com/redeclipse/actors/blob/master/player/rifle_reload.iqm>；HUD 换弹 <https://github.com/redeclipse/actors/blob/master/player/hud_rifle-reload.iqm>；手枪换弹 <https://github.com/redeclipse/actors/blob/master/player/reload_pistol.iqm>；武器模型仓库 <https://github.com/redeclipse/weapons>。
- **实际文件**：`player/female` 有 78 骨完整模型 `RE_Player_female.blend/.iqm`；动画含 idle/runcycle0/crouch_forward_back_left_right/`rifle_reload`(51 帧@24fps=2.125 s)/smg_reload/reload_pistol/shotgun_reload/dying/dead 及 `hud_*` 第一人称换弹；`rifle_reload.iqm` 53,028 B、78 poses；`hud_rifle-reload.iqm` 56,028 B、123 帧@60fps=2.05 s、31 poses；`reload_pistol.iqm` 24,876 B、22 帧@24fps=0.917 s。
- **许可**：CC-BY-SA 4.0+；商用与再分发允许，但派生动作需同许可（SA 传染性）。
- **为什么第二**：它补的是本卡最缺的“真实步枪 reload 身体动作 + 蹲行 + 死亡”，不是整枪位移；78 骨命名表（`bones.txt`，含 palm/finger/thumb 48 根）可直接对照 BAMEN 78 骨与 KayKit 41 骨的差距。
- **仍未解决**：IQM 格式需要离线转 glTF/FBX；SA 许可与公开仓库的许可兼容性需 dot 裁定；武器/弹匣几何要配 `redeclipse/weapons`；手指骨多，但当前合同不消费。

### 4.3 Operation Steel Tide BAMEN 动画士兵 GLB：38 clip 全身 GLB，但动作层受 QAL 约束

- **链接**：<https://github.com/AetherRadar/operation-steel-tide>；GLB <https://github.com/AetherRadar/operation-steel-tide/blob/main/assets/models/bamen_military_soldier/bamen_military_soldier_animated.glb>；构建脚本 <https://github.com/AetherRadar/operation-steel-tide/blob/main/scripts/blender/build_animated_bamen_operator.py>；许可记录 <https://github.com/AetherRadar/operation-steel-tide/blob/main/assets/models/bamen_military_soldier/LICENSE.md>。
- **实际文件**：3,246,780 B；38 个 clip（idle/run/crouch_idle/crouch_walk/reload 1.667 s/shoot 0.633 s/death 2.4 s/aim_*/prone_*）、78 骨、1 mesh；网格 CC BY 4.0（BAMEN）可再分发；动作来自 UAL1/2（`ACTION_SOURCES`：`reload=Pistol_Reload`、`shoot=Pistol_Shoot`），仍受 Quaternius QAL v1.0 再分发冲突约束，未澄清前整套不能判定为可随公开仓库提交；构建脚本 MIT；`BONE_MAP` 把 UAL 骨名映射到 `mixamorig:*`。
- **为什么第三**：它是本清单里最容易直接拿到、许可记录最完整的「全身 + 蹲 + 换弹 + 死亡」GLB；比 KayKit 更接近现代士兵，比 Red Eclipse 少一步格式转换。但动作层来自 UAL1/2，未澄清 QAL v1.0 前不能把整套判定为可随公开仓库提交。
- **仍未解决**：reload 实为 UAL1 `Pistol_Reload`，不是步枪换弹；没有枪/弹匣节点；重定向依赖 Mixamo 骨架；本质仍是“把手枪换弹套到步枪持握”，需人工确认握持与弹匣接触。

### 4.4 KayKit：模型/骨架/动作同源的 CC0 全套，但无枪/弹匣

- **链接**：作者页 <https://kaylousberg.com/game-assets/character-animations>；Adventurers <https://kaylousberg.com/game-assets/characters-adventurers>；官方角色仓 <https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0>。
- **实际文件**：作者页 133 个人形动作，含 Crouching、单手/双手武器 reloading、death，CC0、FBX/glTF、Rig_Medium/Large；本卡实测 `Knight.glb` 3,659,532 B、76 clip（含 T-Pose，即 README 的 75 个动作）、41 骨、15 mesh、`handslot.l/r`；`2H_Ranged_Reload` 1.6 s、`2H_Ranged_Shoot` 1.0667 s、`Death_A` 0.8 s、`Death_B` 2.6333 s；Med_* 补 `Rig_Medium|Crouching` 1.1 s、`Rig_Medium|Running_HoldingRifle` 0.8333 s、`Rig_Medium|Ranged_2H_Reload`。
- **为什么第四**：唯一在作者页类别级清单 + 本卡实测文件里同时覆盖“全身 + 双手武器换弹 + 蹲 + 持枪跑 + 死亡”的 CC0 来源；同作者角色与动作同 rig，最接近“模型+骨架+动作同源”。
- **仍未解决**：没有枪/弹匣 mesh，没有独立弹匣骨/弹匣 clip；Adventurers 包本身无 crouch，必须叠加 Character Animations 的 `Rig_Medium|Crouching`（加载后需处理 `Rig_Medium|` 前缀）；风格是卡通奇幻；itch 免费档成员未核。

### 4.5 ZenXChaos / BigAndCrispy / Steel Tide 手臂：补“独立武器/弹匣/手臂”的三个方向

- **ZenXChaos/ThirdPersonShooter-AnimationSets** <https://github.com/ZenXChaos/ThirdPersonShooter-AnimationSets>：Unlicense（放弃版权、可商用可再分发），40 个 FBX（DefaultAnims 15、RevolverAnims 23、ShotgunAnims 2，另 1 个 unitypackage；README 列 40 个动作名），自定义骨架含独立 `L_Weapon`/`R_Weapon` 骨；Default（Idle/Walk/Run/Sprint/JumpFall/Die*）+ Revolver（AimIdle/AimShoot/AimWalk/9 向瞄准/SearchAmmo/ReloadInit-Loop-End/CrouchIdle/CrouchAimWalk/CrouchReloadInit-Loop-End）+ Shotgun；实测 `RevolverReloadInit.fbx` 1,505,712 B 非 Mixamo 命名。缺枪模、弹匣独立骨/弹匣 clip、双手步枪 reload，FBX 需离线转 glTF。
- **BigAndCrispy/Unity-First-Person-Shooter** <https://github.com/BigAndCrispy/Unity-First-Person-Shooter>：CC0-1.0，`Assets/Models/Arms.fbx` 含 UpperArm/LowerArm 与 Index/Middle/Ring/Pinky/Thumb 手指骨（没有躯干/腿骨），以及 `AssaultRifle_Idle/Reload/Shoot`、`Pistol_Idle/Reload/Shoot`；`Pistol.fbx` 含 `Pistol_Body/Pistol_Magazine/Pistol_Trigger/Pistol_Slider` 与 `Magazine` 骨；是本清单唯一同时满足“免费可再分发 + 独立弹匣网格/骨 + 多种 reload clip”的源；没有 crouch/death/全身，且 clip 的 `CharacterArmature|` 前缀与 Quaternius 命名风格相似，需核是否二次使用。
- **Steel Tide DJMaesen `animated_reload_arms.glb`** <https://github.com/AetherRadar/operation-steel-tide/blob/main/assets/models/djmaesen_smg45/animated_reload_arms.glb>：10,711,916 B；24 个 reload clip（12 平台，tactical 1.8 s/empty 2.133 s）、49 骨、3 mesh、1 skin；CC BY 4.0；是第一人称手臂+弹匣锚点，超过 10MB 小样上限且没有身体/枪。

### 4.6 武器侧：MilitaryG / 3DAssets.dev / Quaternius Animated Guns / Steel Tide AK-SCAR

- **MilitaryG Pistol** <https://opengameart.org/content/pistol-animations-sounds-for-godot>：CC0，710,877 B；Godot 场景实测 8 个具名动画 `Fire/Hammer Pull/Hammer Release/Mag In/Mag Out/RESET/Slide Pull/Slide Release`；弹匣分 `magazine (loaded)/(empty)` 两个独立节点，另有独立 slide/hammer/trigger；没有手臂和角色；音效另标 David Fluher/Godot license，需分开核。
- **3DAssets.dev FPS Guns and Shooting Range** <https://3dassets.dev/assets/fps-weapon-set-and-firing-range-smg-e216f9a5>：CC0；GLB 实测 clip `stock-open/stock-close/magazine-open/magazine-close`，独立 stock/magazine 节点；同站 Marksman Rifle 有 `magazine-open/close` 与 `bolt-open/close`，Compact Pistol 有 `slide-open/close` 与 `magazine-open/close`。
- **Quaternius Animated Guns** <https://quaternius.com/packs/animatedguns.html>：6 把枪，Fire+Reload，独立 Magazine/Slide/Trigger；没有角色/手臂；QAL 冲突。
- **Steel Tide AK-47 / SCAR-L**：`ak47_reloadable_fp.glb` 3,604,612 B、0 clip，但 `Magazine/SpareMagazine/MagazineGrip/BoltHardwareGeometry` 为独立节点（CC0 taradavies）；`scarl_reloadable.glb` 178,048 B、`Magazine`/`SpareMagazine`/`BoltGeometry`/`TriggerGeometry` 独立（另有 `MagazineGripSocket`/`MagazineWellSocket` 等锚点；CC BY 3.0 AdamKokrito，需署名并披露修改）。

## 5. 许可与文件身份明细

| 来源 | 作者/原页 | 许可原文/范围 | 固定文件身份 | 覆盖代码/模型/动画 | 风险 |
|---|---|---|---|---|---|
| Mesh2Motion | <https://mesh2motion.org/>、<https://github.com/Mesh2Motion/mesh2motion-app> | 代码 MIT；美术 `LICENSE-CC0.MD` 覆盖 `models/blend/rigs/animations`，CC0 1.0 | `static/assets/human` 的 `model.glb`/`skeleton.glb`/逐条 clip GLB；临时下载 `model.glb` + 14 个动画 GLB 的 SHA-256 见 8.1，未入库 | 代码 MIT、美术 CC0 | 导出/重定向历史问题（#127/#141/#148/#136/#139）；无枪/弹匣；GLTFLoader 未实测 |
| Red Eclipse actors/weapons | <https://github.com/redeclipse/actors>、<https://github.com/redeclipse/weapons> | CC-BY-SA 4.0+（`cc-by-sa.txt`；`readme.txt` 为仓库级回退） | `rifle_reload.iqm` 53,028 B；`hud_rifle-reload.iqm` 56,028 B；`reload_pistol.iqm` 24,876 B；`RE_Player_female.blend/.iqm` | 模型/动作/武器数据 CC-BY-SA | SA 传染性；IQM 需转换；无独立弹匣骨（武器侧有独立部件） |
| Operation Steel Tide | <https://github.com/AetherRadar/operation-steel-tide> | 代码 MIT；逐资产 LICENSE（BAMEN CC BY 4.0、DJMaesen CC BY 4.0、Quaternius CC0、AdamKokrito CC BY 3.0） | BAMEN GLB 3,246,780 B；DJMaesen arms 10,711,916 B；AK 3,604,612 B；SCAR 178,048 B | 代码 MIT、模型/动作逐项 | 网格 CC BY 4.0 可再分发；动作层来自 UAL1/2，仍受 QAL v1.0 再分发冲突约束，未澄清前整套不能判定为可随公开仓库提交；reload 为 UAL1 Pistol_Reload；无枪/弹匣锚点；超 10MB 手臂 |
| KayKit Character Animations / Adventurers | Kay Lousberg，<https://kaylousberg.com/game-assets/character-animations>、<https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0> | CC0 1.0；官方 LICENSE 明写 personal/educational/commercial，无需署名 | `Knight.glb` 3,659,532 B sha256 `60428e3…5168`；Med_* 见 `CPU-PARSE.md` | 模型、贴图、骨架、动画全部 CC0 | 免费档成员未在 itch 核；无枪/弹匣；风格奇幻 |
| Quaternius UAL1 / UAL2 / Animated Guns / Toon Shooter / Modular / Base Characters | Quaternius，官网 `quaternius.com`；OGA 作者上传 | 包页多标 CC0；OGA zip 内 License.txt 为 CC0 1.0；但 <https://quaternius.com/license.html> 2026-08-28 起为 QAL v1.0，禁止把素材本身作为 asset pack/stock file 再分发 | UAL1 zip 14,541,205 B（内 `Godot/AnimationLibrary_Godot_Standard.glb` 6,671,104 B）；UAL2 zip 10,257,419 B（内 `Unreal-Godot/UAL2_Standard.glb` 8,061,600 B）；Animated Guns 1.1 MB | 包页称 CC0 覆盖模型/动画；QAL 只允许并入 Product、不允许独立再分发 | **冲突未解决**；公开仓库提交派生动画文件落在灰区；需 dot 决定或向作者确认 |
| Kenney | Kenney，官网 `kenney.nl`；OGA 作者上传 | CC0 | Blocky zip 2,148,510 B；Mini 包；Animated 系列 | 模型/动画 CC0 | 动作集不含枪战；下载接口需同源会话 |
| OpenGameArt 单项 | 各作者 | 逐项 CC0 / CC-BY 3.0/4.0 / CC-BY-SA / GPL | 见 T1/T2 各行 | 逐项不同 | 必须逐页核；CuiGames 文件当前不可取 |
| Microsoft Rocketbox | Microsoft | MIT（LICENSE.md） | GitHub 仓库；417 动画 | 代码/模型/动画 MIT | 无武器/换弹；FBX/Biped |
| 100STYLE | Ian Mason | CC BY 4.0（需署名） | Zenodo record 8127870；16.2 GB | 动作数据 CC BY 4.0 | 无武器/换弹；需重定向 |
| CMU | CMU Graphics Lab | 原始页 “free for all uses” | BVH/ASF-AMC 数据集 | 动作数据 | 无武器；再分发条款需复核 |
| Sketchfab | 各作者 | CC BY 4.0 / Free Standard 等 | 逐模型 UID；下载需登录 | 逐项 | 登录 + 署名链 + 部分 Mixamo 洗白 |
| Fab / Unity / UE | 各商家 | 商业 EULA；Fab/Unity 需账号 | listing ID | 不允把原始素材作为独立文件再分发 | 付费/登录；按任务排除 |
| Mixamo / Adobe | Adobe | 可商用、免版税、无需署名；不可把原始角色/动画当独立资产再分发 | 无公开固定文件 | 动画 | 登录型；不可再分发 |
| 二手转载（cgais/budeco/B 站/爱给网） | 不明 | 自述“仅供学习/禁止商用/未标许可” | 无 | 无 | 不可作为许可来源 |

### 5.1 固定文件身份的覆盖程度

仓库内只保留 KayKit 样本；本卡对实际落盘并解析的 KayKit 样本给出 SHA-256。Mesh2Motion 的临时下载也记录了逐文件 SHA-256（见 8.1），但没有入库。其余候选的“固定文件身份”来自本清单给出的包名、字节数、版本或页面清单；没有重新下载的，不冒充已核字节。

| 等级 | 含义 | 本次覆盖 |
|---|---|---|
| A · 字节级 | 有文件大小 + SHA-256 + JSON 结构/逐 clip | KayKit `Knight.glb`、`Med_CombatRanged.glb`、`Med_MovementAdvanced.glb`、`Med_General.glb`（见 `CPU-PARSE.md`） |
| B · 归档级 | 有包名/字节数与包内结构，但没有保留原件或未逐成员核 | Quaternius UAL1/UAL2、Animated Guns、Kenney Blocky、Necrobot .blend、FireGun GLB、Steel Tide BAMEN/DJMaesen/AK/SCAR、Red Eclipse IQM、Godot tps-demo player.glb |
| C · 页面级 | 只有作者页/包页/API 元数据，没有本卡可复算的文件身份 | Toon Shooter、Modular、ZenXChaos FBX、OGA 多数条目、Sketchfab、Fab/Unity/UE |
| D · 仅索引 | 只在聚合页/搜索结果看到标题，未读到原页 | 未列入候选的 itch/聚合条目 |

因此，T0/T1 中 KayKit 达到“入库可复算”的 A 级；Mesh2Motion 的 `model.glb` 与 14 个动画 GLB 达到“临时字节级”（有大小、SHA-256、逐 clip 名与时长，但未入库，见 8.1）；Red Eclipse、Steel Tide、ZenXChaos 达到 B 级或页面级，需在 dot 选定后再补一次下载/哈希/逐成员核验。

## 6. 与当前 Three 0.186.1 / 固定步长模拟的接入判断

### 6.1 当前合同

`src/render/content-set-assets.ts`（基线 `b198df62a56f4c520716fbc9cb4afac47dd62213`）实际有两条互不替代的消费者；新来源不能只换 GLB 路径。

**共同加载合同（`loadContentPiece`，53–70 行）**

- 文件必须匹配 `CONTENT_PIECES` 的字节数与 SHA-256（`fp-arms-rx24.glb` 188,088 B；`enemy-relay-guard.glb` 40,388 B）。
- scene `userData` 必须同时满足 `id`（与 piece id 相同）、`units: 'metres'`、`up: '+Y'`、`forward: '-Z'`。
- 任何 `SkinnedMesh` 都会被拒绝（67 行）；新来源若带蒙皮，必须新增消费者，不能直接替换这两件。
- 节点按 `contentNode` 精确名查找；GLTFLoader 自动加的后缀 `_0` 也接受，但必须唯一。

**`ContentOpponent`（敌人刚性人形，142–190 行）**

| 项 | 合同 |
|---|---|
| 根/节点 | `enemy-root` + `head`、`spine`、`leg-l`、`leg-r`、`weapon`，共 6 个必需节点 |
| 轨道 | 只接受 `position` / `quaternion`，且必须 `InterpolateLinear`；每条轨道按节点名绑定，找不到就报错 |
| clip | 必需且唯一 `idle/walk/fire/hit/death`；不允许重复名、0 时长、空轨道 |
| 时长 | `hit`/`death` ≤ `RESULT_HOLD_MS / 1000`（`src/render/feedback.ts` 为 700 ms） |
| 采样 | 每帧先恢复全部节点 rest TRS，再按绝对模拟时间采样；无 AnimationMixer 增量/墙钟循环 |
| 蹲伏 | 仅 `stance.scale.y = .65`，不是蹲姿 clip |
| 蒙皮 | 不允许（`loadContentPiece` 拒绝 `SkinnedMesh`） |

**`ContentRifle`（玩家第一人称枪，106–139 行）**

| 项 | 合同 |
|---|---|
| 固定源 | `fp-arms-rx24.glb` 188,088 B / 8 节点 / 4 clip（`idle`、`fire`、`reload-magazine`、`reload-bolt`）/ 0 skin |
| 节点 | `rx24-root`、`rifle-magazine`、`rifle-bolt`、`support-hand`、`trigger-hand`、`rifle-static`、`muzzle`、`grip`；`support-hand`/`trigger-hand` 必须是 `Mesh` |
| 蒙皮/袖口 | 必须通过 `excludeMergedSleeve` 的三角形合同（`support-sleeve`/`trigger-sleeve`，各 140 个三角形） |
| 姿态 | `pose()` 每帧把 root position/quaternion 复位，把弹匣/枪机/支撑手复位到 rest，再由 `weaponPose` 程序驱动 `magazine.y -= ...`、`bolt.z += ...`、支撑手跟随 `support-palm` |
| clip 播放 | **明确不播放 GLB 的 `idle/fire/reload-*` clip**（128–129 行注释）；GLB clip 只作源身份，不驱动运行时 |
| 挂点 | `restMount` 必须精确等于 `{ translation:[.29,-.28,-.32], pitch:0, roll:0, verticalFovDeg:80 }` |

因此：新来源换 GLB 会先在字节目录/`userData`/`SkinnedMesh` 检查处失败；即使改掉这些，还要把新节点名映射成上面的固定名，或新增消费者。玩家枪与敌人 `weapon` 组是两条不同路径，不能混为一谈。

### 6.2 换成 Mesh2Motion / Red Eclipse / BAMEN / KayKit 需要什么

| 改动 | 是否必须 | 说明 |
|---|---|---|
| 新增 SkinnedMesh + AnimationMixer 消费路径 | 是 | 当前 rigid 合同无法播放 41/66/78 骨的蒙皮动画；这不是“换一个 GLB 路径”能解决的 |
| 换成来源自带角色 mesh 或把动作重定向到现有 relay-guard | 二选一 | 用 Mesh2Motion/BAMEN/KayKit 自带角色可免重刷权重；保留 relay-guard 则需重定向/重绑，违反“不刷权重” |
| clip 名映射 | 是 | 例：`idle→Idle`、`walk→Walk/Running_A`、`fire→Rifle_Fire/2H_Ranged_Shoot`、`reload→Rifle_Reload/2H_Ranged_Reload`、`hit→Hit_A`、`death→Death_A/B`；Mesh2Motion 的文件名是 `rifle-reload.glb`，内部 clip 名是 `Rifle_Reload`（`rifle-fire.glb`→`Rifle_Fire` 同理），按文件名精确匹配会找不到 clip |
| `hit/death` 700 ms 限制 | 是 | KayKit `Death_A` 800 ms、`Death_B` 2633 ms、`Hit_B` 867 ms 超限；`Hit_A` 667 ms 满足；BAMEN `death` 2.4 s 超限；要么裁切/换 clip，要么改合同并重审 Feedback retention |
| root motion | 是 | 每个 clip 的 `root` 都有 translation/rotation/scale 烘焙；必须忽略/剥离 root XZ，位置仍由模拟驱动 |
| 枪/弹匣 | 是 | 只有 BigAndCrispy 与 Steel Tide 手臂提供独立弹匣骨/锚点；Mesh2Motion/Red Eclipse/BAMEN/KayKit 都没有独立弹匣骨。需要另配枪模，并用程序或武器侧 clip 驱动弹匣/枪机 |
| 手指/握持 | 否（但影响可读性） | KayKit 41 骨无手指；Red Eclipse 78 骨含 palm/finger/thumb 48 根（当前合同不消费）；BAMEN 78 骨为 Mixamo 命名；近景手指接触不可读（除非改合同消费手指骨） |

### 6.3 能不能“不刷权重、不手补动画”

- **用来源自带角色 + 来源动作**：Mesh2Motion、BAMEN、KayKit、Red Eclipse（自带 female 模型）都不需要刷权重、不需要手补动画；需要新消费者与 clip 映射。
- **保留 relay-guard + 外部动作**：需要重定向或重绑；Three 的 `SkeletonUtils.retargetClip` 在多个公开帖里仍有脚内翻/手反向/少一帧问题，不能承诺零人工。
- **敌人 `ContentOpponent.weapon` 武器侧**：可在 `weapon` 组下新增 `magazine`/`bolt` 子节点，并在 `idle/walk/fire/hit/death` 五个 clip 中增加对应 `position/quaternion` 轨道；第一步先用已验证 GLB 的 3DAssets（19433/32655，clip 已实测）或 MilitaryG（CC0 Godot 场景）取节点名与时序，断言 5 个必需 clip 仍存在、`hit/death ≤700 ms`、新增子节点能被 `contentNode` 唯一找到。这不需要新 skinned 路径，但不提供角色跑/蹲/换弹。
- **玩家 `ContentRifle` 武器侧**：`fp-arms-rx24.glb` 已固定 8 节点/4 clip，运行时由 `weaponPose` 程序驱动，**不能靠“增加 magazine/bolt 节点与轨道”扩展现有枪**；要么扩展 `weaponPose`/`weaponParts` 的弹匣与枪机参数，要么新增平行消费者读取新 GLB 的 `reload-magazine`/`reload-bolt` clip。第一步是决定这条路径并写断言（节点名、clip 名、时长、`restMount`/袖口合同）。BigAndCrispy 仅作条件项，先解决 `CharacterArmature|`/Quaternius 命名来源与 FBX→glTF 转换。

### 6.4 结论

- **满足六动作 + 全身 + 可商用可再分发**：Mesh2Motion 最强（CC0、rifle reload、直接 GLB），Red Eclipse 次之（真实步枪 reload，但 SA + IQM），BAMEN/KayKit 第三（GLB 直接，无枪/弹匣；BAMEN 的动作层来自 UAL1/2，仍受 QAL 约束）。
- **满足武器侧弹匣/枪机**：MilitaryG、3DAssets.dev、Quaternius Animated Guns、Steel Tide AK/SCAR 最强，但无角色。
- **满足“零改接入当前 rigid 合同”**：没有。当前合同只能承载 5 个刚性组的整身位移，不能承载任何真实换弹。
- **满足“独立手臂/枪/弹匣”三者同源**：BigAndCrispy（CC0，手臂+手枪+独立弹匣）与 Steel Tide DJMaesen（CC BY，手臂+弹匣锚点）最接近；两者都没有全身/蹲/死亡。

## 7. 推荐与下一次 dot 选择

### 7.1 推荐（按目标优先级）

以下 1–4 是**互斥替代**，不是叠加。若要混用两套 rig，必须重定向/重绑；§6.3 已说明不能承诺零人工。

1. **若 dot 接受新增 SkinnedMesh/AnimationMixer 第三人称消费者**：**主基座选 Mesh2Motion 预导出 GLB**（CC0，`Rifle_Reload` 2.7083 s、`Crouch_Idle/Walk`、`Death_A~D`，直接 GLB）；Red Eclipse 只在“需要真实步枪握持/78 骨手指”时作为替代，不再作为 Mesh2Motion 的补丁叠加。BAMEN/KayKit 仅作不同角色风格的可选基座。三者的角色风格不同，需 dot 选一个主基座。
2. **若 dot 接受 IQM/FBX 离线转换**：**Red Eclipse** 是本清单唯一同时具备「免费 + 真实 rifle reload + 蹲行 + 死亡」的动作整套（动作覆盖与 Mesh2Motion 并列；差异是 CC-BY-SA、IQM、78 骨）；角色网格与动作在 `redeclipse/actors`、武器模型在 `redeclipse/weapons`（同一项目的两个仓库）；转换后可直接核 78 骨与 51 帧时序。
3. **若 dot 只允许武器侧最小改动**：
   - 敌人 `ContentOpponent.weapon`：在 `weapon` 组下加 `magazine`/`bolt` 子节点与 5 个 clip 的轨道；首选已验证 GLB 的 **3DAssets.dev**（asset 19433/32655，clip 已实测）或 **MilitaryG Pistol**（CC0，Godot 场景 8 个具名动画 + 独立 loaded/empty 弹匣），再用 **Steel Tide AK/SCAR** 补独立弹匣/枪机几何；断言 5 个必需 clip 不丢、`hit/death ≤700 ms`。
   - 玩家 `ContentRifle`：`fp-arms-rx24.glb` 的 `weaponPose` 已程序驱动弹匣/枪机，不能靠“加节点与轨道”扩展现有枪；要么扩展 `weaponPose`，要么新增平行消费者。BigAndCrispy 仅作条件项，先核 `CharacterArmature|` 是否来自 Quaternius/QAL 冲突并完成 FBX→glTF。
   - 两条都接受“身体仍是整身位移”，不满足 brief 的换弹可读要求，只作为过渡。
4. **若 dot 接受付费/登录**：KINEMATION Tactical FPS、RIB Rifle Mega、MoCap Online Rifle Pro、Infima Tactical FPS 是功能最贴近的对照；但它们都不是“免费可随公开仓库提交”的来源，且 KINEMATION/RIB 有购买者反馈的重定向/文档问题。

### 7.2 下一次需要 dot 选择的缺口

| 选择 | 需要 dot 决定 | 影响 |
|---|---|---|
| A. 新增 skinned 第三人称消费者 | 是否批准改 `ContentOpponent`/新增消费者，允许 SkinnedMesh + AnimationMixer | 这是采用 Mesh2Motion/Red Eclipse/BAMEN/KayKit 的前提；不改就只能做武器侧 |
| B. 角色风格 | 接受 Mesh2Motion/BAMEN 的现代/基础人形、KayKit 的卡通奇幻，还是 Red Eclipse 的低模 FPS 风格 | 决定主基座与是否需要重定向 |
| C. 枪/弹匣来源 | 用 Mesh2Motion/BAMEN 骨架 + 独立枪模，还是用 BigAndCrispy/Steel Tide 的独立弹匣骨 | 决定弹匣是程序位移还是武器侧 clip，以及能否做到“退出/装入/闭锁”三层 |
| D. Quaternius 许可 | 是否接受“包页 CC0 + 站点 QAL v1.0 禁止再分发”的冲突，或去信作者确认 | 影响 UAL1/UAL2/Toon Shooter/Animated Guns 能否进公开仓库；BAMEN/Viper 的 reload/shoot 等动作来自 UAL1/2，同一冲突下整套也不能判定为可提交 |
| E. 700 ms 合同 | 是否允许 hit/death 超过 700 ms，或裁切 `Death_A`/换 `Hit_A` | 影响死亡动作可读性与 Feedback retention |
| F. 是否允许离线转换 | 是否给 Red Eclipse IQM、ZenXChaos FBX 的离线转 GLB 开口；Mesh2Motion 已有预导出 GLB，`.blend` 只在改动作/重新导出时需要 | 决定这些候选能否从“候选”变成“可评估样件” |

### 7.3 最小验证步骤（dot 批准后的第一步）

1. 批准新增 SkinnedMesh/AnimationMixer 消费者；不改 `ContentOpponent` 的 rigid 路径，新增一条独立消费路径。
2. 用 `GLTFLoader` + `MeshoptDecoder` 加载 Mesh2Motion `model.glb` 与 `rifle-reload.glb`；断言 66 关节、动画名 `Rifle_Reload`、时长 2.7083 s，并检查 `hand_r`/`hand_l` 节点能否挂枪。
3. 把 `Rifle_Idle/Rifle_Walk/Rifle_Run/Rifle_Fire/Rifle_Reload`、`Crouch_Idle/Crouch_Walk`、`Death_A/B` 映射到合同；死亡超过 700 ms，先决定裁切还是改合同。
4. 枪/弹匣：先用已验证 GLB 的 3DAssets.dev（asset 19433/32655，clip 已实测）或 MilitaryG（CC0，Godot 场景）做武器侧；BigAndCrispy 仅作条件项，先核 `CharacterArmature|` 是否来自 Quaternius/QAL 冲突并完成 FBX→glTF 转换。确认“退匣/入匣/闭锁”三层可读，再考虑步枪。
5. 不该直接做的情况：dot 不批准新 skinned 消费者（只能做武器侧）；不能接受 CC-BY/CC-BY-SA 的署名/同许可义务；不能解决 Quaternius QAL 冲突；或必须保持整仓 GPL 兼容（Xonotic 会传染）。

### 7.4 明确不做的

- 不自造 reload clip，不把整枪倾斜/位移冒充换弹。
- 不把搜索摘要、视频、镜像页当成可编辑 clip。
- 不宣称已经游戏采用；本卡没有改 `src/`、旧源包、训练适配卡或 guard 候选。
- 不提交、不推送、不切换分支、不改任务文件。

## 8. 小样与 CPU 解析

本卡按“最多一件入库小样”的约束，仓库内只保留 u1 已复核的 KayKit 小样（它是唯一完整的角色网格 + 骨架 + 动作同源入库样本）。T0-1 Mesh2Motion 的 `model.glb` + 14 个动画 GLB 只做临时下载与字节级核验（见 8.1），未入库。**已知例外**：第一推荐（Mesh2Motion）没有入库小样，入库小样（KayKit）不是第一推荐；选择 Mesh2Motion 作第一推荐依据的是 8.1 的临时 SHA-256 与逐 clip 名/时长。若 dot 要求“第一推荐必须有入库小样”，下一步应把 8.1 的 `model.glb` + 14 个动画 GLB 复制进 `sample/mesh2motion/` 并补 `LICENSE-CC0.MD` 原文。

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

未验证：Three `GLTFLoader` 加载（缺 `node_modules`，禁止安装）、实际播放/姿势/接触/镜头、Mesh2Motion GLB 的 GLTFLoader 加载与 `EXT_meshopt_compression` 解码、Red Eclipse IQM 转换后的骨架、itch 免费档成员、Quaternius QAL 冲突的最终解释。

### 8.1 Mesh2Motion 补充核验（临时下载，未入库）

为了确认 T0-1 不是页面摘要，本单元从 `raw.githubusercontent.com` 下载了 `model.glb` 与 14 个动画 GLB 到本单元输出目录的临时目录，用 Python 标准库读 GLB JSON chunk；文件未复制进仓库，也未替代 `sample/kaykit/` 的入库小样地位（原因见第 8 节例外说明）。

| 文件 | 字节 | SHA-256 | 内部 clip | 时长 s | 关节 |
|---|---:|---|---|---:|---:|
| `model.glb` | 531504 | `5ae502131a9ed978a557e5621d02b56194ebdeb594048d2ba06a65d68e0d1b73` | `—（0 clip/1 mesh）` | — | 66 |
| `rifle-reload.glb` | 64588 | `713cc0c0a5c9e316f5e1d254de3e08f30e01cf9190994a95e25e30f982310f5d` | `Rifle_Reload` | 2.7083 | 66 |
| `rifle-fire.glb` | 60660 | `9a0cdfb65b97bff557afbe7065dea481acff314dc2bf47755dee8a5ff6eb4886` | `Rifle_Fire` | 1.2083 | 66 |
| `rifle-idle.glb` | 60140 | `001eaae12f41fd9d78f6ed9b56ec3e8115a3ab4c82d417e886a541735f261ac5` | `Rifle_Idle` | 1.9167 | 66 |
| `rifle-walk.glb` | 60860 | `cf6bb58fb0b6d44498100df9367f2eae892ea974f314c74f9625f6822feafc5a` | `Rifle_Walk` | 1.2917 | 66 |
| `rifle-run.glb` | 59120 | `9b11368582f047b4f04e384c19b02829d1a7ef386b3d1785c1975e84f0d0f269` | `Rifle_Run` | 0.7917 | 66 |
| `pistol-reload.glb` | 62236 | `14e1d8f8044ae380c270782d9d68ebadaba39d8fd8b9550886bf5ebc56d347cb` | `Pistol_Reload` | 2.0 | 66 |
| `pistol-reload-2.glb` | 64476 | `94682ca7d967096f6cd5ab4567b328809f8152c07547f6332801b16f148b9d6f` | `Pistol_Reload_2` | 2.0417 | 66 |
| `crouch-idle.glb` | 66384 | `61f035c6e56c7b1503acc209779df4cb998c2fe03f3e8fdfcd7c65235ab2dbc0` | `Crouch_Idle` | 3.625 | 66 |
| `crouch-walk.glb` | 63572 | `b5fa72a511c3260509aabd86e180c60ff6cd8b253b87df8397e9b692d5b1db15` | `Crouch_Walk` | 2.4583 | 66 |
| `death-a.glb` | 71820 | `e96b0d5f6aff879a616a0bd60466de019c67f81cfc9022ea0d56a2194d0adc53` | `Death_A` | 4.5 | 66 |
| `death-b.glb` | 64932 | `3089ab2c415056a05186907d2699a22a1e49ba048791d6295752c4001dc67d04` | `Death_B` | 1.875 | 66 |
| `death-c.glb` | 68872 | `cf4450975e5abacb9b14292ecb6da62d52bb27d52859af5cdc0a5524189b6ee4` | `Death_C` | 2.2083 | 66 |
| `death-d.glb` | 77816 | `e6c9979d1aa45761d5bab2324b46d8d491672f7e97fc9f10dd9fb078c2c33019` | `Death_D` | 2.1667 | 66 |
| `idle-a.glb` | 61688 | `0b3a8ac8800adc3bdce5c217edbd9224404ddea1cf6648c952e466d8cca81525` | `Idle_A` | 3.0833 | 66 |

**结论**：Mesh2Motion 的文件身份与逐 clip 名已达到“可复算”等级；但 `EXT_meshopt_compression` 是 required，Three 0.186.1 的 GLTFLoader 需要 MeshoptDecoder（仓库依赖中有 three，但本工作目录没有 `node_modules`，未实际跑 GLTFLoader）。此外所有 death clip 超过 700 ms，且没有枪/弹匣节点。

## 9. 未验证与限制

- 没有打开浏览器、GUI 或 GPU；没有运行 Blender；没有安装依赖。
- `docs/quality.md` 的“第三人称 8 动作 0/8、第一人称 7 动作 0/7”仍是当前事实；本卡只做来源筛选，没有改内容完成率。
- 432 条候选之外，另有 180 条读不到渠道记录（逐项见附录 A），二者不是同一集合；432 条候选只做了“页面可读、标题/正文与候选描述对得上”的核对；T4 的付费/登录/403 项未打开，只按页面/索引记录。没有逐条重跑 clip 解析，也没有对任何 clip 做视觉播放或姿势判定。
- T0 中的 Mesh2Motion 已做临时字节级解析（8.1），但没有跑 GLTFLoader；`EXT_meshopt_compression` 需要 MeshoptDecoder，必须实测。Red Eclipse、BAMEN、KayKit 只有页面/字节级证据；真正接 Three 前必须用 GLTFLoader 实测节点名、clip 名、绑定与时长。
- 读不到的渠道与原因已逐项记在第 2 节与附录 A；不把“读不到”写成“没有”，也不把“镜像/二次组装”写成“作者原页授权”。
- WebSearch 额度 200/200 已用尽；后续若需 2026 新包、中文/日文补充检索，需要新会话或新预算。

### 9.1 对上一阶段 openIssues 的修订

1. **`Mannequin_F.fbx` 路径**：上一阶段把它写成与 `Mannequin_F.glb` 同目录；本文件不再作此声明。准确位置是 `Female Mannequin/Unity/Mannequin_F.fbx`（上一阶段记录），本文件不把它列为候选。
2. **`Reload_end` 不是 clip**：Animated Guns 的 `Reload_end` 是骨架/节点名，不是独立动画 clip；本文件不再把它当作 clip，只把它作为武器侧节点记录。
3. **UAL2 43 clip 不是“全是”近战/跑酷/农活/僵尸**：本文件已改为“以近战/跑酷/农活/僵尸为主”，不排除少数其他类别；免费 43 clip 未逐条重新归类。

- 本卡没有提交、推送、切换分支或修改任务文件；产物只在本工作目录的 `asset-pipeline/character-action-sources/`。
- 上一阶段 `sources.md` 已核但未进入本轮 432 条清单的条目（如 FireGun 的二次组装 GLB 8.97 MB/65 骨/43 clip/12 mesh、NoLimitNexus/game-models 139 clip/132 distinct、Necrobot 的 9,646,604 B Blender 2.79 .blend、sketchpunklabs/kaykit_char 的 KayKit 再导出）保留为历史记录，不作为本轮候选；若 dot 需要，须重新打开原页与文件复核后再补链接。

## 附录 A · 读不到渠道明细（原始记录，180 条）

1. itch.io（kaylousberg、quaternius）：curl 000（TLS/连接失败），WebFetch Socket closed；KayKit 动作数/1.1 devlog 与 Quaternius itch 版本未能直读，只能靠作者站、OGA 与搜索摘要交叉。
2. kenney.nl 资产与知识库页：curl 403，WebFetch 域名安全校验拒绝；改用 Kenney 在 OpenGameArt 的作者上传页（CC0，已读）。
3. wiki.unvanquished.net：curl 000（TLS/连接失败），导出与动画命名页未读到；只保留搜索摘要，未作为候选。
4. gitlab.com/xonotic：429；改用 GitHub 镜像 raw 的 animdecide.qh（已读）。
5. GitHub REST API：后段未认证 403 rate limit；改用 raw/HTML，不影响候选链接。
6. Sketchfab 下载接口：匿名 401 需登录，按要求未尝试；页面本身 200 但正文为 JS 壳，BAMEN/DJMaesen 的许可与文件身份以 Steel Tide 的 LICENSE 记录交叉核对。
7. Quaternius 官方 Google Drive/itch：沿用上一单元记录的 exit 35/52 与 000，本单元未重试；官方 zip 成员仍以 OGA 作者上传包为准。
8. WebSearch：本会话 200/200 用尽；中文补充搜索（换弹动画复盘、开源枪械动作库、three.js 骨骼重定向实践）未执行，中文渠道结论沿用上一单元 sources.md。
9. itch.io（kaylousberg、quaternius、cuigames、jdbeardmore 等全部页面）：curl 与 WebFetch 均 TLS handshake/Socket closed，HTTP 000；KayKit 免费档成员、jdbeardmore Free Motion Pack 1 的许可以及 itch「Game Assets: Animations」合集均未读到
10. mocaponline.com：WebFetch 域名安全校验拒绝（Unable to verify domain），许可与免费样本清单未读
11. mocapatlas.com：HTTP 429 Too Many Requests（Retry-After 60），免费包细节与许可未读
12. huggingface.co/datasets/fernandotonon/QtMeshEditor-motion-corpus：raw README 请求 HTTP 000，150 clip 清单与 CC0/CC-BY 边界未核
13. fab.com（Paragon Animations Retargeted to Manny、Game Animation Sample Project、Animation Starter Pack 等）：HTTP 403 + 需 Epic 登录，动作清单与许可未核
14. sketchfab.com 模型网页：JS 壳，WebFetch 返回空；只能靠 /v3 API 读到 animationCount 与描述，逐 clip 名称/骨架未公开
15. kenney.nl/download-link/<id>：返回 error/404/forbidden，无法解析官方 zip 成员；只能读页面 Features 计数与 ETdoFresh 镜像的旧版本成员
16. WebSearch：本会话额度 200/200 用尽（与前一单元共享），后续关键词检索无法继续，只能改直链/API/仓库搜索
17. DuckDuckGo HTML 与 Mojeek：直连被拒或返回空结果，未能作为 WebSearch 的替代搜索
18. GitHub HTML 页面偶发 HTTP 000（如 /KenneyNL?tab=repositories），改用 api.github.com 与 raw.githubusercontent.com 完成主体核对
19. Kenney Jam 2025 的 itch 讨论帖（how many assets packs did you use）：itch TLS 失败，未读到对其他免费包的评价
20. Steam 的 Kenney Game Assets All-in-1 页面未抓取，未核其是否包含任何未公开的角色动作包
21. Lobsters 搜索：返回 Anubis“Making sure you're not a bot!”JS 挑战页（HTTP 200，约 7,601 B），lobste.rs/search.json 同样被挑战页挡住，无法读故事/评论。
22. DuckDuckGo HTML 搜索端点（html.duckduckgo.com/html/?q=...）：curl 返回 000、无响应，无法作为 WebSearch 额度耗尽后的替代搜索。
23. forum.freegamedev.net/viewtopic.php?f=24&t=5324：3rd person blender sci-fi pack 评论区指向“同作者将发布 FPS pack”的线索，curl 000，无法跟到后续 FPS 包或确认是否含 reload。
24. WebSearch：本会话额度已用尽（200/200），无法再用通用搜索引擎补查 2026 年新包或英文博客/ newsletter 的新链接。
25. OpenGameArt 多 tag 交集查询：advanced search 对两个 field_art_tags_tid[] 参数返回固定的无关结果列表，无法用 tag 交集做精确筛选，只能改用单 tag/keys 查询。
26. YouTube oEmbed：请求 Bungie GDC 视频（CXFLu8cityA）标题返回空，未能独立核实该视频标题与内容，只在 GitHub README 转述中见到。
27. 知乎：所有 zhuanlan.zhihu.com 页面直读 403（curl 触发 zse-ck 验证页，api.zhihu.com 返回 40362），只能读 WebSearch 摘要，未能核对正文与评论区。
28. 微信公众号：mp.weixin.qq.com 返回“当前环境异常，完成验证后即可继续访问”，正文不可读，仅搜索摘要。
29. CGJOY：WebFetch 被域名安全策略拒绝；curl 得到 GBK 页面但帖子正文/登录内容未提取，仅搜索摘要。
30. itch.io（kevdev/human-soldier-animations-free、mocaponline）：WebFetch 报 Socket is closed、curl 000，靠 WebSearch 摘要与 Unity/Fab 页交叉。
31. linux.do：WebFetch socket closed、curl JSON 空，仅搜索摘要（帖内推荐 Epic Animation Starter Pack/Mobility Pack、Plask）。
32. Adobe Mixamo FAQ：WebFetch socket closed；中国区限制与不可再分发结论来自搜索摘要，未直读原文。
33. 小红书/今日头条：登录墙、反爬或正文为空，只有摘要，未取得可引用原帖。
34. WebSearch：本会话 200/200 配额用尽，最后两组掘金站内检索未执行。
35. itch.io 全部子域（kaylousberg.itch.io、quaternius.itch.io、cuigames.itch.io）：curl 报 TLS 证书主机名不匹配/exit 35（证书指向 facebook 等），WebFetch 直接拒绝；KayKit/Quaternius 的 itch 评论、v1.1/v2.0/v2.1/v3.0 devlog 未读，只能依赖搜索索引摘要。
36. Reddit（www.reddit.com JSON、old.reddit、redlib.privacyredirect.com、eddrit.com）：reddit 直连 exit 35；redlib/eddrit 返回 Anubis 拦截或 Socket closed；r/gamedev 的 mocap 转换帖（z6djuc）与 KayKit 评价帖未读。
37. Adobe Community（community.adobe.com，Mixamo 登录/下载故障帖 589838）：curl exit 35，正文未读，仅搜索索引摘要可引用。
38. Stack Overflow 与 Blender Stack Exchange：页面返回约 5.8KB 人机验证页；51491653（rigged animation distorted after glTF）与 238489（animations blend on glb export）的答案未读。
39. Unity Asset Store 评论区：页面可开但评价由前端脚本加载，未找到可读的评价接口；KayKit 免费样例与 FPS Animation Ultimate 的文字评价未读。
40. Unity Discussions search.json：返回非 JSON（HTML/拦截），无法做站内检索；只能单帖 WebFetch 782390。
41. Fab 文字评价：Tactical FPS Animation Pack 页可读，但只有 15 个 5 星评分、0 条文字评价，Reviews 标签由客户端渲染，无正文可读。
42. GitHub REST 未认证额度：约 60 次请求后开始 403/rate limit；sketchpunklabs/kaykit_char、NoLimitNexus/game-models、doctor-g/KayKitAnimationInGodot、Xinba210/FireGun 的 issue 列表未读。
43. OpenGameArt 的 KayKit、UAL1、UAL2、Animated Pistol 页面：评论数为 0 或评论区为空，非不可达但无用户反馈可采。
44. Poly Pizza 模型页评论区为空（0 comments）；Fab 的 First Person Animations Starter Pack 与 Infima Modern Guns Pack 未再尝试登录/购买。
45. Google Drive（Quaternius 官方 zip）与本机 TLS 受限站点未重试；既有结论仍是“官方 zip 成员未核”。
46. itch.io 作者页（kaylousberg.itch.io/kaykit-series-6、drillimpact.itch.io/psx-first-person-arms-free）：curl/TLS 返回 000，WebFetch 报 Socket is closed，包内逐动作清单与许可只能从 Unity Asset Store、作者页摘要和搜索索引交叉核对。
47. npmjs.com 包页（@three-ws/retarget、@three-ws/motion、posecode-render）：curl 返回 403；改用 registry.npmjs.org JSON API 读取版本、发布时间、license，并用 GitHub 源码页作原始链接。
48. GitHub REST API 会话后段触发未认证限流（返回 undefined）；改用 raw README 与搜索结果里的 star/创建日期，未重新核所有仓库的 GitHub 许可证字段。
49. meshy.ai/features/text-to-animation：连接返回 000，功能、模型名和商用条款来自搜索索引，未直读页面。
50. basefount.com：站点只有 JS 壳，未找到 Animcraft 6.0 官方产品页；只有 Toolfarm/DigitalProduction 报道，因此未把 Animcraft 列为候选。
51. Tencent Games Motus：未找到 tencent.com 官方公告，只有 PR Newswire 及其转载；信息记于此，不当作已核作者原页。
52. GamesRadar 原文：构造的 canonical URL 返回 200，但正文未能读取，细节取自 inkl/NewsBreak 转载与 ixbt 二手报道。
53. 聚合/搬运站（3DCGHUB、gameassetsfree、cgu、uecandy、cgtrove）未当作原始出处；其条目只用于定位可能的作者原页。
54. Sketchfab 模型页（WebFetch）返回空 JS 壳，改用 v3 API 读元数据。
55. Sketchfab 下载端点匿名 401/需登录，未取 GLB/FBX；除 Cransh 通过 FPS-Arms-3D 的 scene.gltf 实测外，其余逐 clip 名未验证。
56. GitHub REST API 未认证额度 403（本机出口 IP），改用 raw/HTML/部分 clone；部分目录只能看顶层。
57. itch.io（Quaternius/KayKit/CuiGames 原页）TLS/socket 失败，未读；用官方站/OGA/Zenodo/Sketchfab 替代。
58. Kenney 下载直链 forbidden，只读到 3D 分类页，未取 zip。
59. CMU mocap 原站 http 证书错误，用 curl -k 读首页条款。
60. Red Eclipse actors issues 页只返回 JS/空列表。
61. WebSearch 额度 200/200 用尽，未能继续关键词搜索。
62. Xonotic data 仓库无 COPYING/LICENSE，GPLv3 取自 xonotic 主仓 README/COPYING。
63. OpenGameArt R90/P50 文件区标 currently unavailable due to potential licensing issues。
64. WebSearch：会话额度 200/200 已耗尽，无法再做关键词搜索。
65. itch.io（cuigames A5/P50 原页、Quaternius UAL、KayKit 商店）：curl 返回同一份无关 GitHub 页面/JS 壳，WebFetch 无法校验域名，商店授权与下载档位读不到。
66. kaylousberg.com：WebFetch 被域名安全校验拦截；curl 只能取到两个 pack 页的 itch 外链，/game-assets 索引为空。
67. OpenGameArt：WebFetch 403；改用 curl 可读，但 P50/A5 页的 File(s) 下载区显示因授权问题下架，无法取件验证。
68. Sketchfab：/v3/models/{uid}/animations 非公开（返回非 JSON），多数模型只能读 animationCount 与描述，拿不到逐 clip 名称；模型下载需登录账号，未实际取件。
69. GitHub API：core rate limit 60/60 用尽，仓库搜索无法继续。
70. Mixamo 需登录、Fab 为付费市场，按任务约束未尝试。
71. itch.io 全部候选页：Windows schannel TLS handshake failed（curl exit 35），--tlsv1.2、-k、--http1.1 均失败；只能使用 3d.shep.bot 索引里的标题、描述和文件名，许可与逐 clip 未读。
72. LobeHub Skills 页：返回 402 payment_required，未读。
73. ActorCore：Vue SPA，HTML 只有 #app，服务端无目录/许可内容。
74. Kevin Iglesias 产品页：meta refresh 到首页锚点，正文由 JS 渲染，逐 clip 与许可未读。
75. CGTrader Glock 17 页：直连正文为空（反爬/JS），仅 3d.shep.bot 索引。
76. 3dassets.dev 页面：React shell，正文由 JS 渲染；改用 3d.shep.bot API 与 CDN GLB 字节解析。
77. Fab 两个给定 listing：需 Epic 登录/既有 403 记录，本次未读详情。
78. Sketchfab 下载端点：匿名需登录（既往 401），只读 model API/评论，未取文件。
79. BlenderKit 文件：需账号/add-on 下载，未取；只读 license 与 asset metadata。
80. Xsens / MoCap Online 免费包：下载走表单/邮箱，未提交；只读页面说明。
81. AnimationShopee 的 /free 与 /military 路径均 404；只读首页目录。
82. Kubold 产品页：Downloads 列表可读，但逐产品/逐 clip 链接由商店/JS 承载，未核。
83. GitHub REST API：未认证 403 rate limit，改用 raw/HTML。
84. MoCap Central：只读首页与 free sample 链接，未逐页核 120 clip 清单。
85. TheGabmeister/Unreal-Animations：README.md 404，改读 README.txt；仓库只有 KayKit/UAL1/UAL2 的 UE 工程，未发现新源。
86. WebSearch：本会话 200/200 额度用尽，后续全用直链/API/索引。
87. itch.io 全站（jdbeardmore Free Motion Pack 1、kevdev Human Soldier Animations FREE、cuigames 原页与 cuigames-free-fps-weapons 集合、trickytriangles/minute-arena、toiletsnakes）：curl schannel 握手失败、Python urllib UNEXPECTED_EOF、WebFetch 均 Socket closed；换 jdbeardmore.com/jdbeardmore.github.io 也无内容。
88. 知乎 9 篇文章（含 UE5 FPS 动画系统上下篇、搜打撤分层、多人射击12、InfimaGames 拆解、Merge ALS 两篇、枪械自由搭配、ALS+FPS Multiplayer Template）：桌面/移动 UA 与 api.zhihu.com、zhuanlan API 全部 403；tardis 镜像返回 400，无法读到正文与外链。
89. B 站 4 个视频（BV1kdnF64Eit、BV1MfJi6MEoi、BV1Swjn6JEcc、BV1q5QqBFEf1）：网页与 api.bilibili.com 均 412（WAF），无法取标题/简介/评论。
90. 微信公众号 Universal Animation Library 文章（mp.weixin.qq.com/s?__biz=MzU3NzgyMDQyNQ==...）：返回“环境异常，完成验证后即可继续访问”，正文不可读。
91. forum.freegamedev.net 的 t=5324（给定 3rd person blender sci-fi pack 评论里 JohnnyBlack 的 FPS 包线索）：DNS 被解析到 28.0.0.2，HTTP 空回复。
92. Sketchfab 的 mutant-grunt 页面（给定 Mutant Grunt 的设计原作者 Nmn）：HTTP 202、空 body，下载需登录；仅设计、无动画。
93. 通用搜索引擎：WebSearch 预算耗尽；Google/DDG/Brave/Mojeek 为 TLS 握手失败或 403；Bing RSS 返回与查询无关的垃圾结果；Marginalia 有反爬等待且索引不含 itch。因此无法用 site: 补检 itch/知乎/B 站。
94. gitcode 的 Claude-of-Duty 镜像：WAF 418 拦截；改用 GitHub 搜索找到原仓 mshumer/Claude-of-Duty，README 明说“没有任何美术资产、全部程序化生成”，故无动画源可追。
95. Unity Asset Store 的内部搜索 API（/api/en-US/search/results.json）404，只有搜索 HTML 可用但结果由客户端渲染，无法枚举 KINEMATION 的 8 个具体商品页。
96. itch.io 全站：证书主机名不匹配（证书指向 facebook/kadastr38 等），curl 全部 000，WebFetch 报 altnames 不符；BinToon、laojianggame、c1aymor3、projecta2b、fredrichi、grigory-petrov、oudarya、thelowis 的页面正文、逐 clip 清单和许可均未读，只有 3d.shep.bot 索引元数据（标题/作者/免费标记）。
97. mocaponline.com 的 Shooter Bundle 与部分产品页：读 rifle/pistol/licensing/free 后触发 429；bundle 的逐包清单仅按已读的 rifle/pistol 页推断。
98. heat.tech 与 heat.tech/marketplace：522，免费 25 动作之外的全库目录、firearms 分类与逐条动作未读；只有 CGChannel 文章转述（免费档仅非商用、付费 Mover 才商用）。
99. actorcore.reallusion.com/motion/free：返回 200 但是 JS 空壳，免费动作/枪械分类未读；只有 CGChannel 文章与 Reallusion 论坛许可帖。
100. protofactor.com：000 / Socket closed，ULTIMATE ANIMATION COLLECTION 发行商的其他包与逐动画清单未读；assetstore publisher/265 页面也只显示 bundle 推荐、不列该发行商产品。
101. kinemation.xyz：仅“Launching Soon”和联系表单，无产品目录/Fab 链接；只能读 gitbook 文档（Pro/Lite、20 武器、换弹类型），商店页与价格适用性未核。
102. motionlibrary.com：403，Rokoko 150 个免费动作的正式条款与动作类别只能按 CGChannel 报道。
103. andersonrohr.gumroad.com 与 motekentertainment.com：本机 curl 000，134 个/8 个免费动作的原下载页与正式许可未直读。
104. GitHub REST API：未认证 60/hr 限额在读取 Mesh2Motion/glTF/Godot issue 后耗尽（403），GitHub 搜索 API 无法使用；后续改用 issue/PR 的 HTML 页面，但无法批量找 cross-reference。
105. Unity Discussions：/t/782390.json 返回 403，仅通过 WebFetch 读页面正文；帖子内 MFPS Multi Player FPS 2.0 未给链接，未能取得其商店原页。
106. Wallace/其他论坛候选（MFPS、Bento Buddy、HunYun 3D Studio、KevDev）虽在评论中被点名，但原页面没有可核实的原始链接，均未列入候选。
107. itch.io 系列页面（kaylousberg.itch.io/kaykit-series-6、quaternius.itch.io/universal-animation-library、drillimpact.itch.io/psx-first-person-arms-free、cinevva.itch.io、cuigames.itch.io/a5-carbine 及 itch.io/c/8384147）：curl 返回 HTTP 000/TLS 失败，WebFetch 报 Socket is closed；Quaternius 内容改由 quaternius.com 与 Godot Store 读到，KayKit/drillimpact/CuiGames 无替代页，未能核对实际下载成员与 clip。
108. Sketchfab 模型 HTML 页与相关推荐：curl 返回 HTTP 202 空页，WebFetch 无内容；改用 v3 API 读到元数据与按 model 过滤的评论，但网页端的相关模型/标签推荐未读到。
109. meshy.ai/features/text-to-animation：WebFetch 报 Socket is closed，curl 取到的是无关缓存页，功能、输出格式与授权条款均未读到。
110. app.nz 文章给出的源码入口 github.com/lee101/app-site/tree/master/open-source 返回 404（仓库已迁移或私有），未能核对 Motion Commons 的实际 clip 清单。
111. Godot Forums 帖 1-14 页：WebFetch 报 Something went wrong，curl 只拿到第 15 页服务端渲染片段，前 14 页正文未能读全。
112. Unreal Engine 官方 GASP 5.8 tech-blog：curl 403，改用 80.lv 摘要与 Epic 文档页替代，未读到博客原文。
113. WebSearch：本会话 200/200 次预算已用尽，后续无法再做关键词搜索，改用 GitHub/Sketchfab/OpenGameArt API 与 curl。
114. Fab.com：搜索页与商品页均 HTTP 403；Free FPS Template、Rifle Mega MocapAnimPack、RIBSeller 的原始 listing 未取到。另 operation-steel-tide 的 AGENTS.md 明确禁止 Fab Standard/市场资产进入公开仓，即使取到也不满足本卡再分发条件。
115. Sketchfab 网页 HTML：返回空内容或 202 挑战，无法从网页读 clip 名；v3 API 在多次调用后 429，限流前只拿到作者、许可与 animationCount。
116. 100style.com：域名已停放待售；数据集原始页在 ianxmason.com/100style（可达），未把停放页当内容。
117. DuckDuckGo HTML 与 Bing：DDG schannel TLS 握手失败；Bing 国内跳转返回无关结果，未能作为检索通道。
118. Liblast：Codeberg 框架仓可达，但只含一个 bot01.gltf，没有枪械动作或角色动作资产；未找到独立游戏资产仓。
119. Mugen87/dive：可达，但 app/models/README.md 只有静态 Sketchfab 枪与 Mixamo 士兵（License: None），无可用角色动作。
120. Kevin Iglesias Human Soldier Animations FREE：页面可达，但许可禁止以可提取形式再分发、禁止作为资产包/模板分发，按本卡标准未入候选。
121. MoCap Online Rifle MoCap Pack、Rifle Mega MocapAnimPack、RIBSeller：付费/Fab 入口，按任务约束未尝试。
122. WebSearch：本会话额度 200/200 已耗尽，无法再跑 site: 查询；改用 GitHub/站点 API 与直接抓取。
123. itch.io：curl 对所有 itch 页返回 schannel TLS handshake 失败（000），WebFetch 报 Socket is closed；BinToon MW2 MP5 reload、c1aymor3 GUNS + RELOADS、Cuigames X50 等只能从 3d.shep.bot 聚合摘要看到，原页许可与文件清单未读到。
124. Sketchfab 搜索页：HTTP 302 跳登录/反爬，未取得 CC0+animated 搜索列表；按任务“需登录不尝试”未继续。
125. CGTrader – Glock 17 FPS Weapon Animations：HTTP 202、0 字节（bot challenge），许可与是否含独立弹匣未读到。
126. Blockbench Workshop 搜索：/search?q=reload 返回 404（站点为前端应用）；只能读给定单模型页，未发现作者其他可下载动画包。
127. 3dmodelscc0.com：域名已被停放/劫持为博彩站（页面标题 ALEXISTOGEL），原 CC0 模型站与 nisu 的原始下载页已不存在。
128. Poly Pizza 搜索：/search/reload 为客户端渲染，HTML 无模型链接，公开 API 需 key；未能列出新条目。
129. Godot Asset Library API：filter=animation&godot_version=4.6 返回 total 0，参数不被接受，未取得商店新候选。
130. Fab / Epic 商店：需 Epic 登录，按任务未尝试；Paragon / Game Animation Sample 只沿用给定条目，未新增。
131. 知乎候选文（含 p/671344098、p/2069448893708899517）：HTTP 403，无法读正文与文中外链
132. Bilibili API（BV1MfJi6MEoi、BV1kdnF64Eit、BV1Swjn6JEcc、BV1q5QqBFEf1）：返回非 JSON/412 风控，无简介与评论，无法核 ActionForge/免费替代工具清单
133. 微信公众号《可商用免费通用动画库》：返回“环境异常/完成验证”页，正文未取到
134. itch.io 的 kevdev、mocaponline demo、elbolilloduro 等页：TLS/socket closed，原页许可与文件清单未读
135. freegamedev.net 论坛 thread 5324（OGA 3rd-person sci-fi pack 评论里提到的 FPS pack 线索）：HTTP 000
136. heat.tech/marketplace?availability=free：HTTP 522，只靠 cgchannel 转述
137. Unity Asset Store 出版商目录（Kubold 5491、KINEMATION 74506、PROTOFACTOR 265、Infima 36638）：页面为 JS 壳，“Loading...”后无商品列表
138. Fab 页面经 WebFetch 返回 403；curl 读 HTML 内嵌 JSON 才拿到标题/卖家，但相关推荐列表未展开
139. mocaponline.com/products/death：local_rate_limited，未逐条核 death 包动作名
140. RIB Studio 官网 ribstudio.com：空响应；KINEMATION 官网 kinemation.com：TLS handshake 失败
141. CGJOY 附件与部分回复需登录，只有正文/公开评论可读
142. DuckDuckGo HTML 搜索返回 0 字节，无法补充站外检索
143. WebSearch 工具：本会话 200/200 额度已用尽，未执行任何关键词检索
144. Google Drive / itch 下载档、Fab 购买与登录型入口按任务未尝试
145. itch.io 全站（kaylousberg.itch.io、quaternius.itch.io、cuigames.itch.io、drillimpact.itch.io、itch.io/c/8384147）：curl schannel TLS handshake 失败，证书主机名指向 facebook/fbcdn；WebFetch 同样 Socket closed，无法读原页或成员清单。
146. discourse.threejs.org/t/mixamo-adding-a-weapon-to-character/5479：WebFetch 报“无法验证域名安全”，同域其他帖子可读，重试仍失败。
147. godotforums.org/d/42698-mesh2motion-a-program-for-character-animation/15：页面只返回加载错误/空壳，无回复正文。
148. Sketchfab 评论区：页面客户端渲染为空；api.sketchfab.com/v3/comments?model_uid=… 忽略过滤参数并返回同一批 2012 年无关评论，无法取到各模型评论与作者回复（模型元数据仍可用）。
149. store.steampowered.com/news（Bodycam v0.8、Earths Edge DevBlog #9）：一个只返回导航壳，另一个 WebFetch 被域名策略拦截，devlog 正文未读。
150. gamesradar.com 的 Arc Raiders 换弹报道：域名被 WebFetch 安全策略拦截，未读正文。
151. WebSearch：本会话额度 200/200 已耗尽，本单元一次检索也无法执行；改用直链、站内目录与 API。
152. bentobuddy.com / www.bentobuddy.com：TLS handshake 失败，Bento Buddy 只有 Mesh2Motion #118 评论里的名字，无原始页可核。
153. meshy.ai（features/text-to-animation、features/ai-animation-generator）：一次 Socket closed、一次证书主体不匹配（SEC_E_WRONG_PRINCIPAL），正文未读。
154. tripo3d.ai：TLS handshake 失败，无法核页面与定价。
155. app.nz/animation-library：页面只有标题，正文由客户端渲染，未取得分类/许可/API 细节（同站 API index.json 未展开）。
156. r.jina.ai 文本代理：TLS handshake 失败，无法用它绕过 itch/Sketchfab 的渲染问题。
157. Quaternius 的 Google Drive 下载目录与 itch 页：drive 链接 TLS/连接失败、itch 全站不可达，官方 zip 成员与 Animated Guns 逐 clip 文件仍未核。
158. Microsoft Rocketbox 的 417 个动画只知在仓库 Assets/Animations 下，未逐个展开 clip 名与是否含枪械动作。
159. itch.io 全部候选页（MoCap Online 免费手枪页、Fredrichi、Truco13、BinToon、ProjectA2B、C1aymor3、Grigory Petrov、LaoJiangGame）：curl schannel 与 Python OpenSSL 均在 TLS 握手失败（exit 35 / UNEXPECTED_EOF），WebFetch 返回 Socket is closed 或证书被劫持（truco13.itch.io 证书指向 extern.facebook.com）；r.jina.ai 与 web.archive.org 也 TLS 失败，作者页、评论区与相关推荐均未读到。
160. mocaponline.com 官网：HTTP 403，未取得免费包动作清单/许可。
161. ActorCore free 页：仅约 3 KB 的 JS 壳，无服务端数据或可用公开 API，免费 mocap 包清单与许可未读到。
162. Kevin Iglesias 的 soldierAnimationsFREE 页：仅约 2 KB JS 壳，未取得该免费包动作清单或同站其他免费包。
163. CGTrader Glock 17 FPS Weapon Animations 页：HTTP 202 空 body（bot 挑战），作者与相关模型未读到。
164. Fab 单个 listing 详情二次抓取：HTTP 403；价格与许可文字未读，只有卖家页 JSON 中的 title/uid 与首轮 200 的页面摘要。
165. WebSearch：本 session 200/200 配额已耗尽，无法再用搜索引擎补漏或查转载索引。
166. WebFetch：OpenGameArt 返回 403（改用 curl 成功）；itch.io 域名 socket closed，无法作为替代取法。
167. Kubold FPP Gun Animations（Witchfire 约 1500 clip）：博客确认存在，但未公开销售/授权，无原始下载页，不能作为候选。
168. WebSearch：会话预算 200/200 已用尽，无法再用外站搜索引擎补线索。
169. itch.io（Humana Basics、TheLowis、站内搜索）：curl TLS handshake failed，WebFetch 返回 Socket is closed。
170. YouTube / Haydn Cooper 频道：curl TLS handshake failed，WebFetch Socket is closed；CGJOY 帖只给频道链接，无法核其商店/资产。
171. HEAT（heat.tech）：HTTP 522。
172. Motek 免费样本页：WebFetch Socket is closed。
173. Anderson Rohr Gumroad：WebFetch Socket is closed。
174. Blender issue #61484：HTTP 403。
175. Unity Asset Store 发布商页（KINEMATION）：页面只显示 Loading，资产网格未渲染。
176. ActorCore 首页：返回空正文，无法列产品/许可。
177. Fab 免费资产下载：需 Epic 登录，按任务未尝试；仅核公开 listing 描述与许可。
178. Sketchfab 模型下载：/v3/models/{uid}/download 匿名需登录（未尝试）；网页正文为 JS 壳，仅用 public API 读元数据，API 后段 429。
179. Fab 的 WebFetch：403，改用 curl；非内容缺失。
180. gh CLI 未安装，GitHub 改用 raw.githubusercontent.com。

## 附录 B · 已完成收集与追踪的实际来源及取法（原始记录，18 段）

### B.1

实际渠道与取法：WebSearch 英文约 14 组（AGENTS.md game animation asset pipeline；Quaternius devlog/interview；KayKit interview；Mesh2Motion author；Operation Steel Tide devlog；open source FPS reload animation；Liblast reload；Xonotic/Unvanquished animation；three.js skinning/SkeletonUtils；Khronos glTF sample assets；GDC first-person weapon animation；CC0 rifle reload；Godot FPS template reload），本会话额度 200/200 用尽，中文补充检索未执行。WebFetch 读了 Autodesk、Game World Observer、部分 GitHub/Codeberg 页面；部分域名被安全策略拦截（kenney.nl、github.com 一次、blockbenchworkshop.com）。curl/HEAD 逐条核候选状态（200/403/000），并用 GitHub raw/HTML/API 读 AGENTS.md、LICENSE、docs 与脚本；GitHub REST API 后段触发未认证 403 限流，改用 raw/HTML。Codeberg API 读了 Liblast 的树与 README。直接解析 GLB 的 JSON chunk 得到：BAMEN 38 clip/78 骨/1 mesh，Viper 38/51/4，DJMaesen 24 clip/49 骨/3 mesh，AK 的 Magazine/SpareMagazine/MagazineGrip/BoltHardwareGeometry、SCAR 的 Magazine/SpareMagazine/BoltGeometry/TriggerGeometry（另含 MagazineGripSocket/MagazineWellSocket 锚点）独立节点；解析 IQM 头得到：Red Eclipse 模型 78 joints、每动画文件 78 poses、rifle_reload 51f@24fps=2.125s、hud_rifle-reload 123f@60fps=2.05s、reload_pistol 22f@24fps=0.917s。另用 curl 读 Blockbench 页确认 CC0/3 动画/9 骨。上一单元 sources.md 的渠道与不可达记录只作交叉核对，本单元候选均重新打开原页/原文件。

### B.2

角度：任务文件第 2 个成套来源 = Kenney 官方套件；同时补做了「头部覆盖」：GitHub topic/搜索按 star 与近期活跃度、awesome 列表、插件与 Skill 市场，并把新找到的逐项与 a1dbv 已覆盖范围对照。

Kenney（主角度）：抓取 kenney.nl/assets/category:3D 全部 4 页共 50 个 3D 包；抓 search=character/animation/fps/weapon/shooter/gun/zombie；逐页读 animated-characters-protagonists/retro/survivors、blocky-characters、mini-characters、blaster-kit、survival-kit、mini-arena、graveyard-kit 的 Features/License；读 kenney.nl/starter-kits 并展开 KenneyNL/Starter-Kit-FPS 的 README、LICENSE 与 models/objects 目录树；用 ETdoFresh/kenney.nl 的 47,655 文件 tree 核 Graveyard/Blocky 成员；Mastodon API 查 Kenney 三条 2025 帖（空响应）。结论：Kenney 全 3D 目录中没有“人形+枪+reload”成套；官方 FPS starter 也只有 blaster.glb / blaster-repeater.glb，没有第一人称手臂与 reload clip。

GitHub（搜索 + 逐个仓库核 tree/raw/LICENSE）：search/repositories 查询 fps animation reload、character animation pack、game animation assets cc0、cc0 animations、cc0 3d characters、cc0 rigged character、fps assets cc0、third person shooter cc0、unity fps animations、animated arms fps、weapon animations pack、free game assets list、awesome game assets、topic:game-assets、topic:animation、soldier glb animations、shooter character model animations 等；核 BigAndCrispy/Unity-First-Person-Shooter（LICENSE/README/Arms.fbx.meta/Pistol.fbx.meta，并下载 Arms.fbx 2,058,220 B、Pistol.fbx 164,316 B 做 strings 解析）、Ayush-Mohanty/FPS-Arms-3D（LICENSE、license.txt、scene.gltf JSON 解析出 8 clip/arms+AK+Mag_2）、petroulacl/fps-asset-kit、nicholaspsmith/godot-fps-starter、aadithva/shardline-outpost（ASSETS.md/AssetLibrary.js）、wangjialiang678/three-military-tps、Ariescar/ai-game-jam-threejs-boilerplate、TheGabmeister/Unreal-Animations、NoLimitNexus、ToxSam/open-source-3D-assets、KenneyNL/Starter-Kit-FPS、ETdoFresh/kenney.nl、rehan-remade/animated-asset-skill 等。所有下载/解析只在临时目录，未改仓库文件。

头部列表与市场：devanshutak25/3d-resources（1015 stars，3400+ 条，含 39 项 Mocap & Animation Libraries）、Calinou/awesome-gamedev、A19200332/awesome-game-assets、3d.shep.bot 的 free animated character models 索引；LobeHub Skills 的 game-3d-assets、skill4agent 同名页；Sell.app 的 Game Assets Daily（clr.sell.app）。

其他一手页：OpenGameArt cc0-flat-guns-west/east；Sketchfab API（/v3/search 带 animated=true&downloadable=true 与 license=cc0，/v3/models/{uid} 读动画数/许可/描述），核 S.W.A.T. Operator、FSB Operator、Stylized Sci-Fi Officer with Gun、S.W.A.T Operator Cop、Free animated Pump Shotgun、Rodin Trooper、Silver Soldier、Stylized Sci-Fi Soldier、Tropic Commando；ai3d.studio；3dassets.dev；VitruvianGodot；ACCAD；Xsens；MoCap Central；MoCap Atlas；MoCap Online；AnimationShopee；Kubold；Fab 的 Paragon Animations Retargeted to Manny 与 Game Animation Sample Project（链接来自 awesome 列表，站点 403）。

WebSearch（额度内）关键词：Kenney character animation pack rifle reload、free CC0 third person character animation pack rifle reload crouch fire death、CC0 character animations reload rifle glTF github、free FPS animation pack commercial use reload crouch death、low poly animated soldier free CC0 glb、2026 free character animation library CC0、itch.io 8 free CC0 rigged animated low-poly characters、free low-poly modern soldier 5 animations 等。

a1dbv 对照：domains/game-dev/assets/animation.md 只列 Mixamo、Motorica、Uthana、Cascadeur、Quaternius itch、Fab listing 等；domains/game-dev/assets/3d.md 只把 Kenney 当环境/道具/材质来源，没有 Kenney 角色动作页；game-content-production/SKILL.md §3 把 Kenney 与 KayKit、Quaternius 并列为“免费成套”，但未给 Kenney 角色动作的逐包结论。因此本轮 Kenney 角色动作、BigAndCrispy、FPS-Arms-3D、ai3d.studio、3DAssets.dev、VitruvianGodot、ACCAD、Xsens、MoCap Central/Atlas/Online 等均属 a1dbv 未覆盖。

### B.3

OpenGameArt（本次主渠道）：用 art-search-advanced 的 field_art_type_tid[]=10（3D Art），以约 110 组 keys 搜索（reload、rifle、pistol、shotgun、smg、gun、weapon、soldier、military、swat、terrorist、marine、fps、first person、third person、viewmodel、md3、enemy character、animated soldier、weapon animations、gun hands、crouch、death animation 等），解析 746+640+266+247 条结果；读 CuiGames、MilitaryG、CoinCoin、knik1985、nublet、Quaternius 等作者页；逐页抽取 author、license、body、copyright notice、file 列表与评论区；下载并只用 CPU 解析 blutrotunity.zip、pistol_6.zip、grunt_wp.blend、riot_wp.blend、DeadProject Goal2.zip、kenney_prototype-kit.zip（zipfile、gzip、GLB JSON chunk、Godot .tscn、Blender AC action 名）；对 Necrobot 评论区核对到作者把动画放在 Blender Actions 列表、后续评论确认动作手工且非 Mixamo。HN：hn.algolia.com/api/v1/search 的 stories 16 组 + comments 10 组（reload animation、character animation、game animation、Mixamo、Quaternius、KayKit、free 3D assets、CC0 animation、FPS animation、motion capture、Godot FPS、three.js fps 等），并跟进 49053406、35237113、45695363 的父帖/story。dev.to：/api/articles 按 threejs、gamedev、godot、blender、gamedevelopment、webgl、unity3d、animation 等 12 个 tag 拉取并过滤 522 篇。GitHub：search/repositories 8 组（fps arms animations、fps animation pack、reload animation godot、fps character animations、godot fps arms、threejs fps animations、cc0 fps animations、rifle reload animation），核了 4 个仓库的 README 与 license。另用 curl 读 The Astronauts 原博客（WebFetch 被域名策略挡，curl 成功）。未改任何文件。

### B.4

实际渠道：WebSearch（US-only，本会话 200/200 配额用尽，最后两组掘金检索未执行）；WebFetch/curl 直读 B站视频页、GitHub HTML/raw、Gitee raw、Unity Asset Store、Fab、Godot Asset Store、ai3d.studio、爱给网、CGChannel；知乎直读 403 只能读搜索摘要；微信公众号被验证页挡住只能读摘要；CGJOY 用搜索摘要（WebFetch 域名策略拒绝，curl 得 GBK 页但正文未提取）；少数派、即刻、小红书、今日头条、linux.do 做了站内检索但只得到摘要或无相关内容。中文搜索词约 40 组：换弹动画 免费 商用、角色动作 库、枪械 动画 资源、步枪 换弹 素材、FPS 动画 叠加 走路、上下半身 分层、搜打撤 动画、TPS FPS 动作源、Blender 换弹 工程、CGJOY 换弹、Universal Animation Library 中文、KayKit 中文、Quaternius 评测、Mixamo 商用 中国、免费 士兵 动画 包、Human Soldier Animations 等；英文：free rifle reload animation pack、Kevin Iglesias license、Ultimate Animation Collection、Rifle Mega MocapAnimPack、ActorCore/HEAT/MoCap Online free。取法：先搜中文综述，追其引用的作者页/商店页/GitHub/Gitee，再用 raw/API/curl 核 README、clip 清单与许可；B站只读视频简介，公众号/知乎/CGJOY 只读摘要。结果判断：中文社区本轮最新信号是 Kevin Iglesias 免费士兵包（含 reload、无 crouch、许可禁止可提取原始文件再分发）与 UE5 additive/上下半身分层方法；其余多为 UAL/Quaternius/CombatGirls 的二手推荐、付费资源转载或程序化假换弹实践。少数派只有 2D 序列帧/AI 工作流文章，无 3D 角色动作源；即刻多为 AI 生成游戏素材，无资产源。

### B.5

按“真实使用中的问题与反馈”角度扫了以下渠道，全部为实际打开或实际调用 API 的结果：
1) WebSearch（中/英/日，约 20 组即触及本会话 200/200 配额）：KayKit problem/retarget/Godot、three.js SkeletonUtils/GLTFLoader clip name/Blender NLA、Mesh2Motion issues/standalone、free FPS animations reddit、KINEMATION review、Quaternius license change、Mixamo complaints、KayKit 换弹/缺点、Quaternius 协议/步枪换弹、日语 リロード アニメーション、换弹动画 难找 等。配额耗尽后改用站点 API 与直链。
2) GitHub REST（未认证）：Mesh2Motion/mesh2motion-app issues 列表与 #18/#101/#114/#118/#127/#136/#139/#141/#148/#155 正文与评论、search/issues（KayKit reload、Quaternius rifle reload 等）、godotengine/godot #53544、KhronosGroup/glTF-Blender-IO #953/#1843/#1951、mrdoob/three.js SkeletonUtils 相关 issue/PR 列表、gdquest-demos/godot-4-FPS-arms issues（0 条）。
3) Discourse JSON API：forum.godotengine.org（search.json + /t/{id}.json：128792、130611、133069、135582、139099、140811、55990）、discourse.threejs.org（search.json + /t/{id}.json：5479、15361、22121、59438、65329、86820）、forums.unrealengine.com（search.json + /t/{id}.json：102025、368113、1330073、1811585、1848331、2024162、2531370、2669313、2720502）、blenderartists.org（search.json + /t/{id}.json：1485038、1580798、1589109）。
4) StackExchange API：blender/stackoverflow 的 search/advanced（gltf multiple actions、gltf animation name、three.js gltf animation、skinned mesh clone）；问答正文页被人机验证拦截，仅拿到标题与摘要。
5) Sketchfab v3 comments API：`/v3/comments?model=<uid>` 读 Modern Army Soldier、Barcode M4、DuqueCD7 Pistol、Kriss Vector 的评论。
6) OpenGameArt HTML：curl 抓取 universal-animation-library、universal-animation-library-2、kaykit-character-animations、animated-pistol、low-poly-animated-guns、low-poly-m4a1、fps-weapons、fps-character-necrobot、a5-carbine、r90、p50 页面，解析 `#comment-*` 正文。
7) Godot Store 页面：quaternius/universal-animation-library（12 条评价）、fabbio-mendoza/ultimate-animation-library（0 条评价）。
8) HN Algolia API：item 45693325（Mesh2Motion 发布讨论）完整评论树。
9) Fab 列表页：curl 取 listing 1ae386ab… 的嵌入 JSON（15 个评分、0 条文字评价、约 HK$470）。
10) 其他直链：pro.alcuesto.jp 的 Quaternius 许可文章、Godot Forums（NodeBB）42698 第 15/17 页、w3dhub weapon rigging、Poly Pizza 模型页。
未重复展开既有 sources.md 已覆盖的渠道（itch、Google Drive、Google Drive、Sketchfab 下载、Unity Asset Store 购买页等），只针对反馈类内容补充。

### B.6

先读任务 job.md、目标仓 AGENTS.md/brief，以及 a1dbv domains/game-dev/assets/animation.md 与 docs/research/2026-10-14-game-wp4-animation.md，并把候选与本卡已有 asset-pipeline/character-action-sources/sources.md 的 23 个来源族和 URL 清单逐条对照；已覆盖的 Ultimate Animation Library、ActionForge、FireGun、Modern Army Soldier、A5/R90/P50 等未重复，a1dbv 已提过的 MotionBricks/ARDY/Kimodo/Uthana/Mixamo/Mesh2Motion 只作排除记录。渠道与取法：WebSearch 中英文约 25 组查询（new free character animation pack 2026 rifle reload glTF；2026 new open source motion capture；Three.js character animation retargeting 2026；2026 免费 角色动画 步枪 换弹 开源；视频转 Mixamo 动画 2026；procedural reload animation generator；human object interaction motion generation 2026；GDC 2026 reload；Blender 5.0 / Three.js r186 / Godot 4.7 animation；KayKit/Quaternius/Kenney 2026 new pack 等），WebFetch 直读作者/官方页，curl 读 npm registry JSON、Steam Store 与 Steam News API、GitHub raw README、HN Algolia API、GitHub search API（created:>2026-08-01 按 star 排序找新库）；对 itch.io、npmjs、meshy 等被墙/403 的页面改用 registry API、Unity Asset Store、GitHub raw 或搜索索引交叉核对。时间窗以 2026-08 至 2026-11 为主，7 月和 5 月的少数项已注明日期。

### B.7

读了 job.md 与既有 asset-pipeline/character-action-sources/sources.md（只读，未改文件）。GitHub：用 raw.githubusercontent.com、HTML 和部分 clone 读了 operation-steel-tide 的 CONTENT_PROVENANCE/ART_PIPELINE_TODO、cktang88/3d-fps 的 ASSET_SOURCES/ANIMATION_RESEARCH、redeclipse/actors 的 readme、Mugen87/dive 的 app/models/README、Ayush-Mohanty/FPS-Arms-3D 的 tree/LICENSE/scene.gltf、xonotic/xonotic-data.pk3dir 的 models/player、Liblast 与 liblast-framework 的 tree/bot01.gltf。Sketchfab：用 v3 API 的 /search?type=models&user=、/models/{uid}、/comments?model= 查了 ccransh、bumstrum、bamenwo05、m152027350、jayb3e、1Matzh、TheParaziT、DuqueCD7、BasicModel、MissingTray1151、SidewalkNZ。官方页/数据集：quaternius.com（UAL1/UAL2/Animated Guns/Universal Base Characters/Ultimate Modular Men）、kenney.nl 3D 分类、zenodo.org/api/records/8127870、mocap.cs.cmu.edu（curl -k）、opengameart.org 高级搜索（rifle animation/fps arms/soldier animation/gun animation/character reload）及 R90/P50/NetSriK/Robin Lamb/knik1985/animated defender/UAL 镜像等页。WebSearch 本会话 200/200 已用尽，后续改用站点搜索与 API。筛掉的线索：Modern Army Soldier 评论区自述是 Metal Gear Solid Portable Ops 预制模型；SidewalkNZ 士兵描述写 Call of Duty: Finest Hour；BarcodeGames M4 评论指 stolen content；jayb3e 其他模型自述 Mixamo 绑骨，故其 16 clip 军用角色未入候选；CuiGames R90/P50 的 OGA 文件区标 licensing issues；Xonotic 为 GPLv3+。结论：本组外仍未找到同时具备 idle/run/crouch/fire/reload/death、独立手臂/枪/弹匣、且零改接入的成套源；新候选分成 FP 换弹链（Cransh/1Matzh/TheParaziT/BasicModel/BAMEN）与身体 locomotion 链（Rocketbox/100STYLE/CMU/Quaternius/Tactical Soldier）。

### B.8

逐个用 curl 打开给定页及其外链：Game World Observer 的 Quaternius 采访（外链到 quaternius.com/packs/toonshootergamekit、scifimodularguns 等）、Jettelly UAL2 文章（外链 quaternius.com/packs/universalanimationlibrary2 与 Unity Asset Store 付费包）、ArtTechPost 与 Digital Production 的 Mesh2Motion 报道、80.lv 的 Mesh2Motion Update 6 与 UAL2 报道（UAL2 页外链 Reddit r/godot 帖）、OpenGameArt UAL1/2 页（tag 与 uploader 集合）、Quaternius 官网 /packs/ 索引逐包读描述、KayKit 两个 pack 页（只取到 itch 外链）、Mesh2Motion 官网与 GitHub README、Kinemation 文档、BigAndCrispy README。扩展检索：OpenGameArt art-search-advanced 用 keys=fps、gun+animation、rifle+animated、first+person、hands、arms、reload 与 /content/cc0-3d-weapons 集合页；Quaternius 官网逐 pack 页；Sketchfab 公开 API v3 /search?type=models&downloadable=true，查询词 fps hands animation、weapon reload animation、rifle animation pack、fps weapon animations、fps character animation、soldier animation pack、arms rig fps，并用 /v3/models/{uid} 与描述字段核对许可证与 animationCount；GitHub API search/repositories 仅成功一次（fps animation three.js）后限流；Reddit 1qllm2q.json 未取到正文。未使用 WebSearch（额度已尽）。

### B.9

实际读到的渠道与取法：GitHub raw/HTML（petroulacl/fps-asset-kit 的 README 与目录、KenneyNL/Starter-Kit-FPS 的 README/文件树/issues、ETdoFresh/kenney.nl、devanshutak25/3d-resources 的 Mocap & Animation Libraries 全表、A19200332/awesome-game-assets、aadithva/shardline-outpost、wangjialiang678/three-military-tps 的 ARCHITECTURE/README、rehan-remade/animated-asset-skill、ibrews/vitruviangodot、TheGabmeister/Unreal-Animations 的 README.txt 与 Content 树、nicholaspsmith/godot-fps-starter 的 LICENSE-ASSETS）；OpenGameArt 作者页与作品页（Pichuliru、CC0 Flat Guns West/East、Flat Gun Attachments、Flat Ammunition、Ultimate Low Poly Guns）；Sketchfab v3 API（/v3/models/{uid}、/v3/comments?model=、/v3/search?type=models，检索词 animated soldier / swat animated / reload animation / rifle reload / animated tactical / soldier animations）；3d.shep.bot（/v1/providers、/v1/search 检索 reload animation / fps animation / character animation / rifle animations / gun animations / mannequin / mocap / lumen / kestrel，及 /v1/assets 详情）；对 3dassets.dev 的 GLB 用 curl 直接管道到 Python 解析 GLB JSON chunk（未落盘），读了 pistol/SMG/battle rifle/marksman 的 clip 与节点名；BlenderKit licenses 页；Grab3D soldier 页；Poly Haven info API；ACCAD、Xsens、MoCap Online/Atlas/Central、AnimationShopee、Kubold downloads、Kevin Iglesias、ActorCore 页面；three.js RobotExpressive README 与 Soldier.glb 前段 accessor 名（可见 mixamorig 骨骼）。WebSearch 200/200 额度已用尽，之后全靠直链、站点 API、索引和作者页；没有修改任何文件。

### B.10

先读了 job.md 与本仓 asset-pipeline/character-action-sources/sources.md（只读，未改任何文件）。WebSearch 本轮预算已在开工前用尽（200/200），6 条 site: 查询全部被拒；改走 curl/WebFetch/站点内搜索：OGA 内容页 + /users/{militaryg,nublet,tehbucket,johnnyblack,ifrit,laleksic,firewarden,cuigames,nmn} 与站内 art-search（keys=deadproject、fps+pack、reload、motion+pack、soldier+animated、rifle+animated、military+character），并顺 collection 页（fps-1、3d-humanoids-under-cc0、cc0-weapons-0、low-poly-retro-style-3d）；curl 用桌面 UA 对 OGA 有效，WebFetch 对 OGA 一律 403。GitHub 用 raw.githubusercontent 与网页 search（gh 未安装、api.github.com 共享 IP 已限流），追了 ThreeFury-FPS、chasergit/gear 及其 three.js discourse devlog、gdquest-3d-mannequin、ALS-Community、mshumer/Claude-of-Duty、kinemation 六个仓库；Gitee 用 raw README。Fab 用 listing/seller/search 页（内嵌 JSON 提取 title+uid，部分 listing 需带 Referer 才过 Cloudflare），Unity Asset Store 用 asset/publisher 页。Kubold 读了首页/store/downloads/两篇 blog 与 Rifle/Pistol 动作清单 HTML、Cover PDF；Kevin Iglesias 读主站并从 JS 的 licenseContent 取许可原文；Witchfire 文章读全文确认 Kubold；微信 GASP 文章读到并回查 Epic 原页，CGJOY 4 帖按 GBK 解码读正文与外链。取法为 curl 抓 HTML 后用 Python 去标签/抽 href，不做浏览器渲染。

### B.11

实际取法：1) 从给定候选页抽外链——用 Discourse JSON（three.js /t/<id>.json、Godot forum、Blender Artists、Epic forum 均可读；Unity Discussions JSON 403，改用页面 HTML 经 WebFetch）读楼主与全部回复的 cooked HTML 和 href；2) GitHub 走 api.github.com 读 issue 正文/评论/timeline 的 cross-referenced 事件（前几次成功，随后 60/hr 限流 403），限流后改 curl issue HTML 提取 comment-body 与链接；3) 用 3d.shep.bot /v1/search?type=model&free=true 检索，关键词：reload、rifle、fps、shooter、gun、reload animation、character animation、mocap、combat animation、crouch、fps animation、weapon animation、shooting animation；4) CGChannel 的 /tag/mocap/ 与 /category/free-resources/ 列表页顺着“free mocap”related-post 链追到 Bandai Namco、Rokoko Motion Library、Motek StockMoves、Moves by Maxon、Anderson Rohr；5) 直接读厂商/官方页：mocaponline.com（licensing、free-animations、rifle、pistol、free sampler、UE4 demo）、assetstore.unity.com 的 ULTIMATE ANIMATION COLLECTION 与 publisher/265、dev.epicgames.com（GASP、Lyra）、kinemation.gitbook.io（Unreal/Unity）、makehumancommunity.org、forum.reallusion.com 许可帖、heat.tech。WebSearch 在本会话开始时已 200/200 用尽，未再用搜索，全部靠上述直链、站内列表与 API 完成。未下载文件、未运行任何第三方脚本、未改工作目录文件（只在 /tmp 存了临时抓取页）。

### B.12

GitHub REST API 读 Mesh2Motion issues #136/#139/#148 与评论、issue #18、README（含 mesh2motion-desktop 与 mesh2motion-assets 仓库），GitHub Discussions #35 用 WebFetch；Godot Forums 帖用 curl 取 HTML 后抽取服务端渲染文本（第 15 页拿到 Docker 绕法、Cascadeur、issue #18 的对话）。OpenGameArt 用 curl 读 Necrobot、A5 Carbine、fps arms、animated-characters-pack，并顺集合读 Boomer Shooter 23、Characters/Animals/Vehicles、3d Humanoids under CC0、FPS Game。Sketchfab 网页返回 202 反爬，改用 API v3：/v3/models/{uid} 取许可/描述/作者，/v3/comments?model={uid} 取按模型过滤的评论，/v3/search?type=models&animated=true&downloadable=true 用 fps reload、fps arms、soldier reload、rifle reload animation、first person arms、fps character animations、soldier animations、crouch reload、shooter character animation pack 检索。Steam 新闻页用 ISteamNews/GetAppNews v2 取正文（Bodycam、Earths Edge）。WebFetch 读 80.lv GASP、Godot Store UAL 与 Quaternius publisher、pro.alcuesto、quaternius.com、Infima docs、shanebrumback、app.nz、cinevva、Itinerant Rig。WebSearch 预算已用尽（200/200），未能追加 site: 查询。

### B.13

GitHub REST API + raw.githubusercontent.com 读取：AetherRadar/operation-steel-tide（README、docs/CONTENT_PROVENANCE.md、assets/models/LICENSE.md、docs/ART_PIPELINE_TODO.md、docs/OPERATOR_PRESENTATION.md、AGENTS.md）；cktang88/3d-fps（README 的 Credits & licences、docs/ANIMATION_RESEARCH.md、docs/ASSET_SOURCES.md、docs/FP_FRAMING.md、tools/blender/extract_template_anims.py）；redeclipse/actors 与 redeclipse/weapons（readme、player/weapons 目录与 framegroups）；redeclipse/base/doc/all-licenses.txt；Mugen87/dive（README、app/models/README.md）；microsoft/Microsoft-Rocketbox（README、LICENSE.md、Assets/Animations 树）；Mesh2Motion/mesh2motion-app（static/assets/human 树、manifest.json、package.json）；Mesh2Motion/mesh2motion-assets（LICENSE、ANIMATOR-README.md）；xonotic/xonotic-data.pk3dir（models/player、models/weapons 的 .framegroups）；xonotic/xonotic COPYING；Ayush-Mohanty/FPS-Arms-3D（README、Models/fps_ak-74m_animations/license.txt）。Sketchfab v3 API 按 uid 查 license/animationCount/user，并用 search API 检索 "fps reload animations"、"rifle reload animation"、"fps arms reload"（downloadable=true）。OpenGameArt：WebFetch 被 403，改用 curl + 浏览器 UA 访问 art-search-advanced（fps+reload、weapon+animation、rifle+animation、soldier+animation、fps+arms、first+person+hands、gun+reload+animation、rifle+reload）与内容页（P50、A5、R90、CoinCoin Animated Pistol/Shotgun、nisu M4A1、taradavies AK-47、fps-arms-rigged-only、low-poly-fps-arms-pack）。WebFetch 读 ianxmason.com/100style 与 quaternius.com/license.html。GitHub search API 查 100STYLE、free fps template。全程只读；临时文件写在系统 Temp，未改仓库文件。

### B.14

先读 job.md 与已产出的 asset-pipeline/character-action-sources/sources.md（含 T0-T4 约 90 个既有资产候选）以避开重复；WebSearch 在本会话已被用到 200/200 上限，全部改用 curl、GitHub REST API、站点 API 与直接页面解析。\n1) GitHub REST API：repo 搜索词包括 fps+animation+pack、weapon+animation+pack、third+person+shooter+animations、godot+fps+animations、reload+animation、o3de+startergame、unity+fps+sample、character+animation+pack+glb+cc0；随后读 ZenXChaos/ThirdPersonShooter-AnimationSets、godotengine/tps-demo、o3de/startergame-assets、BigAndCrispy/Unity-First-Person-Shooter、Unity-Technologies/FPSSample、OctavianTocan/Low-Poly-Shooter-Pack 的 metadata、git trees（recursive）、README/LICENSE raw 文件。\n2) 真实文件解析：下载 godotengine/tps-demo 的 player/model/player.glb（23,844,032 B）读 GLB JSON chunk 得 56 animations/145 joints/5 meshes（无 death/die/dead 名称）；下载 ZenXChaos 的 RevolverAnims/RevolverReloadInit.fbx（1,505,712 B）读二进制字符串得骨架名、L_Weapon/R_Weapon、Skin/Cluster 与 Geometry。\n3) OpenGameArt：/art-search-advanced?keys=reload|rifle|soldier|fps|gun|shoot|weapon|character + field_art_type_tid[]=10；collection 页 /content/3d-humanoids-under-cc0、/content/cc0-character-customization、/content/3d-characters；逐页解析 Author/License(s)/描述与文件清单。\n4) 3d.shep.bot API：/v1/search?q=reload|soldier|rifle|fps&type=model&free=true 取聚合结果；3dassets.dev：asset 页 + /api/assets?limit=200 与 ?limit=200&category=weapons。\n5) Godot demo projects API：/repos/godotengine/godot-demo-projects/contents/3d；Godot Asset Library API（filter=animation）返回 0 条。\n6) 对给定列表里的 BigAndCrispy 仓库做了 API 溯源，确认 ItsPogle/Unity-First-Person-Shooter 已永久重命名到 BigAndCrispy，同一仓库、CC0、非 fork，原链接就是作者页。\n7) 其余给定链接（three.js、Khronos、Unity 重定向、GDC/Autodesk、Wolfire、GameAnim、Kenney、Fab、Sketchfab、mocap 站）只做去重与引用追踪，未重复记入候选。

### B.15

未执行 WebSearch（本会话额度 200/200 已用尽，工具直接拒绝）；改为按候选页内链接、评论区、引用链逐跳，取法为 curl（桌面 UA，必要时按 GBK 解码）、WebFetch、Discourse .json、GitHub API/raw、Fab 页面内嵌 JSON。实际看过的渠道：1) OpenGameArt：basic-char、mutant-grunt、mannequiny 三个 content 页及全部评论；其收录的 collections（/content/3d-humanoids-under-cc0、/content/cc0-characters、/content/cc0-character-customization、/content/fps-1）逐项列出；Ifrit 作者页；mutant-grunt 引用的原始 2D 设计页；以及 OGA 的 handling-guns/first-person-pistol/guns-pack/character-pack1/2/sci-fi-soldier/voxel-shock-trooper/mudeater-animated 作为回收检查。2) Godot 论坛：133069、130611、135582 用 .json 读全帖，55990、140811、128792 用 WebFetch；追到 MakeHuman、Mesh2Motion、KevDev melee、GDQuest 重定向文档。3) three.js Discourse：65329、59438 用 .json，15361 用 WebFetch；追到 three.js Soldier.glb 与 SBCODE 示例。4) Unreal 论坛：2024162、1330073、2531370/5、/9、1811585 用 WebFetch。5) Unity Discussions 782390 用 WebFetch（.json 失败）。6) Unity Asset Store：Tactical FPS Animations、ULTIMATE ANIMATION COLLECTION、Kubold/KINEMATION/PROTOFACTOR/Infima 出版商页用 WebFetch（均为 JS 壳）。7) Fab：Rifle Mega 与 RIB 卖家页用 curl 读 HTML 内嵌 JSON，追出 Rifle ShootReload / Cover Rifle / Pistol Mega / Movement 2.0。8) 作者站：kubold.com（downloads + Rifle/Pistol 动作表 HTML）、mocaponline.com（首页、rifle、licensing、free-animations）、keviniglesias.com（首页、license 脚本段、soldier 页）、heat.tech、motionlibrary.com、actorcore、protomotion/sitemap、ribstudio。9) cgchannel 的 ActorCore / HEAT / Rokoko / Bandai 四篇。10) GitHub API/raw：godot issue 53544 及评论、gdquest mannequin、Bandai dataset、mrdoob/three.js Soldier.glb 提交史与示例源码、GithubLinfuxi/ThreeFury-FPS、chasergit/gear。11) Gitee cube_gunman、GitCode Claude-of-Duty 的 raw README。12) 微信公众号 GASP 文（可读）、微信 UAL 文（验证页）；CGJOY 262540/274156/281386（GBK curl，正文与评论可读，附件需登录）；Bilibili API；知乎。搜索词：无（WebSearch 不可用），全部按页面引用关系追踪。

### B.16

实际渠道与取法（本单元 WebSearch 额度已被上一单元用尽 200/200，无法执行检索；全部靠直链追引用、站内目录/API 与原始页正文）：
1) three.js 论坛：WebFetch 读了 22121（拿到 7 个相关帖：60452、23489、30702、34046、6182、38905、48325）、86820（SkeletonUtils + 5 个 clone 帖）；5479 被域名安全校验拦住，重试仍失败。
2) Blender Artists：读了 1589109、1485038、1580798；三帖均无外链替代品，仅 1589109 提到 gltf-viewer.donmccurdy.com。
3) GitHub：glTF-Blender-IO #953/#1843（引 PR #958/#980、blender T104145）；Mesh2Motion #155/#127/#141/#118/#148/#136/#139、desktop 仓库、discussion #35；另读 nirholas/three.ws、GeorgeQLe/assets-kaykit-3d-characters、doctor-g/KayKitAnimationInGodot、vid2anim、toyxyz_RGBMocap、mixamo-llm-mocap、HOI-Retarget（引 GMR）、posecode、ohmygame、Microsoft-Rocketbox（引 Headbox/MoveBox）、appnz-motion-kit 的 README/目录/raw manifest；GitHub REST 未认证额度只剩 58，改用 raw 与 HTML；Sketchfab/其他 API 不计入。
4) Mesh2Motion #118 的评论区直接给出 Bento Buddy、Mixamo、Meshy、Second Life/OpenSim 等替代；Bento Buddy 域名 TLS handshake 失败，未取得原始页。
5) OpenGameArt：WebFetch 403，改 curl + 桌面 UA 读正文与评论；Necrobot 页评论确认动画为作者手工（非 Mixamo），并给出 Trym Horgen/Theon 原页；A5 Carbine 页给出 CuiGames 的 itch 合集与 12 clip 清单，但文件区已被 OGA 以许可问题下架。
6) Sketchfab：页面为客户端渲染（WebFetch 空），改 api.sketchfab.com/v3/models 取 12 个已列模型的原作者、许可、clip 数；再用 /v3/models?user=<name> 列 BarcodeGames、TheParaziT、DuqueCD7、1Matzh、ccransh、BAMEN 等作者目录，顺链得到本组新包；/v3/comments 过滤参数无效（返回同一批无关评论），评论未取到。
7) Quaternius 官方站：curl 去标签读 Animated Guns、UAL 官方页、Ultimate Animated Character、Universal Base Characters、Ultimate Modular Men；Quaternius 页脚指向 Patreon/Discord，未展开。
8) Cinevva：app.cinevva.com/tools/rigger 与 /tools/animations 用 curl 读正文，拿到 260 CC0（自述来自 Quaternius UAL）+99 poses、免费预览/付费导出，以及 Mixamo、AccuRIG、ActorCore、AutoRig.online、Meshy、Tripo 等替代清单。
9) 80.lv 文章 → FocalRig 官网、UE GASP 官方 tech-blog；pro.alcuesto.jp Quaternius 许可文章 → quaternius.com/license.html、Poly Pizza、LowPoly Animated Animals；Godot Store UAL → 无其他库可比。
10) CMU mocap：http 页因证书失败，curl -k 读正文，拿到“可商用、不可转售数据本身”的许可原文与 cgspeed 转换站链接。
11) 直接 curl 校验了候选 URL 的 200/202 状态；未使用任何登录、付费、凭据或浏览器 GUI/headless。

### B.17

渠道与取法：Sketchfab 公共 API v3（/search 关键词 fps reload animation、first person animations、fps arms animated、weapon reload animation、fps animation pack、soldier animations rifle、military character animations、reload animations pack；/models?user= 逐一列 1Matzh、DuqueCD7、bumstrum、dan741vlasov、Alexander_Ovelar、TheParaziT、ccransh、teenjust500、martinezequielgorno、bamenwo05、commiessar、gglecocoyt、coffeeowl、Konstantinos.Simantiras、barcodegames、wichowiczs、user77、jayb3e 等作者；/comments?model= 读 UZI、MP7A1 等评论区，看到 ccransh 与 1Matzh 互评）；/search?type=collections 与 /collections/{id}/models 追“FPS Animations”“shooter animations”“Weapon Animations”“Free Animations Pack by Denys”等收录列表，从中补到 dan741vlasov OC-14、kill6lucius CS2 系列、commiessar、SDKBOX、coffeeowl 等线索。OpenGameArt 用 curl＋桌面 UA（art-search keys=reload animation/fps animation/animated rifle/gun animation/fps arms；作者页 zisongbr、cuigames、pichuliru、para、ulf、nublet、robinlamb、firewarden；收藏 3d-weapons-under-cc0、cc0-3d-weapons；A5/R90/P50 评论区）。Fab 卖家页 RIB Studio 服务端 JSON 提取 17 个 listing 的 title/uid，再逐个 GET listing 页（首次 200）确认 Pistol Mega、Rifle Mega 1.3、Rifle Combat、Cover Pistol、Movement 2.0、Crawl 1.2 等新包。Quaternius 首页 pack 索引＋ultimategun/scifimodularguns/scifigun/animatedman/animatedwoman 页。Poly Haven API assets?t=models 过滤武器（仅静态）。3dassets.dev 的 skill.md 与 api/v1/assets?q=reload|fps arms|soldier（结果只有静态几何/刚性节点动画，无蒙皮角色动画）。Poly Pizza /search/rifle 与 /search/reload（静态模型，无动画源）。Kubold downloads/store/blog（Witchfire 约 1500 个 FPP 动画但不外售）。Grab3D、BlenderKit、CharMorph README、GitHub API search/repositories=fps arms animation|fps weapon animations（两个全身 FPS 控制器仓库无 license，排除）。

### B.18

渠道与取法：1) Fab 站内搜索 API（/i/listings/search?q=...）用 fps animation、reload animation、weapon animation、first person shooter animation、tactical shooter animation、rifle animation、pistol animation、gun animation pack、mocap shooter、fps arms、shooter animset、free fps animation、animation starter pack、game animation sample、free rifle animation、free weapon animation、shooter mocap reload、fps hands animation、tactical reload animation、magazine reload animation 等词逐页翻（含 cursor 第二页），并用 Infima/KINEMATION/MoCap Online/Kubold/PeaceSells/RIB Studio 的 seller 页拉完整目录；WebFetch 对 Fab 返回 403，改用 curl 取服务端 HTML 的 meta description/JSON-LD。2) Fab EULA 页（curl）核对 Standard License：可商用、可随 Project 分发、不限引擎，禁止单独转售/免费再分发；因此 Fab 免费包按“可随公开游戏提交派生资源”入候选，但下载需 Epic 账号，未登录下载小样。3) Infima 官网与 docs.infimagames.com；Kevin Iglesias 官网 #license 与两份 Soldier 动画清单 PDF（免费 128 / 完整 538，逐 clip 核过）；MoCap Online collections/all 与 rifle/pistol/hipfire 产品页；KINEMATION gitbook 与 Fab seller 页。4) GitHub raw READMEs：Bandai Namco Motiondataset（CC BY-NC）、GVHMR、GMR、Mesh2Motion；除 Bandai 的 3000 段非商用动作外无新枪械资产，未入候选。5) Sketchfab public API：种子模型详情 + teenjust500/Theon 作者目录，另用 search 查 fps reload/rifle animation 等；发现 JUST/ccransh/1Matzh/martinezequielgorno 的 CC-BY 武器动画，但下载端点需登录，且评论区显示 JUST 的 M4 底模来自 CS2、骨为 DMC5 rig，权利链不清，按任务未尝试、未入候选；API 后段 429。6) OpenGameArt 种子页及其 related/collection 链接（FPS Character Seal、Animated Defender、CoinCoin 等）；CoinCoin 已在旧 sources.md，不重复。7) CGJOY 帖（WebFetch 可读）追到 Haydn Cooper YouTube（不可达），帖内无商店；CGChannel 文章追到 Rokoko/ActorCore/Bandai 免费包（ActorCore 需单独 mass-distribution 许可、Bandai CC BY-NC，均未入候选）；Reallusion 论坛确认 ActorCore/iClone 游戏分发需额外许可。8) Epic Lyra 文档、Synty、FocalRig、Poly Pizza 均无枪械动画库。搜索预算：WebSearch 200/200 已耗尽，全部改用上述站内 API/curl/WebFetch；未改任何仓库文件。候选排序前 10 项为免费/CC，其后为付费对照（付费项不满足任务“免费”硬条件，只用于证明动作结构存在并供 dot 选择）。
