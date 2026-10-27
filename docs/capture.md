# 固定状态拍摄（独立候选）

**用途：可靠比较整场院落的灯光、雾与材质，不代表这些品质已经改善。** 本实现从正式 `a97d57281dd6c6d941c6a6bef732dadf2953f2f4` 分出，不包含移动—制动—射击候选，不改模拟、控制器、场景资产或正式网站。

## 当前场景不是“没有光照”

核对 `src/render/scene.ts`：已有强度 2.1 的蓝天／冷地 HemisphereLight、强度 2.6 的暖 DirectionalLight（Three 坐标 `(-8, 18, -4)`）、与天空同色的 32–80 距离雾和 sRGB 输出。地面是已有混凝土纹理与 mip 链；墙面已有墙裙／收边色带，物体用 MeshStandardMaterial。本候选完全保留它们。当前没有 `scene.environment` HDRI/PMREM、后处理链，也没有启用实时投射阴影；后续灯光层应在这个真实基线上改，不能按“从无到有”记功。

## 路径隔离

- 无 `shot` 参数：仍懒加载原 `src/client.ts`；没有 `__shot`、`__shotNext`，保留真实时钟、鼠标锁定、音频与原控制器。单独出现 `seed` / `t` / `frames` 不激活拍摄。
- 显式 `?shot=…`：懒加载独立 `src/capture/client.ts`。不构造 Controls、不请求鼠标锁定、不启动 rAF、不读写真实用户设置，也不解锁音频。退出靠**移除参数并重新加载**，不能在同一局里切成作弊镜头。
- 使用原 Game.step、原规则、原出生点、原默认 easy 机器人。种子 1 的机器人随机种子与正式客户端一致；其他 seed 以固定异或派生。不注入坐标、HP、弹药、敌方信息、无敌或冻结敌人。
- 固定机位只覆盖渲染相机；不修改 Actor 或物理世界。观察机位不画本地第一人称枪体（本作也没有自己的第三人称模型）；`gameplay` 原样画枪和真实玩家眼高。全部保留原 80° 竖直 FOV。
- 非 persisted 的 `pagehide` 立即撤销步进接口并释放 View／Game／Navigation。异步初始化晚到的资源会被立即释放；bfcache 的 persisted pagehide 保留已冻结状态，不启动循环。丢失 WebGL 上下文或改变拍摄视口会使结果失效，须重载，不冒用旧帧。

## 命名机位

统一推荐 **1280×720，deviceScaleFactor 1**。位置是模拟坐标（+Z 为 yaw 0 的前方），yaw/pitch 单位为弧度；渲染边界照常反射 Z。

| 名称 | 位置 / 朝向 | FOV | 目的 |
|---|---|---|---|
| `gameplay` | 原玩家实际 eye(position)，yaw / pitch 随命令带；默认 idle 起点 `(0,1.62,-14)`、`(0,0)` | 80° | 正常游玩基线，保留枪与 HUD |
| `courtyard-gap` | `(2.6,1.62,6.4)`；yaw `-0.28`、pitch `-0.04` | 80° | 最大差距机位候选：近地面、分隔墙、点区与远墙同屏 |
| `cross-lane` | `(-7.5,1.62,-9.5)`；yaw `0.32`、pitch `-0.03` | 80° | 斜看外墙、掩体与材质长交界 |

这三处是**依据本地图几何设定的基线机位**，不是已经从 CS2 截图量出的匹配机位，也尚未通过真 GPU 图片构图复评。保持现行 80° 而不偷偷切到参照推导的约 74°；拿到真实截图后才能量人物占屏、地平线和近远层比例。正式 `docs/quality.md` 仍描述正式版本；本候选未采纳，不能用本文件替换品质结论。

## URL 与时钟契约

```text
/?shot=gameplay&seed=1&t=4&input=advance-fire&frames=120
/?shot=courtyard-gap&seed=1&t=10
```

| 参数 | 默认 / 范围 |
|---|---|
| `shot` | 必填命名机位；缺失走正常游戏，空值、未知名、原型属性名报错 |
| `seed` | 1；uint32，含 0 |
| `t` | 10 秒；0–120 的有限非负小数，四舍五入到最近 1/60 秒；元数据保留 requestedTime 与实际 t |
| `input` | `idle`；也可选 `advance-fire` |
| `frames` | 1；1–3600 的整数（含起始帧） |

重复参数、负数、NaN、Infinity、非法输入带等全部失败关闭，不退回正常游戏。

虚拟时钟只有整数 tick，`now = tick × 1000 / 60`。预推进每 tick 调用真实 Game.step 和原 View/Hud 更新；每 30 tick 让出一次任务队列只为页面响应，不改变时钟。View 的命中／死亡尾部反馈与 HUD 的 CSS 受伤动画同吃这个时钟。每个目标时刻额外渲染 **12 帧，dt=0，状态和虚拟时刻不变**；不把预热当成多推进 12 tick。回合结束后不会私自开下一局，仿真时刻可停止而虚拟呈现时刻继续，元数据分别记 `simTime` / `t`。

`advance-fire` 是公开命令的固定带：tick 0 向右移动，30 向前，180 停步并向前瞄准，192–294 每 6 tick 请求射击，306 请求换弹；射速、碰撞、死亡、弹药和机器人响应仍由正式模拟决定。它不是 CS2 手感对照，也不保证每发命中。

拍摄完成后：

```js
window.__shot // { ready, renderer, rendererClass, frame, t, virtualTick,
              //   seed, input, stateHash, simTick, simTime, camera, viewport, ... }
window.__shotNext(window.__shot.frame) // 截取后确认，前进一步；最后一帧返回 false
```

`frame=0` 对应 t，下一帧才加 1/60 秒。等待截图、页面在后台或软件渲染很慢都不推进。带旧 frame 的重复确认报错且不推进。`renderer` 保留 `WEBGL_debug_renderer_info` 原串；缺扩展时保留普通 GL.RENDERER 串并降级不确定性。

## 截图与逐帧脚本

```sh
npm ci
# 默认本次重建再起本地 preview，不复用来源未知的旧 web-dist。
# DEBUG 日志保存实际 argv；不在脚本里关闭 sandbox。
DEBUG=pw:browser node --import tsx tools/capture.mjs \
  --shot all --seed 1 --t 10 --repeat 2 --headed --require-gpu --check-live

# 云端没有 GPU，只能做构图与回归。不能用它决定光照／材质。
DEBUG=pw:browser node --import tsx tools/capture.mjs \
  --shot all --seed 1 --t 10 --repeat 2 --software

# 连续射击片段；每帧等消费者截取后再推进，输出 00000.png 起的序列。
node --import tsx tools/capture.mjs --shot gameplay --seed 1 \
  --input advance-fire --t 3 --frames 240 --repeat 2 --headed --require-gpu
ffmpeg -framerate 60 -i 'outputs/capture/<本次序列目录>/%05d.png' \
  -c:v libx264 -pix_fmt yuv420p capture.mp4
```

Windows shell 可直接执行 `node --import tsx …` 并按该 shell 语法设置 DEBUG。可用 `FPS_CAPTURE_CHROMIUM` 指定已安装的 Chromium；不填则使用 Playwright `channel: chromium`。`--out` 改输出目录；`--base` 可连已有服务，但报告会明确标为**外部服务源 SHA 未证实**，不能用本地 SHA 冒充服务器版本。不要把私有服务地址、完整本机路径或浏览器启动日志提交公开仓库。

每次输出 `report.json`、逐帧 JSON/PNG，包含本地源码 SHA、工作树 dirty 标志、构建绑定、浏览器版本、请求的 launch 配置、原 renderer/vendor/version、完整相机和仿真哈希。文件目录带 `gpu` / `software` / `unknown`、renderer 安全短名及原串哈希，原串仍原样留在 JSON，不靠文件名替代证据。默认每机位两次全新页面拍摄，逐帧比较**RGBA 字节哈希、stateHash、相机、时刻与 renderer**；不是只比较 PNG 压缩字节。帧 0 先等待真实 150ms，再确认状态完全不变。截图前同时等待 boot 遮罩消失。

renderer 分类先识别 SwiftShader、llvmpipe、softpipe、swrast、lavapipe、software、Basic Render 等软件报告，再对 NVIDIA／AMD/Radeon／Intel／Apple GPU 等硬件家族做正向识别；空串、泛化 ANGLE／WebKit／Mesa、虚拟适配器等保持 `unknown`。`--require-gpu` 还要求 debug 扩展实际可读。**这仍是驱动自报身份，不是独立硬件证明**；不得仅用“不是 SwiftShader”推断 GPU。CPU Canvas 回退在拍摄路径明确失败，不能混入灯光证据。

截图不录声音，元数据写 `audio: not-captured`；序列合成视频不等于录到了真实输入延迟、声画同步或真人手感。`--check-live` 仅额外检查无拍摄全局、正常开局推进与 Esc 暂停，完整游玩验收仍用仓库 smoke 和普通操作。

## 本候选实际验证与未完成项

- 类型检查、生产构建通过。完整 106 项测试串行、并行均通过；首次默认并行运行有 3 个测试子进程非断言退出，随后同范围 TAP 重跑全过，原因未确定，不把它说成已定位。
- 其中 13 项新增测试覆盖缺参数／非法参数、渲染器分类、机位不改模拟、固定带与原 Game/Bot 同状态、调度快慢无关、预热不加 tick、逐帧终止／重复确认、进入／离页／晚到资源／失败释放；这不是浏览器图片验收。
- 200 局 seed 1 无画面模拟运行完成；进攻胜率 63.5%，属于既有平衡差距，本候选没有改玩法。
- 软件 Chromium 尝试保留 `chromiumSandbox: true`、精确忽略 Playwright 默认 `--enable-unsafe-swiftshader`；实际启动在 `socket() failed: Operation not permitted` 处失败（同时有 crashpad 目录错误），**0 帧**。未关闭 sandbox、未加 unsafe 标志，未占用其它 GUI 浏览器。
- **未验证：实际浏览器每机位两拍一致、正常浏览器启动／退出、真 GPU 基线、命名机位实际构图、参照配准与品质独立复评。** 下一步只需在有权限的接收环境 checkout 本候选固定 SHA，用上述有窗口 `--require-gpu` 命令取证；同一时间仅跑一个 GPU 任务。本单元不另下任务卡、不推 main、不发布网站。
