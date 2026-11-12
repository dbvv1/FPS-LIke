# 当前离线训练赛质量拍摄入口

这是基于 b6ecc449／Site v16 的测量适配，复用既有 abc139f6 质量拍摄接缝；不是已发布网站的同一源码树。画面对象仍为无 feel 开关的原训练赛及标准件。固定源码以执行批次记录的完整 Git SHA 为准；本页不代表截图已取得或质量已通过。

使用完整参数：

```text
?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1&art=standards-v1&qualityCapture=gameplay
```

`qualityCapture` 只接受三个现有命名机位（沿用 `src/capture/cameras.ts`，FOV 80°）：

| 机位 | 内容 | 位置 / 朝向 |
|---|---|---|
| gameplay | 真实玩家眼位与现有枪体；PNG 不含 DOM HUD／六回合标题 | 读取回放后的实际玩家姿态 |
| courtyard-gap | 固定观察机位，不证明玩家可到达；不显示枪体/HUD | (2.6,1.62,6.4)，yaw −0.28，pitch −0.04 |
| cross-lane | 固定观察机位，不证明玩家可到达；不显示枪体/HUD | (−7.5,1.62,−9.5)，yaw 0.32，pitch −0.03 |

分辨率固定 1280×720、DPR 1，不接受旧 `shot`、`artCapture`、feel、smoke 或自定义 seed/t/input/frames。正常入口不变，不恢复旧 artCapture 观察入口；拍摄入口不绑定游戏键鼠、不启动 rAF、不外部注入状态。使用原离线 `Game`、地图、9 个 Bot、难度 easy、seed 1；玩家每 tick 提交零移动命令。真实规则推进 120 tick（2 秒），同状态预热 12 次（dt=0），不是旧 1v1 的 10 秒拍摄。空闲输入不是枪感测试或目标动作测量。

## 页面接口

- `window.__shot`：只读深拷贝。`ready/error/build/name/t/frame/hz/stateHash/state/commands/botIds/replay/viewport/actualPlayerPose` 等是当前状态；build 为 bundle URL，执行端须另记固定源码 SHA、完整 bundle 清单。`stateHash` 沿用模拟层 gameplay hash，排除 shot impact 等表现字段，不是完整状态或像素哈希；像素一致性须另外比较实际截图。`match.summary`（页面字段 `match`）只统计已结束回合，初始 tick 120 时记录为 0，不能据此声称已完成六回合。
- `renderer`：仅 debug extension 可用时提供原始 unmasked renderer 字符串，否则空串。`rendererEvidence` 保留 vendor/version/unmasked/rendererClass 等原始证据；不得把 unknown 当 GPU。
- `renderInfo.render`、`renderInfo.memory`：直接读同一 Three renderer 的原始计数，包括 calls/triangles/points/lines、geometries/textures；不是全局显存、GPU 时间或实测 FPS。计数仅覆盖 Three 场景的渲染调用，不包含 DOM HUD 的浏览器合成成本；`gl.finish` 用于拍摄帧完成，不据该接口运行耗时推导玩家帧率。
- `window.__shotNext()`：只推进一个固定 1/60 秒的正常模拟 tick，然后用同一渲染器渲染，frame 加一并返回快照。只允许当前回合；自然结束时报错停止，不暗中跳下一回合。初始 frame=0、t=2。输入和渲染时钟均确定；CSS 反馈动画也由此虚拟时钟推进。
- 状态包含 observer/player 区别；不得把两个固定观察机位写成实际玩家站位或有枪体 HUD。

资源未 ready/回退、窗口尺寸改变、上下文丢失、页面离开都会报错并释放资源，不能把错误页面当截图成功。实际取图必须同时确认 `__shot.ready`、`state` 已就绪、`renderInfo.art.active` 为 true 且启动遮罩 `#boot` 已隐藏，不能仅等 ready。重复拍摄需重新载入，在独占输出目录记录每机位至少两次的状态与命令哈希、原始 renderer、像素差、构建绑定。浏览器端实际验证由独立批次执行；CPU 测试与构建不证明画面存在、正确或达标。音频未接入此拍摄入口，不能用于声音同步判定。

`qualityParameters` 记录实际 renderer 的 toneMapping、exposure、outputColorSpace 和 shadowMap enabled/type；不从光照观感猜配置。此路由拒绝 feel/smoke，避免把旧匀速回放误标为 ground-v1；手感旁置及真实游玩时钟不改变。

## 本机成对采集命令

当前训练赛使用仓库内的入口，不复用硬编码旧 SHA 的本机临时脚本：

```sh
node --import tsx tools/capture-quality-pair.mjs --sha <完整40位提交SHA> --out outputs/quality-pair-unique
```

在该 SHA 的干净 worktree 内用已有依赖执行，输出父目录须已存在，最终目录必须不存在。脚本先核 HEAD／tree、重新构建并记录产物 SHA256，再顺序采集当前默认与全场 `ai-courtyard-full-v1`。三个机位各双拍，共12张1280×720 PNG；固定 `courtyard-light-v1`、DPR1、seed1、tick120、frame0，无 `__shotNext` 调用。逐图保留除图片数据URL之外的原metadata，并校验同组RGBA及前后状态／相机／命令／renderer。默认和后图共用同一现成 Chromium，保sandbox、仅headless SwiftShader；`FPS_CAPTURE_CHROMIUM` 可指定已装二进制，实际启动argv另保留 `DEBUG=pw:browser` 原始日志并脱敏。

任一图失败即停止后续拍摄，仍尝试关闭本次browser与preview并写失败report；清理失败不能报passed。不改本机设置、不安装依赖、不覆盖旧产物。本入口只取固定画面；完整整局smoke、帧耗和非作者盲选分别接收，CPU编排测试不是实际出图证据。
